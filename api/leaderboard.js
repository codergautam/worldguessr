import User from '../models/User.js';
import UserStats from '../models/UserStats.js';
import DailyLeaderboard from '../models/DailyLeaderboard.js';

// Improved caching with separate keys for different modes
const CACHE_DURATION = 60000; // 1 minute cache
const cache = new Map();

function getCacheKey(mode, pastDay) {
  return `${mode}_${pastDay ? 'daily' : 'alltime'}`;
}

function getCachedData(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  return null;
}

function setCachedData(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

function sendableUser(user) {
  if (!user.username) {
    return null;
  }
  return {
    username: user.username,
    countryCode: user.countryCode || null,
    totalXp: user.totalXp ?? user.xpGained ?? 0,
    createdAt: user.created_at,
    gamesLen: user.totalGamesPlayed ?? 0,
    elo: user.elo ?? 1000,
    eloToday: user.elo_today ?? 0,
  };
}

// OPTIMIZED: Load pre-computed daily leaderboard from DailyLeaderboard collection
// This eliminates expensive aggregation queries on 100M+ UserStats records
async function getDailyLeaderboard(isXp = true) {
  const mode = isXp ? 'xp' : 'elo';
  const now = new Date();

  // Get today's midnight UTC for consistent lookups
  const todayMidnight = new Date(now);
  todayMidnight.setUTCHours(0, 0, 0, 0);

  // Fetch pre-computed leaderboard (lightning fast query with date+mode index)
  const precomputedLeaderboard = await DailyLeaderboard.findOne({
    date: todayMidnight,
    mode: mode
  }).lean().maxTimeMS(2000); // 2 second timeout

  // If no pre-computed data yet (first 15 min of day or cron not running), fallback to old method
  if (!precomputedLeaderboard) {
    console.warn('[LEADERBOARD] Pre-computed daily leaderboard not found, falling back to live aggregation');
    return getDailyLeaderboardLegacy(isXp);
  }

  // Transform pre-computed data to match expected format
  const leaderboard = precomputedLeaderboard.leaderboard.map(entry => ({
    username: entry.username,
    countryCode: entry.countryCode || null,
    totalXp: isXp ? entry.delta : entry.currentValue,
    createdAt: null, // Not stored in pre-computed data to save space
    gamesLen: 0, // Not stored in pre-computed data to save space
    elo: isXp ? entry.currentValue : entry.delta,
    eloToday: entry.delta,
    rank: entry.rank,
    supporter: entry.supporter || false
  }));

  return { leaderboard, userDeltas: precomputedLeaderboard.leaderboard };
}

// LEGACY FALLBACK: Original expensive aggregation (only used if pre-computed data unavailable)
async function getDailyLeaderboardLegacy(isXp = true) {
  const scoreField = isXp ? 'totalXp' : 'elo';
  const now = new Date();
  const dayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

  // Get all users who have stats in the last 24h with their deltas
  const userDeltas = await UserStats.aggregate([
    { $match: { timestamp: { $gte: dayAgo } } },
    { $sort: { userId: 1, timestamp: -1 } },
    {
      $group: {
        _id: '$userId',
        latestStat: { $first: '$$ROOT' },
        earliestStat: { $last: '$$ROOT' }
      }
    },
    {
      $project: {
        userId: '$_id',
        latestScore: `$latestStat.${scoreField}`,
        earliestScore: `$earliestStat.${scoreField}`,
        delta: { $subtract: [`$latestStat.${scoreField}`, `$earliestStat.${scoreField}`] }
      }
    },
    { $match: isXp ? { delta: { $gt: 0 } } : { delta: { $ne: 0 } } },
    { $sort: { delta: -1 } },
    { $limit: 100 }
  ]).maxTimeMS(30000); // 30 second timeout to prevent hangs

  const userIds = userDeltas.map(delta => delta.userId);
  const users = await User.find({
    _id: { $in: userIds },
    banned: { $ne: true },
    pendingNameChange: { $ne: true }
  }).select('_id username countryCode elo totalXp').lean().maxTimeMS(5000);

  const userMap = new Map(users.map(u => [u._id.toString(), u]));

  const leaderboard = userDeltas.map((delta, index) => {
    const user = userMap.get(delta.userId);
    if (!user || !user.username) return null;

    return {
      username: user.username,
      countryCode: user.countryCode || null,
      totalXp: isXp ? delta.delta : user.totalXp,
      createdAt: null,
      gamesLen: 0,
      elo: isXp ? user.elo : delta.delta,
      eloToday: delta.delta,
      rank: index + 1
    };
  }).filter(user => user !== null);

  return { leaderboard, userDeltas };
}

// OPTIMIZED: Get user's position from pre-computed daily leaderboard
async function getUserDailyRank(username, isXp = true) {
  const user = await User.findOne({ username: username }).maxTimeMS(2000);
  if (!user) return { rank: null, delta: null };

  const mode = isXp ? 'xp' : 'elo';
  const now = new Date();

  // Get today's midnight UTC
  const todayMidnight = new Date(now);
  todayMidnight.setUTCHours(0, 0, 0, 0);

  // Fetch pre-computed leaderboard
  const precomputedLeaderboard = await DailyLeaderboard.findOne({
    date: todayMidnight,
    mode: mode
  }).lean().maxTimeMS(2000);

  // If no pre-computed data, fall back to live calculation
  if (!precomputedLeaderboard) {
    console.warn('[LEADERBOARD] Pre-computed daily leaderboard not found for user rank, falling back to live calculation');
    return getUserDailyRankLegacy(username, isXp);
  }

  // Find user in pre-computed leaderboard (O(n) but only 100 entries max)
  const userEntry = precomputedLeaderboard.leaderboard.find(
    entry => entry.userId === user._id.toString()
  );

  if (userEntry) {
    return { rank: userEntry.rank, delta: userEntry.delta };
  }

  // User not in top 100, but may still have gained XP/ELO today
  // Just return delta without calculating exact rank (would require full aggregation)
  const scoreField = isXp ? 'totalXp' : 'elo';
  const dayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

  const [latestStat, oldestStat] = await Promise.all([
    UserStats.findOne({
      userId: user._id.toString(),
      timestamp: { $gte: dayAgo }
    }).sort({ timestamp: -1 }).lean().maxTimeMS(2000),
    UserStats.findOne({
      userId: user._id.toString(),
      timestamp: { $gte: dayAgo }
    }).sort({ timestamp: 1 }).lean().maxTimeMS(2000)
  ]);

  if (!latestStat || !oldestStat) {
    return { rank: null, delta: 0 };
  }

  const userDelta = latestStat[scoreField] - oldestStat[scoreField];

  // User has delta but not in top 100, so rank is > 100
  return { rank: userDelta > 0 ? '>100' : null, delta: userDelta };
}

// LEGACY FALLBACK: Expensive aggregation to get user rank (only used if pre-computed unavailable)
async function getUserDailyRankLegacy(username, isXp = true) {
  const user = await User.findOne({ username: username });
  if (!user) return { rank: null, delta: null };

  const scoreField = isXp ? 'totalXp' : 'elo';
  const now = new Date();
  const dayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

  const [latestStat, oldestStat] = await Promise.all([
    UserStats.findOne({
      userId: user._id.toString(),
      timestamp: { $gte: dayAgo }
    }).sort({ timestamp: -1 }).lean().maxTimeMS(5000),
    UserStats.findOne({
      userId: user._id.toString(),
      timestamp: { $gte: dayAgo }
    }).sort({ timestamp: 1 }).lean().maxTimeMS(5000)
  ]);

  if (!latestStat || !oldestStat) {
    return { rank: null, delta: 0 };
  }

  const userDelta = latestStat[scoreField] - oldestStat[scoreField];

  // Count users with better deltas (expensive!)
  const betterUsersCount = await UserStats.aggregate([
    { $match: { timestamp: { $gte: dayAgo } } },
    { $sort: { userId: 1, timestamp: -1 } },
    {
      $group: {
        _id: '$userId',
        latestStat: { $first: '$$ROOT' },
        earliestStat: { $last: '$$ROOT' }
      }
    },
    {
      $project: {
        delta: { $subtract: [`$latestStat.${scoreField}`, `$earliestStat.${scoreField}`] }
      }
    },
    { $match: { delta: { $gt: userDelta } } },
    { $count: "count" }
  ]).maxTimeMS(30000);

  const rank = betterUsersCount.length > 0 ? betterUsersCount[0].count + 1 : 1;
  return { rank, delta: userDelta };
}

export default async function handler(req, res) {
  const myUsername = req.query.username;
  const pastDay = req.query.pastDay === 'true';
  const isXp = req.query.mode === 'xp';

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const cacheKey = getCacheKey(isXp ? 'xp' : 'elo', pastDay);
    let leaderboard = getCachedData(cacheKey);
    let myRank = null;
    let myScore = null;

    if (!leaderboard) {
      if (pastDay) {
        // Use the new efficient daily leaderboard calculation
        const dailyResult = await getDailyLeaderboard(isXp);
        leaderboard = dailyResult.leaderboard;
        setCachedData(cacheKey, leaderboard);
      } else {
        // All-time leaderboard - now uses indexes for fast sorting
        // Exclude banned users AND users with pending name changes (keep leaderboard family-friendly)
        const sortField = isXp ? 'totalXp' : 'elo';
        const topUsers = await User.find({
          banned: { $ne: true },
          pendingNameChange: { $ne: true }
        })
          .sort({ [sortField]: -1 })
          .limit(100)
          .lean()
          .maxTimeMS(5000); // 5 second timeout

        leaderboard = topUsers.map(sendableUser).filter(user => user !== null);
        setCachedData(cacheKey, leaderboard);
      }
    }

    // Get user's rank and score
    let myCountryCode = null;
    if (myUsername) {
      if (pastDay) {
        const userResult = await getUserDailyRank(myUsername, isXp);
        myRank = userResult.rank;
        myScore = userResult.delta;
        // Also get countryCode for the user
        const user = await User.findOne({ username: myUsername }).select('countryCode').maxTimeMS(2000);
        myCountryCode = user?.countryCode || null;
      } else {
        // All-time ranking
        const user = await User.findOne({ username: myUsername }).maxTimeMS(2000);
        if (user) {
          myCountryCode = user.countryCode || null;
          const sortField = isXp ? 'totalXp' : 'elo';
          myScore = user[sortField];
          if (myScore) {
            const betterUsersCount = await User.countDocuments({
              [sortField]: { $gt: myScore },
              banned: { $ne: true },
              pendingNameChange: { $ne: true }
            }).maxTimeMS(5000); // 5 second timeout
            myRank = betterUsersCount + 1;
          }
        }
      }
    }

    // Return consistent response format
    const responseKey = isXp ? 'myXp' : 'myElo';
    return res.status(200).json({
      leaderboard,
      myRank,
      myCountryCode,
      [responseKey]: myScore
    });

  } catch (error) {
    console.error('Leaderboard API error:', error);
    return res.status(500).json({
      message: 'An error occurred',
      error: error.message
    });
  }
}