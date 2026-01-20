import User, { USERNAME_COLLATION } from '../models/User.js';
import DailyLeaderboard from '../models/DailyLeaderboard.js';

// Cache for leaderboard data
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

// Load pre-computed daily leaderboard from DailyLeaderboard collection
async function getDailyLeaderboard(isXp = true) {
  const mode = isXp ? 'xp' : 'elo';
  const now = new Date();

  // Get today's midnight UTC for consistent lookups
  const todayMidnight = new Date(now);
  todayMidnight.setUTCHours(0, 0, 0, 0);

  // Fetch pre-computed leaderboard (fast query with date+mode index)
  const precomputedLeaderboard = await DailyLeaderboard.findOne({
    date: todayMidnight,
    mode: mode
  }).lean().maxTimeMS(2000);

  if (!precomputedLeaderboard) {
    console.warn('[LEADERBOARD] Pre-computed daily leaderboard not found');
    return { leaderboard: [] };
  }

  // Transform pre-computed data to match expected format (only top 100 for display)
  const leaderboard = precomputedLeaderboard.leaderboard.slice(0, 100).map(entry => ({
    username: entry.username,
    countryCode: entry.countryCode || null,
    totalXp: isXp ? entry.delta : entry.currentValue,
    createdAt: null,
    gamesLen: 0,
    elo: isXp ? entry.currentValue : entry.delta,
    eloToday: entry.delta,
    rank: entry.rank,
    supporter: entry.supporter || false
  }));

  return { leaderboard };
}

// Get user's position from pre-computed daily leaderboard (top 50k)
async function getUserDailyRank(username, isXp = true) {
  const user = await User.findOne({ username: username }).collation(USERNAME_COLLATION).maxTimeMS(2000);
  if (!user) return { rank: null, delta: null };

  const mode = isXp ? 'xp' : 'elo';
  const now = new Date();

  // Get today's midnight UTC
  const todayMidnight = new Date(now);
  todayMidnight.setUTCHours(0, 0, 0, 0);

  // Fetch pre-computed leaderboard (contains top 50k users)
  const precomputedLeaderboard = await DailyLeaderboard.findOne({
    date: todayMidnight,
    mode: mode
  }).lean().maxTimeMS(2000);

  if (!precomputedLeaderboard) {
    return { rank: null, delta: null };
  }

  // Find user in pre-computed leaderboard (searches through top 50k)
  const userEntry = precomputedLeaderboard.leaderboard.find(
    entry => entry.userId === user._id.toString()
  );

  if (userEntry) {
    return { rank: userEntry.rank, delta: userEntry.delta };
  }

  // User not in top 50k - no activity or very low delta
  return { rank: null, delta: null };
}

export default async function handler(req, res) {
  const myUsername = req.query.username;
  const pastDay = req.query.pastDay === 'true';
  const isXp = req.query.mode === 'xp';
  console.log(`[API] leaderboard: mode=${isXp ? 'xp' : 'elo'}, pastDay=${pastDay}, user=${myUsername || 'none'}`);

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
        // Daily leaderboard from pre-computed DailyLeaderboard collection
        const dailyResult = await getDailyLeaderboard(isXp);
        leaderboard = dailyResult.leaderboard;
        setCachedData(cacheKey, leaderboard);
      } else {
        // All-time leaderboard
        const sortField = isXp ? 'totalXp' : 'elo';
        const topUsers = await User.find({
          banned: false,
          pendingNameChange: { $ne: true }
        })
          .sort({ [sortField]: -1 })
          .limit(100)
          .lean()
          .maxTimeMS(5000);

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
        const user = await User.findOne({ username: myUsername }).collation(USERNAME_COLLATION).select('countryCode').maxTimeMS(2000);
        myCountryCode = user?.countryCode || null;
      } else {
        // All-time ranking
        const user = await User.findOne({ username: myUsername }).collation(USERNAME_COLLATION).maxTimeMS(2000);
        if (user) {
          myCountryCode = user.countryCode || null;
          const sortField = isXp ? 'totalXp' : 'elo';
          myScore = user[sortField];
          if (myScore) {
            const betterUsersCount = await User.countDocuments({
              [sortField]: { $gt: myScore },
              banned: false
            }).maxTimeMS(5000);
            myRank = betterUsersCount + 1;
          }
        }
      }
    }

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
