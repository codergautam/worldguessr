import User from '../models/User.js';
import UserStatsService from '../components/utils/userStatsService.js';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { userId, username } = req.body;

    // Accept either userId or username
    if (!userId && !username) {
      return res.status(400).json({ message: 'UserId or username is required' });
    }

    // Find user by userId or username
    let user;
    if (userId) {
      user = await User.findOne({ _id: userId });
    } else if (username) {
      user = await User.findOne({ username: username });
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Exclude banned users and users with pending name changes (public API security)
    if ((user.banned === true || user.pendingNameChange === true) && !userId) {
      // Only apply this check for username-based requests (public access)
      // Allow userId-based requests (authenticated user viewing their own data)
      return res.status(404).json({ message: 'User not found' });
    }

    // Get user's stats progression - all available data
    const progression = await UserStatsService.getUserProgression(user._id);

    return res.status(200).json({
      progression,
      userId: user._id,
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