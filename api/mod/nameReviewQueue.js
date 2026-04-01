import User from '../../models/User.js';
import NameChangeRequest from '../../models/NameChangeRequest.js';
import ModerationLog from '../../models/ModerationLog.js';

/**
 * Name Review Queue API
 * 
 * GET-style (POST for auth): Get pending name change requests
 * This returns users who have submitted new names for review after being forced to change
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { secret, limit = 50, skip = 0 } = req.body;

  // Validate secret
  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid secret' });
  }

  try {
    // Verify requesting user is staff
    const requestingUser = await User.findOne({ secret });
    if (!requestingUser || !requestingUser.staff) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Get pending name change requests (oldest first)
    const pendingRequests = await NameChangeRequest.find({ status: 'pending' })
      .sort({ createdAt: 1 }) // Oldest first
      .limit(Math.min(limit, 100))
      .skip(skip)
      .lean();

    // Get total count
    const totalCount = await NameChangeRequest.countDocuments({ status: 'pending' });

    // Get stats
    const stats = {
      pending: totalCount,
      approvedToday: await NameChangeRequest.countDocuments({
        status: 'approved',
        reviewedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
      }),
      rejectedToday: await NameChangeRequest.countDocuments({
        status: 'rejected',
        reviewedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
      })
    };

    return res.status(200).json({
      requests: pendingRequests,
      stats,
      pagination: {
        total: totalCount,
        limit,
        skip,
        hasMore: skip + pendingRequests.length < totalCount
      }
    });

  } catch (error) {
    console.error('Name review queue error:', error);
    return res.status(500).json({
      message: 'An error occurred while fetching name review queue',
      error: error.message
    });
  }
}

