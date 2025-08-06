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

        // Get XP changes over the last 24 hours using UserStats
        const xpChanges = await UserStats.aggregate([
          {
            // Match stats within the last 24 hours
            $match: {
              timestamp: { $gte: dayAgo }
            }
          },
          {
            // Sort by user and timestamp to get latest first
            $sort: { userId: 1, timestamp: -1 }
          },
          {
            // Group by user to get latest and earliest stats in the period
            $group: {
              _id: '$userId',
              latestStats: { $first: '$$ROOT' },
              earliestStats: { $last: '$$ROOT' },
              statsCount: { $sum: 1 }
            }
          },
          {
            // Calculate XP change
            $project: {
              userId: '$_id',
              currentXp: '$latestStats.totalXp',
              previousXp: '$earliestStats.totalXp',
              xpGained: { $subtract: ['$latestStats.totalXp', '$earliestStats.totalXp'] },
              latestTimestamp: '$latestStats.timestamp',
              statsCount: 1
            }
          },
          {
            // Only include users with actual XP gains
            $match: {
              xpGained: { $gt: 0 }
            }
          },
          {
            // Sort by XP gained descending
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

        // Get ELO changes over the last 24 hours using UserStats
        const eloChanges = await UserStats.aggregate([
          {
            // Match stats within the last 24 hours
            $match: {
              timestamp: { $gte: dayAgo }
            }
          },
          {
            // Sort by user and timestamp to get latest first
            $sort: { userId: 1, timestamp: -1 }
          },
          {
            // Group by user to get latest and earliest stats in the period
            $group: {
              _id: '$userId',
              latestStats: { $first: '$$ROOT' },
              earliestStats: { $last: '$$ROOT' },
              statsCount: { $sum: 1 }
            }
          },
          {
            // Calculate ELO change
            $project: {
              userId: '$_id',
              currentElo: '$latestStats.elo',
              previousElo: '$earliestStats.elo',
              eloChange: { $subtract: ['$latestStats.elo', '$earliestStats.elo'] },
              latestTimestamp: '$latestStats.timestamp',
              statsCount: 1
            }
          },
          {
            // Only include users with actual ELO changes (positive or negative)
            $match: {
              eloChange: { $ne: 0 }
            }
          },
          {
            // Sort by ELO change descending
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
            elo: change.currentElo,
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
                eloChange: { $subtract: ['$latestStats.elo', '$earliestStats.elo'] }
              }
            }
          ]);

          if (userEloChange.length > 0) {
            myElo = userEloChange[0].eloChange;
            
            // Count users with better ELO changes
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
                  eloChange: { $subtract: ['$latestStats.elo', '$earliestStats.elo'] }
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
