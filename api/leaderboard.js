import User from '../models/User.js';
import UserStats from '../models/UserStats.js';

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

// Improved 24h leaderboard calculation using UserStats model methods
async function getDailyLeaderboard(isXp = true) {
  const scoreField = isXp ? 'totalXp' : 'elo';
  const now = new Date();
  const dayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

  // Get all users who have stats in the last 24h with their deltas
  const userDeltas = await UserStats.aggregate([
    // Match users active in last 24h
    {
      $match: {
        timestamp: { $gte: dayAgo }
      }
    },
    // Sort by userId and timestamp to get latest first
    {
      $sort: { userId: 1, timestamp: -1 }
    },
    // Group by userId to get latest and earliest in 24h period
    {
      $group: {
        _id: '$userId',
        latestStat: { $first: '$$ROOT' },
        earliestStat: { $last: '$$ROOT' }
      }
    },
    // Calculate the actual 24h change
    {
      $project: {
        userId: '$_id',
        latestScore: `$latestStat.${scoreField}`,
        earliestScore: `$earliestStat.${scoreField}`,
        delta: {
          $subtract: [`$latestStat.${scoreField}`, `$earliestStat.${scoreField}`]
        },
        latestTimestamp: '$latestStat.timestamp',
        earliestTimestamp: '$earliestStat.timestamp'
      }
    },
    // Only include users with meaningful changes (positive for XP, any change for ELO)
    {
      $match: isXp ? { delta: { $gt: 0 } } : { delta: { $ne: 0 } }
    },
    // Sort by delta descending
    {
      $sort: { delta: -1 }
    },
    // Limit to top 100
    {
      $limit: 100
    }
  ]);

  // Get user details for all users in the leaderboard
  // Exclude banned users AND users with pending name changes (keep leaderboard family-friendly)
  const userIds = userDeltas.map(delta => delta.userId);
  const users = await User.find({
    _id: { $in: userIds },
    banned: { $ne: true },
    pendingNameChange: { $ne: true }
  }).select('_id username countryCode elo totalXp created_at games').lean();

  const userMap = new Map(users.map(u => [u._id.toString(), u]));

  // Build leaderboard with proper data
  const leaderboard = userDeltas.map((delta, index) => {
    const user = userMap.get(delta.userId);
    if (!user || !user.username) return null;

    return {
      username: user.username,
      countryCode: user.countryCode || null,
      totalXp: isXp ? delta.delta : user.totalXp, // For XP show delta, for ELO show current total XP
      createdAt: user.created_at,
      gamesLen: user.games?.length || 0,
      elo: isXp ? user.elo : delta.delta, // For ELO mode show delta in elo field
      eloToday: delta.delta, // Always show the 24h change
      rank: index + 1
    };
  }).filter(user => user !== null);

  return { leaderboard, userDeltas };
}

// Get user's position in daily leaderboard
async function getUserDailyRank(username, isXp = true) {
  const user = await User.findOne({ username: username });
  if (!user) return { rank: null, delta: null };

  const scoreField = isXp ? 'totalXp' : 'elo';
  const now = new Date();
  const dayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

  // Get user's 24h change
  const userStats = await UserStats.find({
    userId: user._id.toString(),
    timestamp: { $gte: dayAgo }
  }).sort({ timestamp: -1 }).limit(1);

  const oldestUserStats = await UserStats.find({
    userId: user._id.toString(),
    timestamp: { $gte: dayAgo }
  }).sort({ timestamp: 1 }).limit(1);

  if (!userStats[0] || !oldestUserStats[0]) {
    return { rank: null, delta: 0 };
  }

  const userDelta = userStats[0][scoreField] - oldestUserStats[0][scoreField];

  // Count how many users have better deltas
  const betterUsersCount = await UserStats.aggregate([
    // Match users active in last 24h
    {
      $match: {
        timestamp: { $gte: dayAgo }
      }
    },
    // Group by userId to get their 24h deltas
    {
      $sort: { userId: 1, timestamp: -1 }
    },
    {
      $group: {
        _id: '$userId',
        latestStat: { $first: '$$ROOT' },
        earliestStat: { $last: '$$ROOT' }
      }
    },
    {
      $project: {
        delta: {
          $subtract: [`$latestStat.${scoreField}`, `$earliestStat.${scoreField}`]
        }
      }
    },
    // Count users with better deltas
    {
      $match: {
        delta: { $gt: userDelta }
      }
    },
    {
      $count: "count"
    }
  ]);

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
        // All-time leaderboard - simple and efficient
        // Exclude banned users AND users with pending name changes (keep leaderboard family-friendly)
        const sortField = isXp ? 'totalXp' : 'elo';
        const topUsers = await User.find({ 
          banned: { $ne: true },
          pendingNameChange: { $ne: true }
        })
          .sort({ [sortField]: -1 })
          .limit(100)
          .lean();

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
        const user = await User.findOne({ username: myUsername }).select('countryCode');
        myCountryCode = user?.countryCode || null;
      } else {
        // All-time ranking
        const user = await User.findOne({ username: myUsername });
        if (user) {
          myCountryCode = user.countryCode || null;
          const sortField = isXp ? 'totalXp' : 'elo';
          myScore = user[sortField];
          if (myScore) {
            const betterUsersCount = await User.countDocuments({
              [sortField]: { $gt: myScore },
              banned: { $ne: true },
              pendingNameChange: { $ne: true }
            });
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