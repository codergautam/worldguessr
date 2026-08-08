import mongoose from 'mongoose';
import User, { USERNAME_COLLATION } from '../models/User.js';
import { getLeague } from '../components/utils/leagues.js';
import { MIN_ELO, clampRating } from '../components/utils/eloSystem.js';
import { RATING_V2 } from '../components/utils/ratingFlags.js';
import { rateLimit } from '../utils/rateLimit.js';
import { syncForumUser } from '../serverUtils/syncForumUser.js';

// given a username return the elo and the rank of the user
export default async function handler(req, res) {
  const { username, secret, id } = req.query;
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  console.log(`[API] eloRank: ${username || '(by secret)'} | IP: ${ip}`);

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Rate limiting: 10 requests per 5 seconds per IP
  const limiter = rateLimit({ max: 10, windowMs: 5000 });
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
    let foundBySecret = false;

    if(secret && typeof secret === 'string') {
      // Prevent NoSQL injection - secret must be a string
      user = await User.findOne({ secret }).cache(120);
      if (user) foundBySecret = true;
    } else if(id && typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
      // Preferred lookup: the account id never changes, unlike the username
      // (renames + forum-name normalization make name lookups ambiguous)
      user = await User.findById(id).cache(120);
    } else if(username && typeof username === 'string') {
      // Prevent NoSQL injection - username must be a string
      user = await User.findOne({ username: username }).collation(USERNAME_COLLATION).cache(120);
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // If not found by their own secret, hide banned or pending-name-change users
    if (!foundBySecret && (user.banned || user.pendingNameChange)) {
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
      ratedGames: user.ratedGames || 0,
      // `|| 0` guards the 0/0 -> NaN case (e.g. a user whose only ranked games
      // were all refunded), matching crazyAuth/googleAuth's win_rate guard.
      win_rate: user.duels_wins / (user.duels_wins + user.duels_losses + user.duels_tied) || 0,
      team2v2_wins: user.team2v2_wins || 0,
      team2v2_losses: user.team2v2_losses || 0,
      team2v2_tied: user.team2v2_tied || 0,
      team2v2_win_rate: ((user.team2v2_wins || 0) + (user.team2v2_losses || 0) + (user.team2v2_tied || 0)) > 0
        ? (user.team2v2_wins || 0) / ((user.team2v2_wins || 0) + (user.team2v2_losses || 0) + (user.team2v2_tied || 0))
        : 0
     });
  } catch (error) {
    return res.status(500).json({ message: 'An error occurred', error: error.message });
  }
}

/**
 * The win/loss/tie (and rated-game) counters for one finished duel, as a $inc
 * fragment. Pure and exported so the draw case can be asserted in a unit test.
 *
 * `draw` MUST be tested before `winner`: a draw is signalled as {draw:true}
 * with no `winner` key at all, so reading `winner` first makes undefined falsy
 * and books the draw as a LOSS as well as a tie (the bug this replaces).
 */
export function duelCounterIncs({ winner, draw, rated = true }) {
  const ratedGames = rated ? 1 : 0;
  if (draw) return { duels_wins: 0, duels_losses: 0, duels_tied: 1, ratedGames };
  if (winner) return { duels_wins: 1, duels_losses: 0, duels_tied: 0, ratedGames };
  return { duels_wins: 0, duels_losses: 1, duels_tied: 0, ratedGames };
}

export async function setElo(accountId, newElo, gameData) {

  // gamedata -> {draw:true|false, winner: true|false, rated: true|false}
  try {

    // Last line of defense: a stored elo of 0 (falsy) voids the ranked
    // gates in ws.js/Game.js, so the floor is enforced at the write itself.
    // v2 floors at RATING_FLOOR (100) rather than v1's MIN_ELO (1).
    newElo = RATING_V2 ? clampRating(newElo) : Math.max(MIN_ELO, Math.round(newElo));

    // Bot games are unrated under v2, so the caller decides. Default rated.
    const rated = gameData.rated ?? true;

    const setFields = { elo: newElo };
    // Only a rated game is ladder activity: the 14-day leaderboard inactivity
    // rule must not be held open by unrated (bot) games.
    if (rated) setFields.lastRankedAt = new Date();

    await User.updateOne({ _id: accountId }, {
      $set: setFields,
      // `duels_played: 1` used to be inc'd here; the field is not in the User
      // schema, so mongoose strict mode was already discarding it every write.
      $inc: {
        ...duelCounterIncs({ winner: gameData.winner, draw: gameData.draw, rated }),
        elo_today: newElo - gameData.oldElo,
      }
    });

    // If this game moved the player into a different league, push the new
    // league color (and byline) to the forum. League changes are rare, so this
    // fires far less often than every game.
    if (gameData.oldElo != null &&
        getLeague(gameData.oldElo).name !== getLeague(newElo).name) {
      const u = await User.findById(accountId);
      if (u) syncForumUser(u);
    }
  } catch (error) {
    console.error('Error setting elo:', error.message);
  }

}

/**
 * Write a brand-new account's placement rating (see placementSeed()).
 *
 * Deliberately does NOT touch ratedGames: the K schedule starts at game 2, so
 * a placement must leave the counter where it is.
 *
 * Returns true only if the seed actually landed.
 */
export async function applyPlacementSeed(accountId, seed, playerObj) {
  try {
    const rating = clampRating(seed);
    // A NaN rating is falsy and would void every ranked gate downstream.
    if (!Number.isFinite(rating)) {
      console.error('Invalid placement seed:', seed, 'for account:', accountId);
      return false;
    }

    // The `ratedGames: 0` in the FILTER is load-bearing: it makes the seed
    // write a structural no-op against any account that has ever played a
    // rated game, including a veteran who somehow reached a placement match.
    // Legacy documents predating the field have no ratedGames at all and so
    // match nothing either, which fails in the safe direction.
    const result = await User.updateOne(
      { _id: accountId, ratedGames: 0 },
      { $set: { elo: rating, lastRankedAt: new Date() } }
    );

    const applied = (result?.matchedCount ?? result?.n ?? 0) > 0;

    // Mirror into the live ws Player only once the DB accepted the seed: on a
    // filtered-out account the write was a no-op and their real rating stands.
    // Done by hand rather than via playerObj.setElo(), which would issue a
    // second, UNGATED write and defeat the filter above.
    if (applied && playerObj) {
      playerObj.elo = rating;
      playerObj.league = getLeague(rating).name;
      playerObj.send?.({ type: 'elo', elo: rating, league: getLeague(rating) });
    }

    return applied;
  } catch (error) {
    console.error('Error applying placement seed:', error.message);
    return false;
  }
}
