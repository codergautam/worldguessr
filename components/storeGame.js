import mongoose from 'mongoose';
import User from '../models/User';
import ratelimiter from "./utils/ratelimitMiddleware";

async function storeGame(secret, xp, timeTaken, latLong) {

  // Connect to MongoDB
  if (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(process.env.MONGODB);
    } catch (error) {
      return { success: false, message: 'Database connection failed' };
    }
  }
  if(!secret || !xp || !timeTaken || !latLong) {
    return { success: false, message: 'Missing required fields' };
  }
  if(typeof secret !== 'string' || typeof xp !== 'number' || typeof timeTaken !== 'number' || typeof latLong !== 'object') {
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

// Limit to 1 request per 5 seconds over a minute, generous limit but better than nothing
export default ratelimiter(storeGame, 12, 60000)