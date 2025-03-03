// pages/api/checkNameChange.js
import User from '../models/User.js';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Extract the token from the request body
  const { token } = req.body;
  if (typeof token !== 'string' || !token) {
    return res.status(400).json({ name: null });
  }

  try {
    // Find user by the provided token
    const user = await User.findOne({ secret: token });
    if (!user) {
      return res.status(404).json({ name: null });
    }

    // Check if the username was changed within the last 24 hours
    if (user.lastNameChange && Date.now() - new Date(user.lastNameChange).getTime() < 24 * 60 * 60 * 1000) {
      return res.status(200).json({ name: user.username});
    }

    res.status(200).json({ name: null });
  } catch (error) {
    res.status(500).json({ name: null });
  }
}
