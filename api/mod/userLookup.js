import User from '../../models/User.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { secret, username } = req.body;

  // Validate secret
  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid secret' });
  }

  try {
    // Verify requesting user exists
    const requestingUser = await User.findOne({ secret });
    console.log('requestingUser', requestingUser, secret);
    if (!requestingUser || !requestingUser.staff) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    let targetUser;

    // If username is 'self', return the requesting user's data
    if (username === 'self') {
      targetUser = requestingUser;
    } else {
      // Validate username for other lookups
      if (!username || typeof username !== 'string') {
        return res.status(400).json({ message: 'Invalid username' });
      }

      // Find target user by username
      targetUser = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
      if (!targetUser) {
        return res.status(404).json({ message: 'User not found' });
      }
    }

    return res.status(200).json({
      targetUser: {
        username: targetUser.username,
        secret: targetUser.secret,
        _id: targetUser._id,
        totalXp: targetUser.totalXp,
        totalGamesPlayed: targetUser.totalGamesPlayed,
        elo: targetUser.elo,
        created_at: targetUser.created_at,
        banned: targetUser.banned,
        staff: targetUser.staff,
        supporter: targetUser.supporter
      }
    });

  } catch (error) {
    console.error('Mod user lookup error:', error);
    return res.status(500).json({
      message: 'An error occurred while looking up user',
      error: error.message
    });
  }
}