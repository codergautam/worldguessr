import ratelimiter from '../../components/utils/ratelimitMiddleware.js';
import User from '../../models/User.js';
import DailyChallengeScore from '../../models/DailyChallengeScore.js';
import DailyChallengeStats, { bucketIndexForScore, DAILY_BUCKET_COUNT, DAILY_ROUNDS_PER_DAY } from '../../models/DailyChallengeStats.js';
import GuestProfile, { GUEST_PROFILE_TTL_MS } from '../../models/GuestProfile.js';
import GuestScore from '../../models/GuestScore.js';
import { isValidDailyDate, verifySessionToken, getDailyLocations } from '../../serverUtils/dailyChallenge.js';
import { invalidateDailyPublicCache } from './results.js';
import { normalizeDailyRounds } from '../../serverUtils/normalizeDailyRounds.js';
import { applyStreak } from '../../serverUtils/dailyStreak.js';
import { writeLoggedInDailyGame } from '../../serverUtils/dailyGameHistoryWriter.js';

const MAX_TOTAL_XP = 500;

// Severe per-IP cap on guest writes. Guests no longer feed the distribution,
// so this exists purely as anti-abuse for GuestScore/GuestProfile write spam.
// Guests get a hard 429 so the UI can surface a retry or signin nudge.
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
  if (anonWriteTracker.size > 20000) {
    const oldest = anonWriteTracker.keys().next().value;
    anonWriteTracker.delete(oldest);
  }
  return count <= ANON_WRITES_PER_IP_PER_DAY;
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

async function incrementStats(date, score, rounds, { anon = false } = {}) {
  const bucket = bucketIndexForScore(score);
  const incPath = `buckets.${bucket}`;
  await ensureStatsDoc(date);
  const inc = { totalPlays: 1, totalScore: score, [incPath]: 1, ...buildRoundIncs(rounds) };
  if (anon) inc.anonPlays = 1;
  await DailyChallengeStats.updateOne(
    { date },
    { $inc: inc, $set: { updatedAt: new Date() } }
  );
}

async function computeRankAndPercentile(date, score) {
  // Rank + percentile are both derived from the same source (stats.buckets +
  // totalPlays) so they can't disagree — a prior version took rank from
  // DailyChallengeScore (logged-in only) but percentile from the buckets
  // (logged-in + anon), which produced incoherent readouts like
  // "rank 1 of 11 · beat 64%".
  //
  // Rank is a best-case lower bound: ties within the user's own bucket all
  // collapse to the same rank, since per-score ordering isn't in the stats.
  const stats = await DailyChallengeStats.findOne({ date }).lean();
  const totalPlays = stats?.totalPlays || 0;
  if (totalPlays === 0) return { rank: null, totalPlays: 0, percentile: null };
  const bucket = bucketIndexForScore(score);
  const above = (stats.buckets || []).slice(bucket + 1).reduce((a, b) => a + b, 0);
  const rank = Math.min(totalPlays, above + 1);
  // "Beat X% of OTHER players" — rank #1 of N should show 100% (beat all N-1
  // others), not (N-1)/N. Divide by totalPlays-1 so self isn't in the
  // denominator. totalPlays===1 → null (sole player, no meaningful percentile;
  // UI already gates on totalPlays>1).
  const percentile = totalPlays > 1
    ? Math.round(Math.max(0, Math.min(100, ((totalPlays - rank) / (totalPlays - 1)) * 100)))
    : null;
  return { rank, totalPlays, percentile };
}

