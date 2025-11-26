import User from '../../models/User.js';
import ModerationLog from '../../models/ModerationLog.js';

/**
 * Audit Logs API
 *
 * Fetches moderation action logs with optional filtering by moderator
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const {
    secret,
    moderatorId,     // Optional: filter by specific moderator
    actionType,      // Optional: filter by action type
    page = 1,
    limit = 50
  } = req.body;

  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid secret' });
  }

  try {
    // Verify requesting user is staff
    const requestingUser = await User.findOne({ secret });
    if (!requestingUser || !requestingUser.staff) {
      return res.status(403).json({ message: 'Unauthorized - staff access required' });
    }

    // Build query
    const query = {};

    if (moderatorId && moderatorId !== 'all') {
      query['moderator.accountId'] = moderatorId;
    }

    if (actionType && actionType !== 'all') {
      query.actionType = actionType;
    }

    // Get total count for pagination
    const totalCount = await ModerationLog.countDocuments(query);

    // Fetch logs with pagination
    const logs = await ModerationLog.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Get list of all moderators who have taken actions (for filter dropdown)
    // First get unique moderator IDs from logs
    const allModeratorsFromLogs = await ModerationLog.aggregate([
      {
        $group: {
          _id: '$moderator.accountId',
          username: { $first: '$moderator.username' },
          actionCount: { $sum: 1 }
        }
      },
      { $sort: { actionCount: -1 } }
    ]);

    // Filter to only include actual staff members (not users who just changed their own name)
    const staffUserIds = await User.find(
      { _id: { $in: allModeratorsFromLogs.map(m => m._id) }, staff: true },
      { _id: 1 }
    ).lean();
    const staffIdSet = new Set(staffUserIds.map(u => u._id.toString()));

    const moderatorsList = allModeratorsFromLogs.filter(m => staffIdSet.has(m._id));

    // Get action type counts for stats
    const actionTypeCounts = await ModerationLog.aggregate([
      {
        $group: {
          _id: '$actionType',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Format logs for response
    const formattedLogs = logs.map(log => ({
      _id: log._id,
      targetUser: {
        accountId: log.targetUser.accountId,
        username: log.targetUser.username
      },
      moderator: {
        accountId: log.moderator.accountId,
        username: log.moderator.username
      },
      actionType: log.actionType,
      reason: log.reason,
      notes: log.notes,
      duration: log.duration,
      durationString: log.durationString,
      expiresAt: log.expiresAt,
      nameChange: log.nameChange,
      eloRefund: log.eloRefund,
      relatedReports: log.relatedReports?.length || 0,
      createdAt: log.createdAt
    }));

    return res.status(200).json({
      logs: formattedLogs,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      },
      moderators: moderatorsList.map(m => ({
        accountId: m._id,
        username: m.username,
        actionCount: m.actionCount
      })),
      actionTypeCounts: actionTypeCounts.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      stats: {
        totalActions: totalCount,
        uniqueModerators: moderatorsList.length
      }
    });

  } catch (error) {
    console.error('Audit logs error:', error);
    return res.status(500).json({
      message: 'An error occurred while fetching audit logs',
      error: error.message
    });
  }
}

