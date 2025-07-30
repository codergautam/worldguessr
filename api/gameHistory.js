import Game from '../models/Game.js';
import User from '../models/User.js';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { secret, page = 1, limit = 10 } = req.body;

  // Validate secret
  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid secret' });
  }

  try {
    // Verify user exists
    const user = await User.findOne({ secret });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
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

    // Format games for frontend
    const formattedGames = games.map(game => {
      // Find the user's player data  
      const userPlayer = game.players.find(player => player.accountId === user._id.toString() || player.accountId === secret);
      
      // For ranked duels, find opponent data
      let opponentPlayer = null;
      if (game.gameType === 'ranked_duel') {
        opponentPlayer = game.players.find(player => 
          player.accountId !== user._id.toString() && player.accountId !== secret
        );
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
          elo: userPlayer?.elo || null
        },
        
        // Game settings
        settings: {
          location: game.settings?.location || 'all',
          rounds: game.settings?.rounds || 5,
          maxDist: game.settings?.maxDist || 20000,
          timePerRound: game.settings?.timePerRound,
          official: game.settings?.official ?? true
        },
        
        // Game result
        result: {
          maxPossiblePoints: game.result?.maxPossiblePoints || (game.settings?.rounds || 5) * 5000,
          winner: game.result?.winner,
          isDraw: game.result?.isDraw || false
        },
        
        // Multiplayer info (if applicable)
        multiplayer: game.gameType !== 'singleplayer' ? {
          isPublic: game.multiplayer?.isPublic || false,
          playerCount: game.players?.length || 1,
          gameCode: game.multiplayer?.gameCode
        } : null,
        
        // Opponent info (for ranked duels)
        opponent: opponentPlayer ? {
          username: opponentPlayer.username,
          totalPoints: opponentPlayer.totalPoints || 0,
          finalRank: opponentPlayer.finalRank || 2,
          elo: opponentPlayer.elo || null
        } : null,
        
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