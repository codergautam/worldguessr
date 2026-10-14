import User from '../../models/User.js';
import Game from '../../models/Game.js';
import Report from '../../models/Report.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { secret, days = 30, minPoints = 4950, minRounds = 10, limit = 100 } = req.body;

  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid secret' });
  }

  try {
    const requestingUser = await User.findOne({ secret });
    if (!requestingUser || !requestingUser.staff) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    const points = '$rounds.playerGuesses.points';
    const isHigh = { $gte: [points, minPoints] };

    // Filter on createdAt (covered by the { gameType, createdAt } index; endedAt is not
    // indexed) and project before unwinding so only the needed fields are expanded.
    // A single $group computes both high-round and total-round stats in one pass.
    const suspects = await Game.aggregate([
      {
        $match: {
          gameType: 'ranked_duel',
          createdAt: { $gte: sinceDate }
        }
      },
      {
        $project: {
          gameId: 1,
          endedAt: 1,
          'rounds.playerGuesses.accountId': 1,
          'rounds.playerGuesses.username': 1,
          'rounds.playerGuesses.points': 1
        }
      },
      { $unwind: '$rounds' },
      { $unwind: '$rounds.playerGuesses' },
      {
        $match: {
          'rounds.playerGuesses.accountId': { $ne: null }
        }
      },
      {
        $group: {
          _id: '$rounds.playerGuesses.accountId',
          username: { $last: '$rounds.playerGuesses.username' },
          totalRounds: { $sum: 1 },
          totalAvgPoints: { $avg: points },
          highRounds: { $sum: { $cond: [isHigh, 1, 0] } },
          highPointsSum: { $sum: { $cond: [isHigh, points, 0] } },
          games: { $addToSet: { $cond: [isHigh, '$gameId', null] } },
          lastSeen: { $max: { $cond: [isHigh, '$endedAt', null] } }
        }
      },
      { $match: { highRounds: { $gte: minRounds } } },
      { $sort: { highRounds: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          accountId: '$_id',
          username: 1,
          highRounds: 1,
          totalRounds: 1,
          highPointsSum: 1,
          totalAvgPoints: 1,
          gameCount: { $size: { $setDifference: ['$games', [null]] } },
          lastSeen: 1
        }
      }
    ]).allowDiskUse(true);

    // Fetch ban status for all suspects
    const accountIds = suspects.map(s => s.accountId);
    const users = await User.find(
      { _id: { $in: accountIds } },
      { _id: 1, banned: 1, banType: 1, elo: 1 }
    ).lean();

    const userMap = {};
    users.forEach(u => { userMap[u._id.toString()] = u; });

    // Count pending reports per suspect
    const pendingReports = await Report.aggregate([
      {
        $match: {
          'reportedUser.accountId': { $in: accountIds },
          status: 'pending'
        }
      },
      {
        $group: {
          _id: '$reportedUser.accountId',
          count: { $sum: 1 }
        }
      }
    ]);
    const pendingMap = {};
    pendingReports.forEach(r => { pendingMap[r._id] = r.count; });

    // Rounded in JS: Mongo's $round is half-to-even, Math.round is half-up.
    const enriched = suspects.map(({ highPointsSum, totalAvgPoints, ...s }) => ({
      ...s,
      highRoundPct: Math.round((s.highRounds / s.totalRounds) * 100),
      avgPointsHigh: Math.round(highPointsSum / s.highRounds),
      avgPointsAll: Math.round(totalAvgPoints || 0),
      banned: userMap[s.accountId]?.banned || false,
      banType: userMap[s.accountId]?.banType || null,
      elo: userMap[s.accountId]?.elo || 0,
      pendingReports: pendingMap[s.accountId] || 0
    }));

    return res.status(200).json({
      suspects: enriched,
      filters: { days, minPoints, minRounds },
      total: enriched.length
    });
  } catch (err) {
    console.error('Suspicious 5k error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}
