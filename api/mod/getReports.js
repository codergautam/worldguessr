import User from '../../models/User.js';
import Report from '../../models/Report.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { secret, status, limit = 50, skip = 0 } = req.body;

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

    // Build query
    const query = {};

    // Filter by status if provided
    if (status && ['pending', 'reviewed', 'dismissed', 'action_taken'].includes(status)) {
      query.status = status;
    }

    // Get reports
    const reports = await Report.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 100)) // Cap at 100
      .skip(skip)
      .lean();

    // Get total count for pagination
    const totalCount = await Report.countDocuments(query);

    // Get counts by status for dashboard stats
    const statusCounts = await Report.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const stats = {
      total: totalCount,
      pending: 0,
      reviewed: 0,
      dismissed: 0,
      action_taken: 0
    };

    statusCounts.forEach(item => {
      if (item._id in stats) {
        stats[item._id] = item.count;
      }
    });

    return res.status(200).json({
      reports,
      stats,
      pagination: {
        total: totalCount,
        limit,
        skip,
        hasMore: skip + reports.length < totalCount
      }
    });

  } catch (error) {
    console.error('Get reports error:', error);
    return res.status(500).json({
      message: 'An error occurred while fetching reports',
      error: error.message
    });
  }
}

