import mongoose from 'mongoose';
import User from '../models/User.js';
import { config } from 'dotenv';

// Load environment variables
config();

// Connect to MongoDB
await mongoose.connect(process.env.MONGODB);

async function convertGameCounts() {
  console.log('Converting existing totalGamesPlayed counts from rounds to games...');
  
  // Count users with totalGamesPlayed > 0
  const usersWithGames = await User.countDocuments({ 
    totalGamesPlayed: { $gt: 0 }
  });
  
  console.log(`Found ${usersWithGames} users with game counts to convert`);
  
  if (usersWithGames === 0) {
    console.log('No game counts to convert');
    return;
  }
  
  // Convert totalGamesPlayed from individual rounds to 5-round games
  const result = await User.updateMany(
    { totalGamesPlayed: { $gt: 0 } },
    [
      {
        $set: {
          totalGamesPlayed: {
            $floor: { $divide: ["$totalGamesPlayed", 5] }
          }
        }
      }
    ]
  );
  
  console.log(`Converted ${result.modifiedCount} users:`);
  console.log('- totalGamesPlayed = Math.floor(totalGamesPlayed / 5)');
  console.log('- Converted from individual rounds to 5-round games');
  console.log('- APIs will now show correct game count');
  
  // Show some example conversions
  const sampleUsers = await User.find({ 
    totalGamesPlayed: { $gt: 0 } 
  }).limit(5).select('username totalGamesPlayed');
  
  console.log('\nExample conversions:');
  sampleUsers.forEach(user => {
    const oldCount = user.totalGamesPlayed * 5; // What it was before
    console.log(`- ${user.username || 'User'}: ${oldCount} rounds → ${user.totalGamesPlayed} games`);
  });
}

// Run the conversion
try {
  await convertGameCounts();
  process.exit(0);
} catch (error) {
  console.error('Conversion failed:', error);
  process.exit(1);
}