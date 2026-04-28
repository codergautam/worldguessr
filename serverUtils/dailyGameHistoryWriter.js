import Game from '../models/Game.js';
import User from '../models/User.js';
import { createUUID } from '../components/createUUID.js';
import UserStatsService from '../components/utils/userStatsService.js';

// Mirror a completed daily-challenge submission into the Game collection so
// it shows up in the user's game history alongside singleplayer/duel, then
// award XP / bump totalGamesPlayed, then snapshot stats for the daily XP
// leaderboard. Only called for logged-in submits — guests never touch the
// Game collection.
//
// Non-fatal: any failure inside is logged and swallowed so the submission
// itself still succeeds.
export async function writeLoggedInDailyGame({
  user,
  date,
  normalizedRounds,
  dailyLocs,
  finalScore,
  finalXp,
  totalTime,
}) {
  let createdGameId = null;
  try {
    const gameEndTime = new Date();
    const safeTotalTime = Number.isFinite(totalTime) ? Math.max(1, Math.round(totalTime / 1000)) : 30;
    const gameStartTime = new Date(gameEndTime.getTime() - safeTotalTime * 1000);
    let cursor = gameStartTime.getTime();
    const gameRounds = normalizedRounds.map((r, i) => {
      const actual = dailyLocs[i] || { lat: 0, long: 0, country: null };
      const roundSeconds = Math.max(1, Math.round((r.timeMs ?? 30000) / 1000));
      const startedAt = new Date(cursor);
      const endedAt = new Date(cursor + roundSeconds * 1000);
      cursor = endedAt.getTime() + 2000;
      return {
        roundNumber: i + 1,
        location: {
          lat: actual.lat,
          long: actual.long,
          panoId: null,
          country: actual.country || r.country || null,
          place: null,
        },
        playerGuesses: [{
          playerId: user._id.toString(),
          username: user.username || 'Player',
          accountId: user._id.toString(),
          guessLat: r.guessLat,
          guessLong: r.guessLng,
          points: r.score,
          timeTaken: roundSeconds,
          xpEarned: r.xp,
          guessedAt: endedAt,
          usedHint: false,
        }],
        startedAt,
        endedAt,
        roundTimeLimit: 60000,
      };
    });
    createdGameId = `daily_${date}_${createUUID()}`;
    await Game.create({
      gameId: createdGameId,
      gameType: 'daily_challenge',
      settings: {
        location: 'daily',
        rounds: normalizedRounds.length,
        maxDist: 20000,
        timePerRound: 60000,
        official: true,
        countryGuesser: false,
        countryGuessrSubMode: null,
        showRoadName: true,
        noMove: false,
        noPan: false,
        noZoom: false,
      },
      startedAt: gameStartTime,
      endedAt: gameEndTime,
      totalDuration: safeTotalTime,
      rounds: gameRounds,
      players: [{
        playerId: user._id.toString(),
        username: user.username || 'Player',
        accountId: user._id.toString(),
        totalPoints: finalScore,
        totalXp: finalXp,
        averageTimePerRound: safeTotalTime / Math.max(1, normalizedRounds.length),
        finalRank: 1,
        elo: { before: null, after: null, change: null },
      }],
      result: {
        winner: null,
        isDraw: false,
        maxPossiblePoints: normalizedRounds.length * 5000,
      },
      multiplayer: {
        isPublic: false,
        gameCode: null,
        hostPlayerId: null,
        maxPlayers: 1,
      },
    });
  } catch (gameErr) {
    console.warn('[dailyGameHistoryWriter] Game doc create failed:', gameErr?.message);
  }

  try {
    await User.updateOne(
      { _id: user._id },
      { $inc: { totalGamesPlayed: 1, totalXp: finalXp } }
    );
  } catch (userErr) {
    console.warn('[dailyGameHistoryWriter] User XP bump failed:', userErr?.message);
  }

  if (createdGameId) {
    try {
      await UserStatsService.recordGameStats(user._id, createdGameId);
    } catch (statsErr) {
      console.warn('[dailyGameHistoryWriter] recordGameStats failed:', statsErr?.message);
    }
  }

  return createdGameId;
}
