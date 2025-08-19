import User from '../models/User.js';
import UserStats from '../models/UserStats.js';

// Production-scale caching for 2M+ users
const CACHE_DURATION = 300000; // 5 minute cache for production performance
const DAILY_CACHE_DURATION = 180000; // 3 minute cache for daily leaderboards (more frequent updates)
const cache = new Map();

function getCacheKey(mode, pastDay) {
  return `${mode}_${pastDay ? 'daily' : 'alltime'}`;
}

function getCachedData(key) {
  const cached = cache.get(key);
  const cacheDuration = key.includes('daily') ? DAILY_CACHE_DURATION : CACHE_DURATION;
  if (cached && Date.now() - cached.timestamp < cacheDuration) {
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
    totalXp: user.totalXp ?? user.xpGained,
    createdAt: user.created_at,
    gamesLen: user.totalGamesPlayed ?? 0,
    elo: user.elo,
    eloToday: user.elo_today,
  };
}

async function getDailyLeaderboard(isXp = true) {
  const scoreField = isXp ? 'totalXp' : 'elo';
  const now = new Date();
  const dayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

  console.time(`getDailyLeaderboard_${isXp ? 'xp' : 'elo'}`);

  // PRODUCTION OPTIMIZATION: Single aggregation with user data included
  const leaderboardData = await UserStats.aggregate([
    // STEP 1: Filter to last 24h (uses timestamp index)
    {
      $match: {
        timestamp: { $gte: dayAgo }
      }
    },
    // STEP 2: Sort for efficient grouping (uses compound index)
    {
      $sort: { userId: 1, timestamp: -1 }
    },
    // STEP 3: Get first/last stats per user in 24h window
    {
      $group: {
        _id: '$userId',
        latestStat: { $first: '$$ROOT' },
        earliestStat: { $last: '$$ROOT' }
      }
    },
    // STEP 4: Calculate deltas and add user lookup in single stage
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        pipeline: [
          { $match: { banned: false } },
          { $project: { username: 1, elo: 1, totalXp: 1, created_at: 1, games: 1 } }
        ],
        as: 'user'
      }
    },
    // STEP 5: Filter out banned users and calculate deltas
    {
      $match: {
        'user.0': { $exists: true },
        'user.0.username': { $exists: true }
      }
    },
    {
      $addFields: {
        user: { $arrayElemAt: ['$user', 0] },
        delta: {
          $subtract: [`$latestStat.${scoreField}`, `$earliestStat.${scoreField}`]
        }
      }
    },
    // STEP 6: Filter meaningful changes only
    {
      $match: isXp ? { delta: { $gt: 0 } } : { delta: { $ne: 0 } }
    },
    // STEP 7: Sort by delta and limit (most expensive operation at the end)
    {
      $sort: { delta: -1 }
    },
    {
      $limit: 100
    },
    // STEP 8: Format final output
    {
      $project: {
        username: '$user.username',
        totalXp: isXp ? '$delta' : '$user.totalXp',
        createdAt: '$user.created_at',
        gamesLen: { $size: { $ifNull: ['$user.games', []] } },
        elo: isXp ? '$user.elo' : '$delta',
        eloToday: '$delta',
        rank: { $add: [{ $indexOfArray: [[], '$_id'] }, 1] } // Will be set after
      }
    }
  ]);

  // Add rank numbers efficiently
  const leaderboard = leaderboardData.map((user, index) => ({
    ...user,
    rank: index + 1
  }));

  console.timeEnd(`getDailyLeaderboard_${isXp ? 'xp' : 'elo'}`);
  console.log(`Daily leaderboard generated: ${leaderboard.length} users`);

  return { leaderboard, userDeltas: leaderboardData };
}

// Production-optimized user ranking for daily leaderboard
async function getUserDailyRank(username, isXp = true) {
  const user = await User.findOne({ username: username }).lean();
  if (!user) return { rank: null, delta: null };

  const scoreField = isXp ? 'totalXp' : 'elo';
  const dayAgo = new Date(Date.now() - (24 * 60 * 60 * 1000));

  console.time(`getUserDailyRank_${username}`);

  // OPTIMIZED: Get user's stats and rank in one efficient query
  const result = await UserStats.aggregate([
    // Step 1: Get user's own delta first
    {
      $facet: {
        userDelta: [
          {
            $match: {
              userId: user._id.toString(),
              timestamp: { $gte: dayAgo }
            }
          },
          { $sort: { timestamp: -1 } },
          {
            $group: {
              _id: '$userId',
              latest: { $first: `$${scoreField}` },
              earliest: { $last: `$${scoreField}` }
            }
          },
          {
            $project: {
              delta: { $subtract: ['$latest', '$earliest'] }
            }
          }
        ],
        betterUsers: [
          {
            $match: {
              timestamp: { $gte: dayAgo }
            }
          },
          { $sort: { userId: 1, timestamp: -1 } },
          {
            $group: {
              _id: '$userId',
              delta: {
                $subtract: [
                  { $first: `$${scoreField}` },
                  { $last: `$${scoreField}` }
                ]
              }
            }
          },
          {
            $match: isXp ? { delta: { $gt: 0 } } : { delta: { $ne: 0 } }
          }
        ]
      }
    },
    // Step 2: Count users with better deltas
    {
      $project: {
        userDelta: { $arrayElemAt: ['$userDelta.delta', 0] },
        rank: {
          $add: [
            {
              $size: {
                $filter: {
                  input: '$betterUsers',
                  cond: {
                    $gt: [
                      '$$this.delta',
                      { $arrayElemAt: ['$userDelta.delta', 0] }
                    ]
                  }
                }
              }
            },
            1
          ]
        }
      }
    }
  ]);

  let rank = null;
  let delta = 0;

  if (result.length > 0 && result[0].userDelta !== null) {
    rank = result[0].rank;
    delta = result[0].userDelta;
  }

  console.timeEnd(`getUserDailyRank_${username}`);
  return { rank, delta };
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
        const sortField = isXp ? 'totalXp' : 'elo';
        const topUsers = await User.find({ banned: false })
          .sort({ [sortField]: -1 })
          .limit(100)
          .lean();

        leaderboard = topUsers.map(sendableUser).filter(user => user !== null);
        setCachedData(cacheKey, leaderboard);
      }
    }

    // Get user's rank and score
    if (myUsername) {
      if (pastDay) {
        const userResult = await getUserDailyRank(myUsername, isXp);
        myRank = userResult.rank;
        myScore = userResult.delta;
      } else {
        // All-time ranking
        const user = await User.findOne({ username: myUsername });
        if (user) {
          const sortField = isXp ? 'totalXp' : 'elo';
          myScore = user[sortField];
          if (myScore) {
            const betterUsersCount = await User.countDocuments({
              [sortField]: { $gt: myScore },
              banned: false
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
