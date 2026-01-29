import Game from '../../models/Game.js';
import User from '../../models/User.js';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { secret, gameId, targetUserId } = req.body;

  // Validate inputs
  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid secret' });
  }

  if (!gameId || typeof gameId !== 'string') {
    return res.status(400).json({ message: 'Invalid gameId' });
  }

  try {
    // Verify requesting user is staff
    const requestingUser = await User.findOne({ secret });
    if (!requestingUser || !requestingUser.staff) {
      return res.status(403).json({ message: 'Unauthorized - staff access required' });
    }

    // Handle profile reports (no game to display)
    if (gameId === 'PROFILE_REPORT') {
      return res.status(400).json({
        message: 'No game details available for profile reports',
        isProfileReport: true
      });
    }

    // Fetch the specific game (no player check for staff)
    const game = await Game.findOne({ gameId: gameId }).lean();

    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    // Determine which user's perspective to use (for displaying the game)
    // Use targetUserId if provided AND it matches a player in the game
    // Otherwise fall back to first player with an accountId
    let perspectiveUserId = targetUserId;

    // Validate that targetUserId is actually a player in this game
    const targetPlayerMatch = perspectiveUserId ?
      game.players.find(p => p.accountId === perspectiveUserId || p.playerId === perspectiveUserId) : null;

    if (!targetPlayerMatch) {
      // targetUserId not in game (e.g., moderator viewing) - use first player as perspective
      const firstAccountPlayer = game.players.find(p => p.accountId);
      perspectiveUserId = firstAccountPlayer?.accountId || game.players[0]?.playerId;
    }

    // Format the game data for HistoricalGameView
    const formattedGame = {
      gameId: game.gameId,
      gameType: game.gameType,
      startedAt: game.startedAt,
      endedAt: game.endedAt,
      totalDuration: game.totalDuration,

      // Game settings
      settings: game.settings,

      // All rounds with locations and guesses
      rounds: game.rounds.map((round, index) => {
        // Find the perspective user's guess for this round
        const userGuess = round.playerGuesses.find(guess =>
          guess.accountId === perspectiveUserId || guess.playerId === perspectiveUserId
        );

        return {
          roundNumber: round.roundNumber,
          location: round.location,

          // User's guess data (from perspective user)
          guess: userGuess ? {
            guessLat: userGuess.guessLat,
            guessLong: userGuess.guessLong,
            points: userGuess.points,
            timeTaken: userGuess.timeTaken,
            xpEarned: userGuess.xpEarned,
            usedHint: userGuess.usedHint,
            guessedAt: userGuess.guessedAt
          } : null,

          // All player guesses (for multiplayer games)
          allGuesses: round.playerGuesses.map(guess => ({
            playerId: guess.accountId || guess.playerId,
            username: guess.username,
            guessLat: guess.guessLat,
            guessLong: guess.guessLong,
            points: guess.points,
            timeTaken: guess.timeTaken,
            xpEarned: guess.xpEarned,
            usedHint: guess.usedHint
          })),

          startedAt: round.startedAt,
          endedAt: round.endedAt,
          roundTimeLimit: round.roundTimeLimit
        };
      }),

      // All players
      players: game.players.map(player => ({
        playerId: player.accountId || player.playerId,
        username: player.username,
        accountId: player.accountId,
        totalPoints: player.totalPoints,
        totalXp: player.totalXp,
        averageTimePerRound: player.averageTimePerRound,
        finalRank: player.finalRank,
        elo: player.elo
      })),

      // Game result
      result: game.result,

      // Multiplayer info
      multiplayer: game.multiplayer,

      // Find the perspective user's player data
      userPlayer: game.players.find(player =>
        player.accountId === perspectiveUserId || player.playerId === perspectiveUserId
      ),

      // Add perspective user's ID for frontend comparisons
      currentUserId: perspectiveUserId
    };

    return res.status(200).json({ game: formattedGame });

  } catch (error) {
    console.error('Mod game details error:', error);
    return res.status(500).json({
      message: 'An error occurred while fetching game details',
      error: error.message
    });
  }
}

