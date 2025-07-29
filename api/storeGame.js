// import calcPoints from '@/components/calcPoints';
// import storeGame from '@/components/storeGame';
// import ratelimiter from '@/components/utils/ratelimitMiddleware'
import calcPoints from '../components/calcPoints.js';
import storeGame from '../components/storeGame.js';
import ratelimiter from '../components/utils/ratelimitMiddleware.js';
import Game from '../models/Game.js';
import User from '../models/User.js';
import UserStatsService from '../components/utils/userStatsService.js';
import { createUUID } from '../components/createUUID.js';

// Handle both single round and batch round submissions
async function guess(req, res) {
  const { lat, long, actualLat, actualLong, usedHint, secret, roundTime, maxDist, rounds } = req.body;

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
        const totalDuration = rounds.reduce((sum, round) => sum + (round.roundTime * 1000), 0); // Convert to milliseconds
        const totalPoints = rounds.reduce((sum, round) => sum + (round.xp * 50), 0); // Convert XP back to points
        const totalXp = rounds.reduce((sum, round) => sum + (round.xp || 0), 0);

        // Prepare rounds data for Games collection
        let currentRoundStart = gameStartTime.getTime();
        const gameRounds = rounds.map((round, index) => {
          const { lat: guessLat, long: guessLong, actualLat, actualLong, usedHint, maxDist, roundTime, xp } = round;
          const points = xp * 50; // Convert XP back to points
          
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
              country: null, // We don't have country data in the current structure
              place: null
            },
            playerGuesses: [{
              playerId: user.secret,
              username: user.username || 'Player',
              accountId: user.secret,
              guessLat: guessLat,
              guessLong: guessLong,
              points: points,
              timeTaken: roundTime,
              xpEarned: xp || 0,
              guessedAt: guessTime,
              usedHint: usedHint || false
            }],
            startedAt: roundStart,
            endedAt: roundEnd,
            roundTimeLimit: 30000 // Default time limit
          };
        });

        // Create game document
        const gameDoc = new Game({
          gameId: gameId,
          gameType: 'singleplayer',
          
          settings: {
            location: 'all', // Default, could be enhanced to detect actual location setting
            rounds: rounds.length,
            maxDist: maxDist || 20000,
            timePerRound: 30000,
            official: true,
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
            playerId: user.secret,
            username: user.username || 'Player',
            accountId: user.secret,
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

        // Still store individual rounds in the old format for backward compatibility
        for(const round of rounds) {
          const { lat: guessLat, long: guessLong, actualLat, actualLong, usedHint, maxDist, roundTime, xp } = round;
          const calcXp = xp || Math.round(calcPoints({ guessLat, guessLon: guessLong, lat: actualLat, lon: actualLong, usedHint, maxDist }) / 50);
          await storeGame(secret, calcXp, roundTime, [guessLat, guessLong]);
        }

        // Record user stats for analytics
        try {
          await UserStatsService.recordGameStats(user.secret, gameId);
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

  // Handle single round (multiplayer/legacy)
  // handle impossible cases
  if(lat === actualLat || long === actualLong || roundTime < 0 || maxDist < 10) {
    return res.status(400).json({ message: 'Invalid input' });
  }

  if(secret) {
    try {
      const calcXp = Math.round(calcPoints({ guessLat: lat, guessLon: long, lat: actualLat, lon: actualLong, usedHint, maxDist }) / 50);
      await storeGame(secret, calcXp, roundTime, [lat, long]);
    } catch (error) {
      return res.status(500).json({ error: 'An error occurred', message: error.message });
    }
  }
  res.status(200).json({ success: true });
}

// Limit to 1 request per 5 seconds over a minute, generous limit but better than nothing
// export default ratelimiter(guess, 12, 60000)
// no rate limit
export default guess;