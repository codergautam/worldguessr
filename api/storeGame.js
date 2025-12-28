// import ratelimiter from '@/components/utils/ratelimitMiddleware'
import ratelimiter from '../components/utils/ratelimitMiddleware.js';
import Game from '../models/Game.js';
import User from '../models/User.js';
import UserStatsService from '../components/utils/userStatsService.js';
import { createUUID } from '../components/createUUID.js';

// Handle singleplayer game completion
async function guess(req, res) {
  const { secret, maxDist, rounds, official, location } = req.body;

  // secret must be string
  if(typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid input' });
  }

  // Handle batch rounds (singleplayer game completion)
  if(rounds && Array.isArray(rounds)) {
    if(secret) {
      try {
        // Get user info
        const user = await User.findOne({ secret });
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        // Generate unique game ID
        const gameId = `sp_${createUUID()}`;
        
        // Calculate realistic game timing
        const totalRoundTime = rounds.reduce((sum, round) => sum + round.roundTime, 0);
        const gameEndTime = new Date();
        const gameStartTime = new Date(gameEndTime.getTime() - (totalRoundTime * 1000) - (rounds.length * 10000)); // Add 10s between rounds

        // Calculate total duration and points
        const totalDuration = rounds.reduce((sum, round) => sum + round.roundTime, 0); // Keep in seconds
        const totalPoints = rounds.reduce((sum, round) => sum + round.points, 0); // Use actual points from rounds
        
        // Validate and cap XP to prevent exploitation
        // Max XP per round is 100 (5000 points / 50), cap total at 500 per request
        const MAX_XP_PER_ROUND = 100;
        const MAX_TOTAL_XP = 500;
        
        let totalXp = rounds.reduce((sum, round) => {
          const roundXp = Math.min(Math.max(0, round.xp || 0), MAX_XP_PER_ROUND);
          return sum + roundXp;
        }, 0);
        
        // Cap total XP
        if (totalXp > MAX_TOTAL_XP) {
          console.warn(`XP cap exceeded for user ${user.username}: attempted ${totalXp}, capped to ${MAX_TOTAL_XP}`);
          totalXp = MAX_TOTAL_XP;
        }

        // Prepare rounds data for Games collection
        let currentRoundStart = gameStartTime.getTime();
        const gameRounds = rounds.map((round, index) => {
          const { lat: guessLat, long: guessLong, actualLat, actualLong, usedHint, maxDist, roundTime, xp, points } = round;
          const actualPoints = points; // Use actual points from frontend
          
          const roundStart = new Date(currentRoundStart);
          const roundEnd = new Date(currentRoundStart + (roundTime * 1000));
          const guessTime = new Date(currentRoundStart + (roundTime * 1000));
          
          // Move to next round (add round time + 10 seconds between rounds)
          currentRoundStart += (roundTime * 1000) + 10000;
          
          return {
            roundNumber: index + 1,
            location: {
              lat: actualLat,
              long: actualLong,
              panoId: round.panoId || null,
              country: round.country || null, // We don't have country data in the current structure
              place: round.place || null
            },
            playerGuesses: [{
              playerId: user._id,
              username: user.username || 'Player',
              accountId: user._id,
              guessLat: guessLat,
              guessLong: guessLong,
              points: actualPoints,
              timeTaken: roundTime,
              xpEarned: xp || 0,
              guessedAt: guessTime,
              usedHint: usedHint || false
            }],
            startedAt: roundStart,
            endedAt: roundEnd
            // No roundTimeLimit for singleplayer games - players can take as long as they want
          };
        });

        // Create game document
        const gameDoc = new Game({
          gameId: gameId,
          gameType: 'singleplayer',
          
          settings: {
            location: location || 'all', // Use provided location or default to 'all'
            rounds: rounds.length,
            maxDist: maxDist || 20000,
            timePerRound: null, // No time limit for singleplayer
            official: official !== undefined ? official : true, // Use provided official status or default to true
            showRoadName: false,
            noMove: false,
            noPan: false,
            noZoom: false
          },
          
          startedAt: gameStartTime,
          endedAt: gameEndTime,
          totalDuration: totalDuration,
          
          rounds: gameRounds,
          
          players: [{
            playerId: user._id,
            username: user.username || 'Player',
            accountId: user._id,
            totalPoints: totalPoints,
            totalXp: totalXp,
            averageTimePerRound: rounds.reduce((sum, r) => sum + r.roundTime, 0) / rounds.length,
            finalRank: 1,
            elo: {
              before: null,
              after: null,
              change: null
            }
          }],
          
          result: {
            winner: null,
            isDraw: false,
            maxPossiblePoints: rounds.length * 5000
          },
          
          multiplayer: {
            isPublic: false,
            gameCode: null,
            hostPlayerId: null,
            maxPlayers: 1
          }
        });

        // Save the game to Games collection
        await gameDoc.save();

        // Update user's totalGamesPlayed (increment by 1 per game, not per round)
        await User.updateOne(
          { secret: user.secret },
          { 
            $inc: { 
              totalGamesPlayed: 1,
              totalXp: totalXp
            }
          }
        );

        // Record user stats for analytics
        try {
          await UserStatsService.recordGameStats(user._id, gameId);
        } catch (statsError) {
          console.warn('Failed to record user stats:', statsError);
          // Don't fail the entire request if stats recording fails
        }

        console.log(`Saved singleplayer game ${gameId} for user ${user.username} with ${totalPoints} points`);

      } catch (error) {
        console.error('Error saving singleplayer game:', error);
        return res.status(500).json({ error: 'An error occurred', message: error.message });
      }
    }
    return res.status(200).json({ success: true });
  }

  // No batch rounds provided - invalid request
  return res.status(400).json({ message: 'Invalid input: rounds array required' });
}

// Limit to 1 request per 5 seconds over a minute, generous limit but better than nothing
export default ratelimiter(guess, 12, 60000)
// no rate limit
// export default guess;