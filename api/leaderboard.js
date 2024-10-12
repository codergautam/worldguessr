import mongoose from 'mongoose';
import User from '../models/User.js';
const cache = { data: null, timestamp: null };
const pastDayCache = { data: null, timestamp: null };

function sendableUser(user) {
  if (!user.username) {
    return null;
  }
  return {
    username: user.username,
    totalXp: user.totalXp ?? user.xpGained,
    createdAt: user.created_at,
    gamesLen: user.games?.length ?? 0,
  };
}

export default async function handler(req, res) {
  const myUsername = req.query.username;
  const pastDay = req.query.pastDay === 'true';
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Connect to MongoDB
  if (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(process.env.MONGODB);
    } catch (error) {
      return res.status(500).json({ message: 'Database connection failed', error: error.message });
    }
  }

  try {
    // Fetch top 100 users by XP

    // Format response data
    let leaderboard;
    if (pastDay) {
      // get past day leaderboard

      if (pastDayCache.data && pastDayCache.timestamp && Date.now() - pastDayCache.timestamp < 60000) {
        leaderboard = pastDayCache.data;
      } else {

        const currentDate = new Date(); // Current date and time
        const dayAgo = new Date(currentDate.getTime() - (24 * 60 * 60 * 1000)); // Date and time 24 hours ago

        const topUsers = await User.aggregate([
          {
            $match: {
              banned: false, // Assuming you want to exclude banned users
              "games.time": { $gte: dayAgo } // Filter games played within the last 24 hours
            }
          },
          {
            $project: {
              username: 1,
              games: {
                $filter: {
                  input: "$games",
                  as: "game",
                  cond: { $gte: ["$$game.time", dayAgo] } // Filter to only include recent games
                }
              }
            }
          },
          {
            $unwind: "$games" // Flatten the games array
          },
          {
            $group: {
              _id: "$_id",
              username: { $first: "$username" },
              xpGained: { $sum: "$games.xp" }, // Sum the XP gained in the last day
            }
          },
          {
            $sort: { xpGained: -1 } // Sort users by XP gained in descending order
          },
          {
            $limit: 100 // Limit to the top 100 users
          }
        ]);


        leaderboard = topUsers.map(sendableUser).filter(user => user !== null);
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
          const currentDate = new Date(); // Current date and time
          const dayAgo = new Date(currentDate.getTime() - (24 * 60 * 60 * 1000)); // Date and time 24 hours ago

          const userRank = await User.aggregate([
            {
              $match: {
                banned: false,
                "games.time": { $gte: dayAgo } // Only consider games within the last 24 hours
              }
            },
            {
              $project: {
                username: 1,
                games: {
                  $filter: {
                    input: "$games",
                    as: "game",
                    cond: { $gte: ["$$game.time", dayAgo] } // Filter games played in the last 24 hours
                  }
                }
              }
            },
            {
              $unwind: "$games"
            },
            {
              $group: {
                _id: "$_id",
                username: { $first: "$username" },
                xpGained: { $sum: "$games.xp" }
              }
            },
            {
              $sort: { xpGained: -1 }
            },
            {
              $group: {
                _id: null,
                users: { $push: { username: "$username", xpGained: "$xpGained" } }
              }
            },
            {
              $unwind: {
                path: "$users",
                includeArrayIndex: "rank" // This will add a "rank" field starting at 0
              }
            },
            {
              $match: { "users.username": myUsername } // Find the specific user
            },
            {
              $project: {
                rank: { $add: ["$rank", 1] }, // Since index starts at 0, we add 1 to start ranks at 1
                xpGained: "$users.xpGained"
              }
            }
          ]);

          if (userRank && userRank.length > 0) {
            myRank = userRank[0].rank;
            myXp = userRank[0].xpGained;
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
}
