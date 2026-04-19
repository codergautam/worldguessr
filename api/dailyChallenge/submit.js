import ratelimiter from '../../components/utils/ratelimitMiddleware.js';
import User from '../../models/User.js';
import Game from '../../models/Game.js';
import DailyChallengeScore from '../../models/DailyChallengeScore.js';
import DailyChallengeStats, { bucketIndexForScore, DAILY_BUCKET_COUNT, DAILY_ROUNDS_PER_DAY } from '../../models/DailyChallengeStats.js';
import { isValidDailyDate, verifySessionToken, getDailyLocations } from '../../serverUtils/dailyChallenge.js';
import { invalidateDailyPublicCache } from './results.js';
import { daysBetween } from '../../utils/dailyDate.js';
import { createUUID } from '../../components/createUUID.js';
import UserStatsService from '../../components/utils/userStatsService.js';

const MAX_SCORE_PER_ROUND = 5000;
const MAX_XP_PER_ROUND = 100;
const MAX_TOTAL_XP = 500;
const GRACE_WINDOW_DAYS = 7;
const EARTH_RADIUS_KM = 6371;

// Severe per-IP cap on anon stat contributions. Anon plays feed the
// distribution curve (which logged-in honest players see), so a single IP
// scripting submits could poison the comparison. One stored anon play per
// IP per daily date is plenty — anything above that is silently accepted
// at the HTTP level but not written to stats.
const ANON_WRITES_PER_IP_PER_DAY = 3;
const anonWriteTracker = new Map(); // `${ip}|${date}` -> count

function anonIp(req) {
  const h = req.headers['x-forwarded-for'];
  if (typeof h === 'string' && h.length > 0) return h.split(',')[0].trim();
  return req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
}

function anonWriteAllowed(req, date) {
  const key = `${anonIp(req)}|${date}`;
  const count = (anonWriteTracker.get(key) || 0) + 1;
  anonWriteTracker.set(key, count);
  // Bound the map so it doesn't grow unbounded over many days/IPs.
  if (anonWriteTracker.size > 20000) {
    const oldest = anonWriteTracker.keys().next().value;
    anonWriteTracker.delete(oldest);
  }
  return count <= ANON_WRITES_PER_IP_PER_DAY;
}

function clampRoundScore(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_SCORE_PER_ROUND, Math.floor(n)));
}

function xpFromRoundScore(score) {
  const xp = Math.round(score / 50);
  return Math.max(0, Math.min(MAX_XP_PER_ROUND, xp));
}

// Haversine in km — inlined so this file has no coupling to a frontend util.
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pruneGraceDates(dates, today) {
  if (!Array.isArray(dates)) return [];
  return dates.filter(d => {
    const diff = daysBetween(d, today);
    return diff !== null && diff >= 0 && diff <= GRACE_WINDOW_DAYS;
  });
}

async function applyStreak(user, localDate) {
  const prev = user.lastDailyDate;
  const graceBefore = pruneGraceDates(user.dailyGraceUsedDates, localDate);
  let streak;
  let graceAfter = graceBefore;
  let graceUsedNow = false;

  if (!prev) {
    streak = 1;
  } else {
    const diff = daysBetween(prev, localDate);
    if (diff === null || diff <= 0) {
      streak = 1;
    } else if (diff === 1) {
      streak = (user.dailyStreak || 0) + 1;
    } else if (diff === 2 && graceBefore.length < 1) {
      streak = (user.dailyStreak || 0) + 1;
      graceAfter = [...graceBefore, localDate];
      graceUsedNow = true;
    } else {
      streak = 1;
    }
  }
  const best = Math.max(user.dailyStreakBest || 0, streak);
  return { streak, best, graceAfter, graceUsedNow };
}

