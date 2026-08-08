import mongoose from 'mongoose';
import Game from '../models/Game.js';
import User from '../models/User.js';

/**
 * Equipped name glow for every account on a page of history, in ONE query.
 *
 * RESOLVED LIVE, NOT READ OFF THE GAME DOCUMENT. A Game is a frozen record of a
 * match; a cosmetic is current identity. Baking the sku in at save time would
 * mean a player's history showed the glow they wore last March — and it would
 * need a migration to backfill anything before today, which is a lot of work to
 * produce the wrong answer.
 *
 * ObjectId.isValid FILTER, not a raw $in. `players.accountId` is a plain string
 * on the Game document (that is how the caller compares it), bots and guests
 * store null, and one malformed legacy value in a page of fifty games would
 * throw a CastError and take the whole history request down with it.
 *
 * Fails to an empty Map: no glows is what this page rendered yesterday, and a
 * decoration must not be able to 500 a history request.
 */
async function glowsForGames(games) {
  const ids = new Set();
  for (const game of games) {
    for (const p of (game.players || [])) {
      if (p.accountId && mongoose.Types.ObjectId.isValid(p.accountId)) ids.add(String(p.accountId));
    }
  }
  if (!ids.size) return new Map();
  try {
    const users = await User.find({ _id: { $in: [...ids] } })
      .select('_id cosmetics.equipped.nameGlow')
      .lean()
      .maxTimeMS(2000);
    return new Map(users.map((u) => [u._id.toString(), u.cosmetics?.equipped?.nameGlow || null]));
  } catch (e) {
    console.warn('[gameHistory] glow lookup failed (non-critical):', e.message);
    return new Map();
  }
}

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { secret, targetUserId, page = 1, limit = 10 } = req.body;

  // Validate secret
  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid secret' });
  }

  try {
    // Verify requesting user exists
    const requestingUser = await User.findOne({ secret });
    if (!requestingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // If targetUserId is provided, verify the requester is staff
    let user;
    if (targetUserId) {
      if (!requestingUser.staff) {
        return res.status(403).json({ message: 'Unauthorized' });
      }
      user = await User.findById(targetUserId);
      if (!user) {
        return res.status(404).json({ message: 'Target user not found' });
      }
    } else {
      user = requestingUser;
    }

    // Calculate pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit))); // Max 50 games per page
    const skip = (pageNum - 1) * limitNum;

    // Fetch user's games with pagination
    const games = await Game.find({
      'players.accountId': user._id
    })
    .sort({ endedAt: -1 }) // Most recent first
    .skip(skip)
    .limit(limitNum)
    .lean();

    // Get total count for pagination
    const totalGames = await Game.countDocuments({
      'players.accountId': user._id
    });

    // Calculate pagination info
    const totalPages = Math.ceil(totalGames / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    // One lookup for the whole page, before the synchronous format pass below.
    const glowByAccountId = await glowsForGames(games);
    const glowOf = (accountId) => (accountId ? glowByAccountId.get(String(accountId)) || null : null);

    // Format games for frontend
    const formattedGames = games.map(game => {
      // Find the user's player data  
      const userPlayer = game.players.find(player => player.accountId === user._id.toString());
      
      // For ranked duels, find opponent data
      let opponentPlayer = null;
      if (game.gameType === 'ranked_duel') {
        opponentPlayer = game.players.find(player =>
          player.accountId !== user._id.toString()
        );
      }

      // Team games (matchmade 2v2 + party team mode): split the roster into
      // the user's teammates and the opposing team for the history card.
      // Same accountId-null convention as opponent below (bots/guests get no
      // profile link).
      let teammates = null;
      let teamOpponents = null;
      if ((game.gameType === '2v2' || game.settings?.teamGame) && userPlayer?.team) {
        const rosterEntry = (p) => ({
          username: p.username,
          accountId: p.accountId || null,
          countryCode: p.countryCode ?? null,
          nameGlow: glowOf(p.accountId)
        });
        teammates = game.players
          .filter(p => p.team === userPlayer.team && p.accountId !== user._id.toString())
          .map(rosterEntry);
        teamOpponents = game.players
          .filter(p => p.team && p.team !== userPlayer.team)
          .map(rosterEntry);
      }

      return {
        gameId: game.gameId,
        gameType: game.gameType,
        startedAt: game.startedAt,
        endedAt: game.endedAt,
        totalDuration: game.totalDuration,
        
        // User's performance
        userStats: {
          totalPoints: userPlayer?.totalPoints || 0,
          totalXp: userPlayer?.totalXp || 0,
          averageTimePerRound: userPlayer?.averageTimePerRound || 0,
          finalRank: userPlayer?.finalRank || 1,
          elo: userPlayer?.elo || null,
          team: userPlayer?.team || null
        },

        // Game settings
        settings: {
          location: game.settings?.location || 'all',
          // settings.rounds is stamped as completed-round count at save time,
          // so 0 is a real value (forfeit before round 1) — ?? not ||.
          rounds: game.settings?.rounds ?? 5,
          maxDist: game.settings?.maxDist || 20000,
          timePerRound: game.settings?.timePerRound,
          official: game.settings?.official ?? true,
          countryGuesser: game.settings?.countryGuesser || false,
          countryGuessrSubMode: game.settings?.countryGuessrSubMode || null,
          teamGame: game.settings?.teamGame || false,
          teamScoring: game.settings?.teamScoring || null
        },

        // Game result
        result: {
          // maxPossiblePoints is required in the model and stamped from
          // roundHistory.length at every save site, so 0 is a real value
          // (zero-round forfeit). || fabricated "0 / 25,000" rows in the
          // history list; the computed fallback is legacy-doc insurance only.
          maxPossiblePoints: game.result?.maxPossiblePoints ?? (game.settings?.rounds ?? 5) * (game.settings?.countryGuesser ? 1000 : 5000),
          winner: game.result?.winner,
          winningTeam: game.result?.winningTeam || null,
          isDraw: game.result?.isDraw || false
        },
        
        // Multiplayer info (if applicable)
        multiplayer: (game.gameType !== 'singleplayer' && game.gameType !== 'daily_challenge') ? {
          isPublic: game.multiplayer?.isPublic || false,
          playerCount: game.players?.length || 1,
          gameCode: game.multiplayer?.gameCode
        } : null,
        
        // Opponent info (for ranked duels). accountId is null for bot
        // opponents — clients use it to skip the profile link (bots have no
        // profile page).
        opponent: opponentPlayer ? {
          username: opponentPlayer.username,
          accountId: opponentPlayer.accountId || null,
          countryCode: opponentPlayer.countryCode ?? null,
          nameGlow: glowOf(opponentPlayer.accountId),
          totalPoints: opponentPlayer.totalPoints || 0,
          finalRank: opponentPlayer.finalRank || 2,
          elo: opponentPlayer.elo || null
        } : null,

        // Team rosters (2v2 / party team games), null elsewhere
        teammates,
        opponents: teamOpponents,

        // Round count for display
        roundsPlayed: game.rounds?.length || 0
      };
    });

    return res.status(200).json({
      games: formattedGames,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalGames,
        hasNextPage,
        hasPrevPage,
        limit: limitNum
      }
    });

  } catch (error) {
    console.error('Game history error:', error);
    return res.status(500).json({ 
      message: 'An error occurred while fetching game history',
      error: error.message 
    });
  }
}