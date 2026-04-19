import ratelimiter from '../../components/utils/ratelimitMiddleware.js';
import User from '../../models/User.js';
import GuestProfile from '../../models/GuestProfile.js';
import GuestScore from '../../models/GuestScore.js';
import DailyChallengeScore from '../../models/DailyChallengeScore.js';
import DailyChallengeStats, { bucketIndexForScore } from '../../models/DailyChallengeStats.js';
import { recomputeStreakFromHistory } from '../../serverUtils/dailyStreak.js';
import { getDailyLocations } from '../../serverUtils/dailyChallenge.js';
import { writeLoggedInDailyGame } from '../../serverUtils/dailyGameHistoryWriter.js';
import { MAX_XP_PER_ROUND } from '../../serverUtils/normalizeDailyRounds.js';
import { getClientLocalDate } from '../../utils/dailyDate.js';
import { invalidateDailyPublicCache } from './results.js';

// Matches submit.js's MAX_TOTAL_XP cap so backfilled games use the same XP
// ceiling as a live submit.
const MAX_TOTAL_XP_PER_DAY = 500;

function xpFromScore(score) {
  const xp = Math.round((score || 0) / 50);
  return Math.max(0, Math.min(MAX_XP_PER_ROUND, xp));
}

// Per-user cap on how many claim calls succeed per day. Prevents abuse where
// an attacker has amassed guest-profile IDs from many sources and tries to
// mass-absorb them into a single account. Legitimate users do one claim on
// signin, maybe a second if they played on another device.
const CLAIMS_PER_USER_PER_DAY = 3;
const userClaimTracker = new Map(); // `${userId}|${date}` -> count

function recordClaim(userId, today) {
  const key = `${userId}|${today}`;
  const n = (userClaimTracker.get(key) || 0) + 1;
  userClaimTracker.set(key, n);
  if (userClaimTracker.size > 50000) {
    const oldest = userClaimTracker.keys().next().value;
    userClaimTracker.delete(oldest);
  }
  return n;
}