async function handleLoggedIn({ res, date, rounds: normalizedRounds, totalTime, dailyLocs, secret, finalScore, finalXp }) {
  const user = await User.findOne({ secret });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  // Banned users must not write scores, bump the distribution buckets, or
  // grow their streak. takeAction.js scrubs existing rows on ban, but submit
  // is the ingress — without this gate, a banned user with a stale secret in
  // localStorage can keep poisoning DailyChallengeStats post-ban.
  if (user.banned) {
    return res.status(403).json({ error: 'Account banned' });
  }

  const existing = await DailyChallengeScore.findOne({ date, userId: user._id }).lean();
  if (existing) {
    if (existing.disqualified) {
      return res.status(200).json({
        alreadySubmitted: true,
        disqualified: true,
        streak: user.dailyStreak || 0,
        streakBest: user.dailyStreakBest || 0,
      });
    }
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

  const { streak, best, graceAfter, graceUsedNow } = applyStreak({
    prevDate: user.lastDailyDate,
    currentStreak: user.dailyStreak,
    graceDates: user.dailyGraceUsedDates,
    currentBest: user.dailyStreakBest,
    today: date,
  });

  // Most of the writes below are independent — they touch different
  // collections (or different fields of the same User doc). Run them in
  // parallel to roughly halve the wall-time the client waits on /submit.
  // Only the rank query depends on incrementStats having committed first;
  // chain those two inside one branch. The User streak/history update needs
  // the computed rank for its historyEntry, so it waits on the rank chain
  // — but the score-create + Game-history writes still run alongside it.
  const rankPromise = (async () => {
    await incrementStats(date, finalScore, normalizedRounds);
    invalidateDailyPublicCache(date);
    return computeRankAndPercentile(date, finalScore);
  })();

  const userUpdatePromise = (async () => {
    const { rank: rankForHistory } = await rankPromise;
    const historyEntry = { date, score: finalScore, rank: rankForHistory };
    const nextHistory = [historyEntry, ...(user.dailyHistory || []).filter(h => h.date !== date)].slice(0, 30);
    return User.updateOne(
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
  })();

  const [, , rankResult] = await Promise.all([
    DailyChallengeScore.create({
      date,
      userId: user._id,
      username: user.username || 'Player',
      score: finalScore,
      totalTime: Number.isFinite(totalTime) ? totalTime : 0,
      rounds: normalizedRounds,
    }),
    writeLoggedInDailyGame({
      user,
      date,
      normalizedRounds,
      dailyLocs,
      finalScore,
      finalXp,
      totalTime,
    }),
    rankPromise,
    userUpdatePromise,
  ]);

  const { rank, totalPlays, percentile } = rankResult;

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

async function handleGuest({ req, res, date, rounds: normalizedRounds, totalTime, guestId, finalScore }) {
  // Replay check — unique (guestId, date) index on GuestScore also enforces
  // this at the DB level, but the explicit check gives a clean 409.
  const existing = await GuestScore.findOne({ guestId, date }).lean();
  if (existing) {
    const profile = await GuestProfile.findOne({ guestId }).lean();
    if (existing.disqualified) {
      return res.status(200).json({
        alreadySubmitted: true,
        disqualified: true,
        streak: profile?.daily?.streak || 0,
        streakBest: profile?.daily?.streakBest || 0,
        guest: true,
      });
    }
    const { rank, totalPlays, percentile } = await computeRankAndPercentile(date, existing.score);
    return res.status(200).json({
      alreadySubmitted: true,
      score: existing.score,
      rank,
      totalPlays,
      percentile,
      streak: profile?.daily?.streak || 0,
      streakBest: profile?.daily?.streakBest || 0,
      guest: true,
    });
  }

  const priorProfile = await GuestProfile.findOne({ guestId }).lean();

  // Per-IP cap on FRESH guestIds — blocks sybil spam where an attacker keeps
  // clearing localStorage to spawn disposable identities and write fake
  // GuestScore / GuestProfile rows. Returning guests (priorProfile exists)
  // bypass the cap entirely: the unique-(guestId,date) replay check already
  // limits each established identity to one play per day, so they can't be
  // the source of write spam. Without this exception, a legitimate user on
  // a shared NAT / household / café IP would lose their streak just because
  // three other people there played as guests today.
  //
  // When the cap does fire we soft-fail rather than 429: still compute and
  // return the same rank/percentile so the player sees their result, just
  // skip the writes so the cap actually does its job. `notTracked: true`
  // lets the client surface a "sign in to save progress" hint if it wants.
  if (!priorProfile && !anonWriteAllowed(req, date)) {
    const { rank, totalPlays, percentile } = await computeRankAndPercentile(date, finalScore);
    return res.status(200).json({
      score: finalScore,
      rank,
      totalPlays,
      percentile,
      streak: 0,
      streakBest: 0,
      newPersonalBest: true,
      guest: true,
      notTracked: true,
    });
  }

  const { streak, best } = applyStreak({
    prevDate: priorProfile?.daily?.lastDate || null,
    currentStreak: priorProfile?.daily?.streak || 0,
    graceDates: [],
    currentBest: priorProfile?.daily?.streakBest || 0,
    today: date,
  }, { allowGrace: false });

  // Write GuestScore first — if this throws (including the dup-key race with
  // a concurrent submit), we abort before updating the profile.
  try {
    await GuestScore.create({
      guestId,
      date,
      score: finalScore,
      totalTime: Number.isFinite(totalTime) ? totalTime : 0,
      rounds: normalizedRounds,
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'Already submitted today as this guest.' });
    }
    throw err;
  }

  const { rank, totalPlays, percentile } = await computeRankAndPercentile(date, finalScore);

  const historyEntry = { date, score: finalScore, rank };
  const priorHistory = Array.isArray(priorProfile?.daily?.history) ? priorProfile.daily.history : [];
  const nextHistory = [historyEntry, ...priorHistory.filter(h => h.date !== date)].slice(0, 30);
  const now = new Date();

  await GuestProfile.updateOne(
    { guestId },
    {
      $set: {
        'daily.streak': streak,
        'daily.streakBest': best,
        'daily.lastDate': date,
        'daily.history': nextHistory,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + GUEST_PROFILE_TTL_MS),
      },
      $setOnInsert: {
        guestId,
        createdAt: now,
        claimedBy: null,
        claimedAt: null,
      },
    },
    { upsert: true }
  );

  return res.status(200).json({
    score: finalScore,
    rank,
    totalPlays,
    percentile,
    streak,
    streakBest: best,
    newPersonalBest: finalScore > priorHistory.reduce((m, h) => Math.max(m, h.score || 0), 0),
    guest: true,
  });
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date, totalTime, rounds, sessionToken, secret, guestId, disqualified } = req.body || {};

  if (!date || !isValidDailyDate(date)) {
    return res.status(400).json({ error: 'Invalid date' });
  }
  if (!verifySessionToken(sessionToken, date)) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  if (!Array.isArray(rounds) || rounds.length !== 3) {
    return res.status(400).json({ error: 'rounds must be an array of 3' });
  }

  const dailyLocs = getDailyLocations(date);
  const normalizedRounds = normalizeDailyRounds(rounds, dailyLocs);
  const finalScore = normalizedRounds.reduce((sum, r) => sum + r.score, 0);
  const finalXp = Math.min(MAX_TOTAL_XP, normalizedRounds.reduce((sum, r) => sum + r.xp, 0));

  try {
    // Disqualified runs (player tab-switched mid-game) are NOT counted in
    // the leaderboard, streak, XP, game history, or distribution curve —
    // nothing about a DQ'd run should shape the public stats honest players
    // compare themselves against. We DO persist a marker against the
    // identity (logged-in user or guest) so a DQ locks the date and a second
    // attempt is blocked. Anon-anon callers have no persistent identity, so
    // there's nothing to lock.
    if (disqualified) {
      const stats = await DailyChallengeStats.findOne({ date }).lean();
      const bucket = bucketIndexForScore(finalScore);
      const beaten = stats ? (stats.buckets || []).slice(0, bucket).reduce((a, b) => a + b, 0) : 0;
      const percentile = stats?.totalPlays ? Math.round((beaten / stats.totalPlays) * 100) : null;

      if (secret && typeof secret === 'string') {
        const user = await User.findOne({ secret }).select('_id username banned').lean();
        if (user?.banned) {
          return res.status(403).json({ error: 'Account banned' });
        }
        if (user) {
          try {
            await DailyChallengeScore.create({
              date,
              userId: user._id,
              username: user.username || 'Player',
              score: 0,
              totalTime: Number.isFinite(totalTime) ? totalTime : 0,
              rounds: [],
              disqualified: true,
            });
          } catch (err) {
            // 11000 = already submitted today; the lock is already in place.
            if (err?.code !== 11000) throw err;
          }
        }
      } else if (guestId && typeof guestId === 'string' && guestId.length > 0) {
        try {
          await GuestScore.create({
            guestId,
            date,
            score: 0,
            totalTime: Number.isFinite(totalTime) ? totalTime : 0,
            rounds: [],
            disqualified: true,
          });
        } catch (err) {
          if (err?.code !== 11000) throw err;
        }
        // Touch the GuestProfile so a refresh from this guestId still finds a
        // profile, which is what fetchGuestBlock keys on. Don't bump streak/
        // history — DQ doesn't earn either.
        const now = new Date();
        await GuestProfile.updateOne(
          { guestId },
          {
            $set: { updatedAt: now, expiresAt: new Date(now.getTime() + GUEST_PROFILE_TTL_MS) },
            $setOnInsert: { guestId, createdAt: now, claimedBy: null, claimedAt: null },
          },
          { upsert: true }
        );
      }

      return res.status(200).json({
        score: finalScore,
        totalPlays: stats?.totalPlays || 0,
        percentile,
        disqualified: true,
      });
    }

    if (secret && typeof secret === 'string') {
      return await handleLoggedIn({
        res, date,
        rounds: normalizedRounds,
        totalTime, dailyLocs, secret, finalScore, finalXp,
      });
    }

    if (guestId && typeof guestId === 'string' && guestId.length > 0) {
      return await handleGuest({
        req, res, date,
        rounds: normalizedRounds,
        totalTime, guestId, finalScore,
      });
    }

    // Anon-anon — no persistent identity at all. Modern clients should have a
    // guestId, but keep the response shape for legacy/defensive callers.
    const { rank, totalPlays, percentile } = await computeRankAndPercentile(date, finalScore);

    return res.status(200).json({
      score: finalScore,
      rank,
      totalPlays,
      percentile,
      anonymous: true,
    });
  } catch (err) {
    console.error('[dailyChallenge/submit]', err);
    return res.status(500).json({ error: 'Failed to submit' });
  }
}

export default ratelimiter(handler, 6, 60000);
