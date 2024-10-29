import mongoose from 'mongoose';
import User from '../models/User.js';
import { getLeague } from '../components/utils/leagues.js';

// given a username return the elo and the rank of the user
export default async function handler(req, res) {
  const { username } = req.query;
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Connect to MongoDB
  if (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(process.env.MONGODB);
    } catch (error) {
      return res.status(500).json({ message: 'Database connection failed', error: error.message });
    }
  }

  try {
    // Find user by the provided username
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }


    // Return the user's elo and rank
    return res.status(200).json({ elo: user.elo, rank: user.rank, league: getLeague(user.elo) });
  } catch (error) {
    return res.status(500).json({ message: 'An error occurred', error: error.message });
  }
}