function mergeHistories(userHistory = [], guestHistory = []) {
  // Dedupe by date, keep max score per date. Rank from whichever wins.
  const byDate = new Map();
  const push = (h) => {
    if (!h?.date) return;
    const existing = byDate.get(h.date);
    if (!existing || (h.score || 0) > (existing.score || 0)) {
      byDate.set(h.date, { date: h.date, score: h.score || 0, rank: h.rank ?? null });
    }
  };
  userHistory.forEach(push);
  guestHistory.forEach(push);
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function ipOf(req) {
  const h = req.headers['x-forwarded-for'];
  if (typeof h === 'string' && h.length > 0) return h.split(',')[0].trim();
  return req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { guestId, secret } = req.body || {};
  if (!secret || typeof secret !== 'string') return res.status(401).json({ error: 'Missing secret' });
  if (!guestId || typeof guestId !== 'string') return res.status(400).json({ error: 'Missing guestId' });

  const user = await User.findOne({ secret }).select('_id username dailyStreak dailyStreakBest dailyHistory lastDailyDate dailyGraceUsedDates');
  if (!user) return res.status(404).json({ error: 'User not found' });

  const today = getClientLocalDate();

  // Per-user daily claim cap.
  if (recordClaim(user._id.toString(), today) > CLAIMS_PER_USER_PER_DAY) {
    return res.status(429).json({ error: 'Too many claims today.' });
  }

  try {
    // Atomic first-wins claim — eliminates TOCTOU between sibling tabs.
    const profile = await GuestProfile.findOneAndUpdate(
      { guestId, claimedBy: null },
      { $set: { claimedBy: user._id, claimedAt: new Date() } },
      { new: true }
    );

    if (!profile) {
      const stale = await GuestProfile.findOne({ guestId }).select('claimedBy').lean();
      if (stale) return res.status(409).json({ error: 'This guest progress was already linked to another account.', code: 'ALREADY_CLAIMED' });
      return res.status(404).json({ error: 'No guest progress to claim.', code: 'NO_PROFILE' });
    }

    const guestHistory = Array.isArray(profile?.daily?.history) ? profile.daily.history : [];
    const userHistory = Array.isArray(user.dailyHistory) ? user.dailyHistory : [];

    const merged = mergeHistories(userHistory, guestHistory);
    const { streak, lastDate, graceAfter } = recomputeStreakFromHistory(
      merged,
      today,
      user.dailyGraceUsedDates || []
    );
    const streakBest = Math.max(
      user.dailyStreakBest || 0,
      profile?.daily?.streakBest || 0,
      streak
    );

    // Backfill DailyChallengeScore for any day the user didn't already have
    // one but the guest did, so historical leaderboards include them.
    let mergedDays = 0;
    let existingDays = 0;
    const guestDates = [...new Set(guestHistory.map(h => h.date))];
    if (guestDates.length > 0) {
      const alreadyScored = await DailyChallengeScore.find({ date: { $in: guestDates }, userId: user._id })
        .select('date').lean();
      const alreadySet = new Set(alreadyScored.map(d => d.date));

      const toBackfill = guestDates.filter(d => !alreadySet.has(d));
      existingDays = alreadySet.size;

      if (toBackfill.length > 0) {
        const guestScores = await GuestScore.find({ guestId, date: { $in: toBackfill } })
          .select('date score totalTime rounds').lean();
        for (const gs of guestScores) {
          try {
            await DailyChallengeScore.create({
              date: gs.date,
              userId: user._id,
              username: user.username || 'Player',
              score: gs.score,
              totalTime: gs.totalTime || 0,
              rounds: gs.rounds || [],
            });
            invalidateDailyPublicCache(gs.date);
            mergedDays++;

            // Mirror the logged-in submit path: create a Game doc, bump
            // totalXp, record stats snapshot. Without this, a player who
            // signs in AFTER playing gets the leaderboard entry but none of
            // the XP they would've earned playing while signed in.
            // Non-fatal — a failure here must not roll back the claim.
            try {
              const dailyLocs = getDailyLocations(gs.date);
              const guestRounds = Array.isArray(gs.rounds) ? gs.rounds : [];
              const normalizedRounds = guestRounds.map(r => ({
                score: r?.score || 0,
                xp: xpFromScore(r?.score),
                distance: r?.distance ?? null,
                timeMs: r?.timeMs ?? null,
                guessLat: r?.guessLat ?? null,
                guessLng: r?.guessLng ?? null,
                country: r?.country ?? null,
              }));
              const finalXp = Math.min(
                MAX_TOTAL_XP_PER_DAY,
                normalizedRounds.reduce((sum, r) => sum + (r.xp || 0), 0)
              );
              await writeLoggedInDailyGame({
                user,
                date: gs.date,
                normalizedRounds,
                dailyLocs,
                finalScore: gs.score,
                finalXp,
                totalTime: gs.totalTime || 0,
              });
            } catch (xpErr) {
              console.warn('[claimGuestProgress] XP/Game backfill failed for', gs.date, xpErr?.message);
            }
          } catch (err) {
            // Unique-constraint race with a concurrent submit — treat as
            // already scored rather than failing the whole claim.
            if (err?.code === 11000) {
              existingDays++;
            } else {
              console.warn('[claimGuestProgress] backfill failed for', gs.date, err?.message);
            }
          }
        }
      }
    }

    const trimmedHistory = merged.slice(0, 30);

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          dailyStreak: streak,
          dailyStreakBest: streakBest,
          lastDailyDate: lastDate || user.lastDailyDate || null,
          dailyGraceUsedDates: graceAfter || user.dailyGraceUsedDates || [],
          dailyHistory: trimmedHistory,
        },
      }
    );

    // Note: we intentionally do NOT touch DailyChallengeStats counters here.
    // Those were already incremented when each guest score was originally
    // submitted. Double-counting would poison the distribution.
    void DailyChallengeStats;
    void bucketIndexForScore;

    console.log('[claimGuestProgress]', JSON.stringify({
      guestId,
      userId: user._id.toString(),
      ip: ipOf(req),
      ua: req.headers['user-agent'] || null,
      claimedAt: new Date().toISOString(),
      mergedDays,
      existingDays,
      streak,
      streakBest,
    }));

    return res.status(200).json({
      ok: true,
      streak,
      streakBest,
      mergedDays,
      existingDays,
      lastDate,
    });
  } catch (err) {
    console.error('[claimGuestProgress]', err);
    return res.status(500).json({ error: 'Failed to claim guest progress' });
  }
}

export default ratelimiter(handler, 5, 60000);