// Ensure the daily-stats doc exists with zero-filled arrays.
// Separated from $inc because MongoDB disallows $setOnInsert + $inc on the
// same top-level path (both touch `buckets` / `roundScoreSums`).
async function ensureStatsDoc(date) {
  await DailyChallengeStats.updateOne(
    { date },
    {
      $setOnInsert: {
        date,
        totalPlays: 0,
        anonPlays: 0,
        totalScore: 0,
        buckets: new Array(DAILY_BUCKET_COUNT).fill(0),
        roundScoreSums: new Array(DAILY_ROUNDS_PER_DAY).fill(0),
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
}

function buildRoundIncs(rounds) {
  const out = {};
  rounds.forEach((r, i) => {
    if (i >= DAILY_ROUNDS_PER_DAY) return;
    out[`roundScoreSums.${i}`] = r.score || 0;
  });
  return out;
}

async function incrementStats(date, score, rounds) {
  const bucket = bucketIndexForScore(score);
  const incPath = `buckets.${bucket}`;
  await ensureStatsDoc(date);
  await DailyChallengeStats.updateOne(
    { date },
    {
      $inc: { totalPlays: 1, totalScore: score, [incPath]: 1, ...buildRoundIncs(rounds) },
      $set: { updatedAt: new Date() },
    }
  );
}

async function incrementAnonStats(date, score, rounds) {
  const bucket = bucketIndexForScore(score);
  const incPath = `buckets.${bucket}`;
  await ensureStatsDoc(date);
  await DailyChallengeStats.updateOne(
    { date },
    {
      $inc: { totalPlays: 1, anonPlays: 1, totalScore: score, [incPath]: 1, ...buildRoundIncs(rounds) },
      $set: { updatedAt: new Date() },
    }
  );
}

async function computeRankAndPercentile(date, score) {
  const [rankDoc, stats] = await Promise.all([
    DailyChallengeScore.countDocuments({ date, score: { $gt: score } }),
    DailyChallengeStats.findOne({ date }).lean(),
  ]);
  const rank = rankDoc + 1;
  const totalPlays = stats?.totalPlays || 0;
  const beaten = totalPlays > 0
    ? Math.max(0, totalPlays - (stats.buckets || []).slice(bucketIndexForScore(score) + 1).reduce((a, b) => a + b, 0) - 1)
    : 0;
  const percentile = totalPlays > 0 ? Math.round((beaten / totalPlays) * 100) : null;
  return { rank, totalPlays, percentile };
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date, totalTime, rounds, sessionToken, secret, disqualified } = req.body || {};

  if (!date || !isValidDailyDate(date)) {
    return res.status(400).json({ error: 'Invalid date' });
  }
  if (!verifySessionToken(sessionToken, date)) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  if (!Array.isArray(rounds) || rounds.length !== 3) {
    return res.status(400).json({ error: 'rounds must be an array of 3' });
  }

  // Canonical per-round actual locations — server is the source of truth.
  const dailyLocs = getDailyLocations(date);

  // Recompute total server-side from per-round scores (each capped at 5000).
  // Distance is also computed here (from the daily location + client's guess)
  // so the client never has to send it.
  const normalizedRounds = rounds.map((r, i) => {
    const score = clampRoundScore(r?.score);
    const guessLat = Number.isFinite(r?.guessLat) ? r.guessLat : null;
    const guessLng = Number.isFinite(r?.guessLng) ? r.guessLng : null;
    const actual = dailyLocs[i];
    const distance = actual && guessLat != null && guessLng != null
      ? haversineKm(actual.lat, actual.long, guessLat, guessLng)
      : null;
    return {
      score,
      xp: xpFromRoundScore(score),
      distance,
      timeMs: Number.isFinite(r?.timeMs) ? r.timeMs : null,
      guessLat,
      guessLng,
      country: actual?.country ?? (typeof r?.country === 'string' ? r.country : null),
    };
  });
  const finalScore = normalizedRounds.reduce((sum, r) => sum + r.score, 0);
  const finalXp = Math.min(MAX_TOTAL_XP, normalizedRounds.reduce((sum, r) => sum + r.xp, 0));

  try {
    // Disqualified runs (player tab-switched mid-game) are NOT recorded
    // anywhere — no leaderboard, streak, XP, game history, AND not the
    // distribution curve. Nothing about a DQ'd run should shape the public
    // stats that honest players compare themselves against.
    if (disqualified) {
      // Still read current stats so the response carries a percentile the
      // player can reference, but do NOT write.
      const stats = await DailyChallengeStats.findOne({ date }).lean();
      const bucket = bucketIndexForScore(finalScore);
      const beaten = stats ? (stats.buckets || []).slice(0, bucket).reduce((a, b) => a + b, 0) : 0;
      const percentile = stats?.totalPlays ? Math.round((beaten / stats.totalPlays) * 100) : null;
      return res.status(200).json({
        score: finalScore,
        totalPlays: stats?.totalPlays || 0,
        percentile,
        disqualified: true,
      });
    }

    if (secret && typeof secret === 'string') {
      const user = await User.findOne({ secret });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const existing = await DailyChallengeScore.findOne({ date, userId: user._id }).lean();
      if (existing) {
        const { rank, totalPlays, percentile } = await computeRankAndPercentile(date, existing.score);
        return res.status(200).json({
          alreadySubmitted: true,
          score: existing.score,
          rank,
          totalPlays,
          percentile,
          streak: user.dailyStreak || 0,
          streakBest: user.dailyStreakBest || 0,
        });
      }

      const { streak, best, graceAfter, graceUsedNow } = await applyStreak(user, date);

      await DailyChallengeScore.create({
        date,
        userId: user._id,
        username: user.username || 'Player',
        score: finalScore,
        totalTime: Number.isFinite(totalTime) ? totalTime : 0,
        rounds: normalizedRounds,
      });

      await incrementStats(date, finalScore, normalizedRounds);
      invalidateDailyPublicCache(date);

      // Award XP + total-games and mirror into the Game collection so the
      // daily shows up in the user's game history alongside singleplayer/duel.
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
        // Don't fail the submission if game-history mirroring fails
        console.warn('[dailyChallenge/submit] Game doc create failed:', gameErr?.message);
      }

      // Award XP and bump games-played. Done before recordGameStats so the
      // daily-leaderboard delta snapshot picks up the new total.
      await User.updateOne(
        { _id: user._id },
        { $inc: { totalGamesPlayed: 1, totalXp: finalXp } }
      );

      // Snapshot user stats for daily XP leaderboard computation
      if (createdGameId) {
        try {
          await UserStatsService.recordGameStats(user._id, createdGameId);
        } catch (statsErr) {
          console.warn('[dailyChallenge/submit] recordGameStats failed:', statsErr?.message);
        }
      }

      const { rank, totalPlays, percentile } = await computeRankAndPercentile(date, finalScore);

      const historyEntry = { date, score: finalScore, rank };
      const nextHistory = [historyEntry, ...(user.dailyHistory || []).filter(h => h.date !== date)].slice(0, 30);

      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            dailyStreak: streak,
            dailyStreakBest: best,
            lastDailyDate: date,
            dailyGraceUsedDates: graceAfter,
            dailyHistory: nextHistory,
          },
        }
      );

      return res.status(200).json({
        score: finalScore,
        rank,
        totalPlays,
        percentile,
        streak,
        streakBest: best,
        graceUsed: graceUsedNow,
        newPersonalBest: finalScore > ((user.dailyHistory || []).reduce((m, h) => Math.max(m, h.score || 0), 0)),
      });
    }

    // Anonymous play — apply a severe per-IP cap so a single host can't
    // scribble on the distribution curve. Over the limit, we still echo a
    // percentile (so the UX is unchanged) but don't persist.
    const shouldPersistAnon = anonWriteAllowed(req, date);
    if (shouldPersistAnon) {
      await incrementAnonStats(date, finalScore, normalizedRounds);
      invalidateDailyPublicCache(date);
    }
    const stats = await DailyChallengeStats.findOne({ date }).lean();
    const bucket = bucketIndexForScore(finalScore);
    const beaten = stats ? (stats.buckets || []).slice(0, bucket).reduce((a, b) => a + b, 0) : 0;
    const percentile = stats?.totalPlays ? Math.round((beaten / stats.totalPlays) * 100) : null;

    return res.status(200).json({
      score: finalScore,
      totalPlays: stats?.totalPlays || 0,
      percentile,
      anonymous: true,
    });
  } catch (err) {
    console.error('[dailyChallenge/submit]', err);
    return res.status(500).json({ error: 'Failed to submit' });
  }
}

export default ratelimiter(handler, 6, 60000);
