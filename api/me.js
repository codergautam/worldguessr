import User from '../models/User.js';

/**
 * Get Current User API
 *
 * Returns basic information about the currently authenticated user
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Extract secret from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const secret = authHeader.split(' ')[1];
    if (!secret || typeof secret !== 'string') {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Find user by secret
    const user = await User.findOne({ secret })
      .select('username email countryCode supporter staff banned _id')
      .lean();

    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Return user data (without sensitive info)
    return res.status(200).json({
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      countryCode: user.countryCode,
      supporter: user.supporter || false,
      staff: user.staff || false,
      banned: user.banned || false
    });

  } catch (error) {
    console.error('Get current user error:', error);
    return res.status(500).json({
      message: 'An error occurred',
      error: error.message
    });
  }
}
