import User from '../models/User.js';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Extract the token and username from the request body
  const { id, secret } = req.body;
  // secret must be string
  if ((id && typeof id !== 'string') || (secret && typeof secret !== 'string')) {
    return res.status(400).json({ message: 'Invalid input' });
  }

  if (!id && !secret) {
    return res.status(400).json({ message: 'Provide at least one of the following: id or secret' });
  }
  if (id && secret) {
    return res.status(400).json({ message: 'Provide only one of the following: id or secret' });
  }

  try {
    // Find user by the provided token
    const user = id ? await User.findById(id).cache(120) : await User.findOne({ secret }).cache(120);
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
