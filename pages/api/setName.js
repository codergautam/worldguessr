// pages/api/setName.js
import mongoose from 'mongoose';
import User from '../../models/User';
import { Webhook } from "discord-webhook-node";

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
  const { token, username } = req.body;
  if (!token || !username) {
    return res.status(400).json({ message: 'Missing token or username' });
  }

  // Ensure username meets criteria
  if (username.length < 3 || username.length > 30) {
    return res.status(400).json({ message: 'Username must be between 3 and 30 characters' });
  }
  // Alphanumeric characters and underscores only
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ message: 'Username must contain only letters, numbers, and underscores' });
  }
  // Make sure the username is unique (case-insensitive)
  const lowerUsername = username.toLowerCase();
  // quey check for username (case-insensitive)
  const existing = await User.findOne({ username: { $regex: new RegExp(`^${lowerUsername}$`, 'i') } });
  if (existing) {
    return res.status(400).json({ message: 'Username taken' });
  }

  try {
    // Find user by the provided token
    const user = await User.findOne({ secret: token });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update the user's username
    user.username = username;
    await user.save();

    try {
      if(process.env.DISCORD_WEBHOOK) {
        const hook = new Webhook(process.env.DISCORD_WEBHOOK);
        hook.setUsername("WorldGuessr");
        hook.send(`🎉 **${username}** has joined WorldGuessr!`);
      }
    } catch (error) {
      console.error('Discord webhook failed', error);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message, success:false });
  }
}
