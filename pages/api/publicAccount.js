import mongoose from 'mongoose';
import User from '../../models/User';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Connect to MongoDB
  if (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(process.env.MONGODB, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    } catch (error) {
      return res.status(500).json({ message: 'Database connection failed', error: error.message });
    }
  }

  // Extract the token and username from the request body
  const { id, secret } = req.body;
  if (!id && !secret) {
    return res.status(400).json({ message: 'Provide at least one of the following: id or secret' });
  }
  if (id && secret) {
    return res.status(400).json({ message: 'Provide only one of the following: id or secret' });
  }

  try {
    // Find user by the provided token
    const user = id ? await User.findById(id) : await User.findOne({ secret });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get public data
    const publicData = {
      username: user.username,
      totalXp: user.totalXp,
      createdAt: user.created_at,
      gamesLen: user.games.length,
    };

    // Return the public data
    return res.status(200).json(publicData);
} catch (error) {
    return res.status(500).json({ message: 'An error occurred', error: error.message });
  }
}
