import User from '../models/User.js';
import UserStats from '../models/UserStats.js';
const cache = { data: null, timestamp: null };
const pastDayCache = { data: null, timestamp: null };

const cacheElo = { data: null, timestamp: null };
const pastDayCacheElo = { data: null, timestamp: null };

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

export default async function handler(req, res) {
  const myUsername = req.query.username;
  const pastDay = req.query.pastDay === 'true';
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const xp = req.query.mode === 'xp';

  if(xp) {
  try {
    // Fetch top 100 users by XP

    // Format response data
    let leaderboard;
    if (pastDay) {
      // get past day leaderboard

      if (pastDayCache.data && pastDayCache.timestamp && Date.now() - pastDayCache.timestamp < 60000) {
        leaderboard = pastDayCache.data;
      } else {
        // Get current time and 24 hours ago
        const now = new Date();
        const dayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

        // Optimized approach using facets to avoid processing all users
        const xpChanges = await UserStats.aggregate([
          {
            // First get recent stats to identify active users
            $match: {
              timestamp: { $gte: dayAgo }
            }
          },
          {
            $sort: { userId: 1, timestamp: -1 }
          },
          {
            $group: {
              _id: '$userId',
              latestStat: { $first: '$$ROOT' }
            }
          },
          {
            // Now get the historical stat for each active user
            $lookup: {
              from: 'userstats',
              let: { userId: '$_id', cutoff: dayAgo },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$userId', '$$userId'] },
                        { $lte: ['$timestamp', '$$cutoff'] }
                      ]
                    }
                  }
                },
                { $sort: { timestamp: -1 } },
                { $limit: 1 }
              ],
              as: 'historicalStat'
            }
          },
          {
            $match: {
              'historicalStat.0': { $exists: true }
            }
          },
          {
            $project: {
              userId: '$_id',
              currentXp: '$latestStat.totalXp',
              previousXp: { $arrayElemAt: ['$historicalStat.totalXp', 0] },
              xpGained: {
                $subtract: [
                  '$latestStat.totalXp',
                  { $arrayElemAt: ['$historicalStat.totalXp', 0] }
                ]
              }
            }
          },
          {
            $match: {
              xpGained: { $gt: 0 }
            }
          },
          {
            $sort: { xpGained: -1 }
          },
          {
            $limit: 100
          }
        ]);

        // Get user details for the users with XP changes
        const userIds = xpChanges.map(change => change.userId);
        const users = await User.find({
          _id: { $in: userIds },
          banned: false
        }).select('_id username elo totalXp created_at games').lean();

        const userMap = new Map(users.map(u => [u._id.toString(), u]));

        // Build leaderboard with user info and XP changes
        leaderboard = xpChanges.map(change => {
          const user = userMap.get(change.userId);
          if (!user || !user.username) return null;
          
          return {
            username: user.username,
            totalXp: change.xpGained, // For past day, show the gained amount
            createdAt: user.created_at,
            gamesLen: user.games?.length || 0,
            elo: user.elo,
            eloToday: user.elo_today
          };
        }).filter(user => user !== null);

        pastDayCache.data = leaderboard;
        pastDayCache.timestamp = Date.now();
      }

    } else {

      // get all time leaderboard
      if (cache.data && cache.timestamp && Date.now() - cache.timestamp < 60000) {
        leaderboard = cache.data;
      } else {
        const topUsers = await User.find({ banned: false }).sort({ totalXp: -1 }).limit(100);

        leaderboard = topUsers.map(sendableUser).filter(user => user !== null);
        cache.data = leaderboard;
        cache.timestamp = Date.now();
      }
    }


    // Find the user's rank
    let myRank = null;
    let myXp = null;
    if (myUsername) {
      const user = await User.findOne({ username: myUsername });
      if (user) {
        if (pastDay) {
          // Calculate user's 24h XP gain and rank among daily gains
          const dayAgo = new Date(Date.now() - (24 * 60 * 60 * 1000));
          
          const userXpChange = await UserStats.aggregate([
            {
              $match: {
                userId: user._id.toString(),
                timestamp: { $gte: dayAgo }
              }
            },
            {
              $sort: { timestamp: -1 }
            },
            {
              $group: {
                _id: '$userId',
                latestStats: { $first: '$$ROOT' },
                earliestStats: { $last: '$$ROOT' }
              }
            },
            {
              $project: {
                xpGained: { $subtract: ['$latestStats.totalXp', '$earliestStats.totalXp'] }
              }
            }
          ]);

          if (userXpChange.length > 0) {
            myXp = userXpChange[0].xpGained;
            
            // Count users with better XP gains
            const betterUsersCount = await UserStats.aggregate([
              {
                $match: {
                  timestamp: { $gte: dayAgo }
                }
              },
              {
                $sort: { userId: 1, timestamp: -1 }
              },
              {
                $group: {
                  _id: '$userId',
                  latestStats: { $first: '$$ROOT' },
                  earliestStats: { $last: '$$ROOT' }
                }
              },
              {
                $project: {
                  userId: '$_id',
                  xpGained: { $subtract: ['$latestStats.totalXp', '$earliestStats.totalXp'] }
                }
              },
              {
                $match: {
                  xpGained: { $gt: myXp }
                }
              },
              {
                $count: "count"
              }
            ]);
            
            myRank = betterUsersCount.length > 0 ? betterUsersCount[0].count + 1 : 1;
          }
        } else {
          myXp = user.totalXp;
          if (myXp) {
            const myRankQuery = await User.find({ totalXp: { $gt: myXp }, banned: false }).countDocuments();
            myRank = myRankQuery + 1;
          }
        }
      }
    }

    // Return the leaderboard
    return res.status(200).json({ leaderboard, myRank, myXp });
  } catch (error) {
    console.log("lb error", error);
    return res.status(500).json({ message: 'An error occurred', error: error.message });
  }
} else {
  try {
    let leaderboard;
    if (pastDay) {
      if (pastDayCacheElo.data && pastDayCacheElo.timestamp && Date.now() - pastDayCacheElo.timestamp < 60000) {
        leaderboard = pastDayCacheElo.data;
      } else {
        // Get current time and 24 hours ago
        const now = new Date();
        const dayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

        // Optimized ELO changes calculation
        const eloChanges = await UserStats.aggregate([
          {
            // First get recent stats to identify active users
            $match: {
              timestamp: { $gte: dayAgo }
            }
          },
          {
            $sort: { userId: 1, timestamp: -1 }
          },
          {
            $group: {
              _id: '$userId',
              latestStat: { $first: '$$ROOT' }
            }
          },
          {
            // Now get the historical stat for each active user
            $lookup: {
              from: 'userstats',
              let: { userId: '$_id', cutoff: dayAgo },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$userId', '$$userId'] },
                        { $lte: ['$timestamp', '$$cutoff'] }
                      ]
                    }
                  }
                },
                { $sort: { timestamp: -1 } },
                { $limit: 1 }
              ],
              as: 'historicalStat'
            }
          },
          {
            $match: {
              'historicalStat.0': { $exists: true }
            }
          },
          {
            $project: {
              userId: '$_id',
              currentElo: '$latestStat.elo',
              previousElo: { $arrayElemAt: ['$historicalStat.elo', 0] },
              eloChange: {
                $subtract: [
                  '$latestStat.elo',
                  { $arrayElemAt: ['$historicalStat.elo', 0] }
                ]
              }
            }
          },
          {
            $match: {
              eloChange: { $ne: 0 }
            }
          },
          {
            $sort: { eloChange: -1 }
          },
          {
            $limit: 100
          }
        ]);

        // Get user details for the users with ELO changes
        const userIds = eloChanges.map(change => change.userId);
        const users = await User.find({
          _id: { $in: userIds },
          banned: false
        }).select('_id username elo totalXp created_at games').lean();

        const userMap = new Map(users.map(u => [u._id.toString(), u]));

        // Build leaderboard with user info and ELO changes
        leaderboard = eloChanges.map(change => {
          const user = userMap.get(change.userId);
          if (!user || !user.username) return null;
          
          return {
            username: user.username,
            totalXp: user.totalXp || 0,
            createdAt: user.created_at,
            gamesLen: user.games?.length || 0,
            elo: change.eloChange, // Show the delta for daily leaderboard
            eloToday: change.eloChange // This represents the 24h change
          };
        }).filter(user => user !== null);

        pastDayCacheElo.data = leaderboard;
        pastDayCacheElo.timestamp = Date.now();
      }
    } else {
      if (cacheElo.data && cacheElo.timestamp && Date.now() - cacheElo.timestamp < 60000) {
        leaderboard = cacheElo.data;
      } else {
        const topUsers = await User.find({ banned: false }).sort({ elo: -1 }).limit(100); // Sort by Elo
        leaderboard = topUsers.map(sendableUser).filter(user => user !== null);
        cacheElo.data = leaderboard;
        cacheElo.timestamp = Date.now();
      }
    }

    let myRank = null;
    let myElo = null;
    if (myUsername) {
      const user = await User.findOne({ username: myUsername });
      if (user) {
        if (pastDay) {
          // Calculate user's 24h ELO change and rank among daily changes
          const dayAgo = new Date(Date.now() - (24 * 60 * 60 * 1000));
          
          const userEloChange = await UserStats.aggregate([
            {
              $match: {
                userId: user._id.toString()
              }
            },
            {
              $sort: { timestamp: -1 }
            },
            {
              $group: {
                _id: '$userId',
                allStats: { $push: '$$ROOT' }
              }
            },
            {
              $project: {
                currentStats: { $arrayElemAt: ['$allStats', 0] },
                stats24hAgo: {
                  $reduce: {
                    input: '$allStats',
                    initialValue: null,
                    in: {
                      $cond: {
                        if: {
                          $and: [
                            { $lte: ['$$this.timestamp', dayAgo] },
                            { $or: [
                              { $eq: ['$$value', null] },
                              { $gt: ['$$this.timestamp', '$$value.timestamp'] }
                            ]}
                          ]
                        },
                        then: '$$this',
                        else: '$$value'
                      }
                    }
                  }
                }
              }
            },
            {
              $project: {
                eloChange: {
                  $cond: {
                    if: { $ne: ['$stats24hAgo', null] },
                    then: { $subtract: ['$currentStats.elo', '$stats24hAgo.elo'] },
                    else: 0
                  }
                }
              }
            }
          ]);

          if (userEloChange.length > 0) {
            myElo = userEloChange[0].eloChange;
            
            // Count users with better ELO changes
            const betterUsersCount = await UserStats.aggregate([
              {
                $match: {}
              },
              {
                $sort: { userId: 1, timestamp: -1 }
              },
              {
                $group: {
                  _id: '$userId',
                  allStats: { $push: '$$ROOT' }
                }
              },
              {
                $project: {
                  userId: '$_id',
                  currentStats: { $arrayElemAt: ['$allStats', 0] },
                  stats24hAgo: {
                    $reduce: {
                      input: '$allStats',
                      initialValue: null,
                      in: {
                        $cond: {
                          if: {
                            $and: [
                              { $lte: ['$$this.timestamp', dayAgo] },
                              { $or: [
                                { $eq: ['$$value', null] },
                                { $gt: ['$$this.timestamp', '$$value.timestamp'] }
                              ]}
                            ]
                          },
                          then: '$$this',
                          else: '$$value'
                        }
                      }
                    }
                  }
                }
              },
              {
                $project: {
                  userId: '$_id',
                  eloChange: {
                    $cond: {
                      if: { $ne: ['$stats24hAgo', null] },
                      then: { $subtract: ['$currentStats.elo', '$stats24hAgo.elo'] },
                      else: 0
                    }
                  }
                }
              },
              {
                $match: {
                  eloChange: { $gt: myElo }
                }
              },
              {
                $count: "count"
              }
            ]);
            
            myRank = betterUsersCount.length > 0 ? betterUsersCount[0].count + 1 : 1;
          }
        } else {
          // All-time ELO leaderboard
          myElo = user.elo;
          if (myElo) {
            const myRankQuery = await User.find({ elo: { $gt: myElo }, banned: false }).countDocuments();
            myRank = myRankQuery + 1;
          }
        }
      }
    }

    return res.status(200).json({ leaderboard, myRank, myElo });
  } catch (error) {
    console.log("elo error", error);
    return res.status(500).json({ message: 'An error occurred', error: error.message });
  }
}
}
