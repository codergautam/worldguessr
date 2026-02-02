import mongoose from 'mongoose';
import User, { USERNAME_COLLATION } from '../models/User.js';
import { getLeague } from '../components/utils/leagues.js';
import { rateLimit } from '../utils/rateLimit.js';

// given a username return the elo and the rank of the user
export default async function handler(req, res) {
  const { username, secret } = req.query;
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  console.log(`[API] eloRank: ${username || '(by secret)'} | IP: ${ip}`);
  
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Rate limiting: 30 requests per minute per IP
  const limiter = rateLimit({ max: 30, windowMs: 60000 });
  if (!limiter(req, res)) {
    console.log(`[API] eloRank: RATE LIMITED | IP: ${ip}`);
    return; // Rate limit exceeded, response already sent
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

    let user;
    if(username && typeof username === 'string') {
      // Prevent NoSQL injection - username must be a string
      user = await User.findOne({ username: username }).collation(USERNAME_COLLATION).cache(120);
    } else if(secret && typeof secret === 'string') {
      // Prevent NoSQL injection - secret must be a string
      user = await User.findOne({ secret }).cache(120);
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const rank = (await User.countDocuments({
      elo: { $gt: user.elo },
      banned: false
    }).cache(2000)) + 1;

    // Return the user's elo and rank
    return res.status(200).json({
      id: user._id,
      elo: user.elo,
      rank,
      league: getLeague(user.elo),
      duels_wins: user.duels_wins,
      duels_losses: user.duels_losses,
      duels_tied: user.duels_tied,
      win_rate: user.duels_wins / (user.duels_wins + user.duels_losses + user.duels_tied)
     });
  } catch (error) {
    return res.status(500).json({ message: 'An error occurred', error: error.message });
  }
}

export async function setElo(accountId, newElo, gameData) {

  // gamedata -> {draw:true|false, winner: true|false}
  try {


    await User.updateOne({ _id: accountId }, { elo: newElo,
      $inc: { duels_played: 1, duels_wins: gameData.winner ? 1 : 0, duels_losses: gameData.winner ? 0 : 1, duels_tied: gameData.draw ? 1 : 0,
        elo_today: newElo - gameData.oldElo,

       }

     });
  } catch (error) {
    console.error('Error setting elo:', error.message);
  }

}
