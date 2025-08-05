import Game from '../models/Game.js';
import User from '../models/User.js';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { secret, gameId } = req.body;

  // Validate inputs
  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid secret' });
  }

  if (!gameId || typeof gameId !== 'string') {
    return res.status(400).json({ message: 'Invalid gameId' });
  }

  try {
    // Verify user exists
    const user = await User.findOne({ secret });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Fetch the specific game
    const game = await Game.findOne({
      gameId: gameId,
      'players.accountId': user._id // Ensure user participated in this game
    }).lean();

    if (!game) {
      return res.status(404).json({ message: 'Game not found or access denied' });
    }

    // Format the game data for roundOverScreen
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
        // Find user's guess for this round
        const userGuess = round.playerGuesses.find(guess => guess.accountId === user._id.toString());
        
        return {
          roundNumber: round.roundNumber,
          location: round.location,
          
          // User's guess data
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
            playerId: guess.accountId, // Use accountId instead of playerId to avoid exposing secrets
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
      
      // All players (for multiplayer games)
      players: game.players.map(player => ({
        playerId: player.accountId, // Use accountId instead of playerId to avoid exposing secrets
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
      
      // Find the requesting user's player data
      userPlayer: game.players.find(player => player.accountId === user._id.toString()),
      
      // Add user's _id for frontend comparisons
      currentUserId: user._id.toString()
    };

    return res.status(200).json({ game: formattedGame });

  } catch (error) {
    console.error('Game details error:', error);
    return res.status(500).json({ 
      message: 'An error occurred while fetching game details',
      error: error.message 
    });
  }
}