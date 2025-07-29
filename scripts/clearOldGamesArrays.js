import mongoose from 'mongoose';
import User from '../models/User.js';

// Connect to MongoDB
await mongoose.connect(process.env.MONGODB);

async function clearOldGamesArrays() {
  console.log('Clearing old games arrays to save space...');
  
  // Count users with games arrays
  const usersWithGames = await User.countDocuments({ 
    games: { $exists: true, $not: { $size: 0 } }
  });
  
  console.log(`Found ${usersWithGames} users with old games arrays`);
  
  if (usersWithGames === 0) {
    console.log('No games arrays to clear');
    return;
  }
  
  // Remove games field entirely
  const result = await User.updateMany(
    { games: { $exists: true } },
    { $unset: { games: "" } }
  );
  
  console.log(`Removed games field from ${result.modifiedCount} users`);
  console.log('Space saved! Old games field and data completely removed.');
}

// Run the cleanup
try {
  await clearOldGamesArrays();
  process.exit(0);
} catch (error) {
  console.error('Cleanup failed:', error);
  process.exit(1);
}