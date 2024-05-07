import mongoose from 'mongoose';
import User from '../models/User';

export default async function storeGame(secret, xp, timeTaken, latLong) {

  console.log('storeGame', xp, timeTaken, latLong);
  // Connect to MongoDB
  if (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(process.env.MONGODB, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    } catch (error) {
      return { success: false, message: 'Database connection failed' };
    }
  }
  if(!secret || !xp || !timeTaken || !latLong) {
    return { success: false, message: 'Missing required fields' };
  }
  if(typeof xp !== 'number' || typeof timeTaken !== 'number' || typeof latLong !== 'object') {
    return { success: false, message: 'Invalid input types' };
  }
  if(latLong.length !== 2 || typeof latLong[0] !== 'number' || typeof latLong[1] !== 'number') {
    return { success: false, message: 'Invalid latLong format' };
  }

  const user = await User.findOne({ secret });
  if(user.banned) {
    return { success: false, message: 'User is banned' };
  }
  if (!user) {
    return { success: false, message: 'User not found' };
  }

  // Store the game data
  try {
  user.games.push({
    xp,
    timeTaken,
    latLong,
    time: new Date(),
  });
  user.totalGamesPlayed += 1;
  user.totalXp += xp;
} catch (error) {
  return { success: false, message: 'An error occurred', error: error.message };
}
  await user.save();
  return { success: true };


}
