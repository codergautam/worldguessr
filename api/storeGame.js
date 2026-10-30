// import ratelimiter from '@/components/utils/ratelimitMiddleware'
import ratelimiter from '../components/utils/ratelimitMiddleware.js';
import Game from '../models/Game.js';
import User from '../models/User.js';
import UserStatsService from '../components/utils/userStatsService.js';
import { createUUID } from '../components/createUUID.js';
import { getMode, isQuizMode, isRegion } from '../shared/modes/catalog.js';

const str = (v, max) => (typeof v === 'string' && v.length <= max ? v : undefined);

// The stimulus fields a quiz round may persist, validated: the client is not
// trusted with free-form content in a history document.
function quizLocationFields(round) {
  const out = { mode: round.mode };
  const lang = str(round.lang, 16);
  const text = str(round.text, 2000);
  const label = str(round.label, 200);
  if (lang) out.lang = lang;
  if (text) out.text = text;
  if (label) out.label = label;
  if (Array.isArray(round.choices) && round.choices.length <= 8 && round.choices.every((c) => str(c, 16))) {
    out.choices = round.choices;
  }
  const url = str(round.image?.url, 500);
  if (url && url.startsWith('https://')) {
    out.image = {
      url,
      credit: str(round.image.credit, 300) ?? null,
      license: str(round.image.license, 60) ?? null,
      sourceUrl: str(round.image.sourceUrl, 500) ?? null,
    };
  }
  return out;
}

// Handle singleplayer game completion
async function guess(req, res) {
  const { secret, maxDist, rounds, official, location, countryGuesser, countryGuessrSubMode, mode, region } = req.body;

  // secret must be string
  if(typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid input' });
  }

  // Quiz mode (shared/modes/catalog.js). Absent = classic, same as every
  // client that predates it; unknown = rejected; never together with the
  // country guesser flags, which have their own 1000-point scale.
  const spec = getMode(mode);
  if (!spec) {
    return res.status(400).json({ message: 'Invalid input' });
  }
  const quiz = isQuizMode(mode);
  if (quiz && countryGuesser) {
    return res.status(400).json({ message: 'Invalid input' });
  }
  const quizRegion = quiz && spec.supportsRegion && isRegion(region) ? region : null;

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
          // Quiz rounds take seconds, so their XP is capped by the catalog
          // (20) and by the points actually scored, not by the classic 100.
          const cap = quiz
            ? Math.min(spec.maxXpPerRound, Math.floor(Math.max(0, Math.min(5000, round.points || 0)) / 50))
            : MAX_XP_PER_ROUND;
          const roundXp = Math.min(Math.max(0, round.xp || 0), cap);
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
          // Points come from the frontend; quiz rounds at least stay on the 0..5000 scale.
          const actualPoints = quiz ? Math.max(0, Math.min(5000, Math.round(points || 0))) : points;
          
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
              place: round.place || null,
              ...(quiz ? quizLocationFields({ ...round, mode }) : {})
            },
            playerGuesses: [{
              playerId: user._id,
              username: user.username || 'Player',
              accountId: user._id,
              guessLat: guessLat,
              guessLong: guessLong,
              ...(quiz && str(round.choice, 16) ? { choice: round.choice } : {}),
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
            countryGuesser: !!countryGuesser,
            countryGuessrSubMode: countryGuesser ? (countryGuessrSubMode || 'country') : null,
            mode: spec.id,
            region: quizRegion,
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
            maxPossiblePoints: rounds.length * (countryGuesser ? 1000 : 5000)
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

// Limit to 4 request per 10 seconds, generous limit but better than nothing
export default ratelimiter(guess, 4, 10000)
// no rate limit
// export default guess;