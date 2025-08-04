import User from '../models/User.js';
import UserStatsService from '../components/utils/userStatsService.js';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { secret, days = 30 } = req.body;

    if (!secret) {
      return res.status(400).json({ message: 'Secret is required' });
    }

    // Find user by secret
    const user = await User.findOne({ secret });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get user's stats progression - all available data
    const progression = await UserStatsService.getUserProgression(user.secret);

    return res.status(200).json({ 
      progression,
      userId: user.secret,
      username: user.username 
    });
  } catch (error) {
    console.error('Error fetching user progression:', error);
    return res.status(500).json({ 
      message: 'An error occurred', 
      error: error.message 
    });
  }
}