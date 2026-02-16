import User from '../../models/User.js';
import ModerationLog from '../../models/ModerationLog.js';
import Report from '../../models/Report.js';

/**
 * Mod Activity API
 *
 * Returns monthly activity breakdown per moderator
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { secret, year, month } = req.body;

  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid secret' });
  }

  try {
    const requestingUser = await User.findOne({ secret });
    if (!requestingUser || !requestingUser.staff) {
      return res.status(403).json({ message: 'Unauthorized - staff access required' });
    }

    const now = new Date();
    const targetYear = year || now.getUTCFullYear();
    const targetMonth = month || (now.getUTCMonth() + 1);

    const startOfMonth = new Date(Date.UTC(targetYear, targetMonth - 1, 1));
    const endOfMonth = new Date(Date.UTC(targetYear, targetMonth, 1));

    // Aggregate actions by moderator and action type for the month
    const moderatorActivity = await ModerationLog.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfMonth, $lt: endOfMonth },
          actionType: { $ne: 'name_change_manual' }
        }
      },
      {
        $group: {
          _id: {
            moderatorId: '$moderator.accountId',
            moderatorUsername: '$moderator.username',
            actionType: '$actionType'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.moderatorId',
          username: { $last: '$_id.moderatorUsername' },
          actions: {
            $push: {
              actionType: '$_id.actionType',
              count: '$count'
            }
          },
          totalActions: { $sum: '$count' }
        }
      },
      { $sort: { totalActions: -1 } }
    ]);

    // Filter to only staff members
    const staffUserIds = await User.find(
      { _id: { $in: moderatorActivity.map(m => m._id) }, staff: true },
      { _id: 1 }
    ).lean();
    const staffIdSet = new Set(staffUserIds.map(u => u._id.toString()));
    const filteredActivity = moderatorActivity.filter(m => staffIdSet.has(m._id));

    // Format moderators with actions as object
    const totals = {};
    let grandTotal = 0;

    const moderators = filteredActivity.map(mod => {
      const actions = {};
      for (const a of mod.actions) {
        actions[a.actionType] = a.count;
        totals[a.actionType] = (totals[a.actionType] || 0) + a.count;
      }
      grandTotal += mod.totalActions;
      return {
        accountId: mod._id,
        username: mod.username,
        actions,
        totalActions: mod.totalActions
      };
    });

    // Daily report flow: incoming vs handled
    const [dailyIncoming, dailyHandled] = await Promise.all([
      Report.aggregate([
        { $match: { createdAt: { $gte: startOfMonth, $lt: endOfMonth } } },
        {
          $group: {
            _id: { $dayOfMonth: { date: '$createdAt', timezone: 'UTC' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      Report.aggregate([
        { $match: { reviewedAt: { $gte: startOfMonth, $lt: endOfMonth }, status: { $ne: 'pending' } } },
        {
          $group: {
            _id: { $dayOfMonth: { date: '$reviewedAt', timezone: 'UTC' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    // Per-moderator daily actions
    const dailyPerMod = await ModerationLog.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfMonth, $lt: endOfMonth },
          actionType: { $ne: 'name_change_manual' }
        }
      },
      {
        $group: {
          _id: {
            day: { $dayOfMonth: { date: '$createdAt', timezone: 'UTC' } },
            moderatorId: '$moderator.accountId'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.day': 1 } }
    ]);

    // Build per-mod daily map: { modId: { day: count } }
    const perModDailyMap = {};
    for (const entry of dailyPerMod) {
      const modId = entry._id.moderatorId;
      if (!staffIdSet.has(modId)) continue;
      if (!perModDailyMap[modId]) perModDailyMap[modId] = {};
      perModDailyMap[modId][entry._id.day] = entry.count;
    }

    // Build daily data array for the month
    const daysInMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
    const dailyReports = [];
    const incomingMap = Object.fromEntries(dailyIncoming.map(d => [d._id, d.count]));
    const handledMap = Object.fromEntries(dailyHandled.map(d => [d._id, d.count]));
    for (let day = 1; day <= daysInMonth; day++) {
      dailyReports.push({
        day,
        incoming: incomingMap[day] || 0,
        handled: handledMap[day] || 0
      });
    }

    // Build per-mod daily arrays
    const dailyByModerator = {};
    for (const modId of Object.keys(perModDailyMap)) {
      dailyByModerator[modId] = [];
      for (let day = 1; day <= daysInMonth; day++) {
        dailyByModerator[modId].push(perModDailyMap[modId][day] || 0);
      }
    }

    // Get available months
    const availableMonths = await ModerationLog.aggregate([
      { $match: { actionType: { $ne: 'name_change_manual' } } },
      {
        $group: {
          _id: {
            year: { $year: { date: '$createdAt', timezone: 'UTC' } },
            month: { $month: { date: '$createdAt', timezone: 'UTC' } }
          }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } }
    ]);

    return res.status(200).json({
      moderators,
      totals,
      grandTotal,
      dailyReports,
      dailyByModerator,
      month: targetMonth,
      year: targetYear,
      availableMonths: availableMonths.map(m => ({ year: m._id.year, month: m._id.month }))
    });

  } catch (error) {
    console.error('Mod activity error:', error);
    return res.status(500).json({
      message: 'An error occurred while fetching mod activity',
      error: error.message
    });
  }
}
