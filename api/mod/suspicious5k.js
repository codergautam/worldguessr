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

    const results = await Game.aggregate([
      {
        $match: {
          gameType: 'ranked_duel',
          endedAt: { $gte: sinceDate }
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
        $facet: {
          highScores: [
            { $match: { 'rounds.playerGuesses.points': { $gte: minPoints } } },
            {
              $group: {
                _id: '$rounds.playerGuesses.accountId',
                username: { $last: '$rounds.playerGuesses.username' },
                highRounds: { $sum: 1 },
                avgPoints: { $avg: '$rounds.playerGuesses.points' },
                games: { $addToSet: '$gameId' },
                lastSeen: { $max: '$endedAt' }
              }
            },
            { $addFields: { gameCount: { $size: '$games' } } },
            { $match: { highRounds: { $gte: minRounds } } }
          ],
          totalRounds: [
            {
              $group: {
                _id: '$rounds.playerGuesses.accountId',
                totalRounds: { $sum: 1 },
                totalAvgPoints: { $avg: '$rounds.playerGuesses.points' }
              }
            }
          ]
        }
      }
    ]);

    const { highScores, totalRounds } = results[0];

    const totalRoundsMap = {};
    totalRounds.forEach(r => {
      totalRoundsMap[r._id] = { totalRounds: r.totalRounds, totalAvgPoints: r.totalAvgPoints };
    });

    // Merge and compute percentage
    const suspects = highScores.map(s => ({
      accountId: s._id,
      username: s.username,
      highRounds: s.highRounds,
      totalRounds: totalRoundsMap[s._id]?.totalRounds || s.highRounds,
      highRoundPct: Math.round((s.highRounds / (totalRoundsMap[s._id]?.totalRounds || s.highRounds)) * 100),
      avgPointsHigh: Math.round(s.avgPoints),
      avgPointsAll: Math.round(totalRoundsMap[s._id]?.totalAvgPoints || 0),
      gameCount: s.gameCount,
      lastSeen: s.lastSeen
    }));

    suspects.sort((a, b) => b.highRounds - a.highRounds);

    // Fetch ban status for all suspects
    const accountIds = suspects.slice(0, limit).map(s => s.accountId);
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

    const enriched = suspects.slice(0, limit).map(s => ({
      ...s,
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
