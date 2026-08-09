import mongoose from 'mongoose';
import { configDotenv } from 'dotenv';
import User from './models/User.js';
import { STARTING_ELO } from './components/utils/ratingFlags.js';
import UserStats from './models/UserStats.js';
import DailyLeaderboard from './models/DailyLeaderboard.js';
import CronState from './models/CronState.js';
import StampLedger from './models/StampLedger.js';
import StampQuests from './models/StampQuests.js';
import UserStatsService from './components/utils/userStatsService.js';
import { purgeUserCascade } from './serverUtils/purgeUserCascade.js';
import { scheduleAligned, nextUtcMidnight, nextUtcMonday } from './serverUtils/scheduleAligned.js';
import { dayKeyUTC, weekKeyUTC } from './serverUtils/stamps/periods.js';
// Timers go through safeInterval so one throwing job cannot take the whole cron
// process down and silently stop every OTHER job with it. See ws/safeTimers.js.
import { safeInterval } from './ws/safeTimers.js';
// Both feature flags are plain constants with no env read and no imports of
// their own, so import order cannot affect them. They were dynamically imported
// below the configDotenv() call while STAMPS_ENABLED still read the env; that is
// no longer true of either one. See serverUtils/stamps/config.js.
import { STAMPS_ENABLED } from './serverUtils/stamps/config.js';
import { RATING_V2 } from './components/utils/ratingFlags.js';
var app = express();
import cors from 'cors';
app.use(cors());

import express from 'express';
import countries from './public/countries.json' with { type: "json" };
import fs from 'fs';
import path from 'path';

import zlib from 'zlib';
// mainWorld stays a static import: updateAllCountriesCache resamples it every
// 60s. The other pool files are read inside initializeCountryPools instead so
// their parsed arrays can be garbage-collected once grouped — at Vali-scale
// (50k/country in world-extra.json) a lingering import copy would roughly
// double cron's resident memory.
import mainWorld from './data/world-main.json' with { type: "json" };

console.log("Locations in mainWorld", mainWorld.length);

configDotenv();

console.log('[INFO] Starting cron.js...');

let dbEnabled = false;
if (!process.env.MONGODB) {
  console.log("[MISSING-ENV WARN] MONGODB env variable not set");
  dbEnabled = false;
} else {
  // Connect to MongoDB
  if (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(process.env.MONGODB);
      console.log('[INFO] Database Connected');
      dbEnabled = true;
    } catch (error) {
      console.error('[ERROR] Database connection failed!', error.message);
      console.log(error);
      dbEnabled = false;
    }
  }
}

// Weekly UserStats update functionality
const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const updateAllUserStats = async () => {
  if (!dbEnabled) {
    console.log('[SKIP] UserStats update skipped - database not connected');
    return;
  }

  console.log('[INFO] Starting ULTRA-FAST weekly UserStats update for ~2M users...');

  try {
    const startTime = Date.now();

    // STEP 1: Get ALL users sorted by XP and ELO (this is the key optimization!)
    console.log('[FETCH] Starting parallel user fetch...');
    const fetchStart = Date.now();

    const [usersByXp, usersByElo] = await Promise.all([
      User.find({ banned: false })
        .select('_id totalXp elo')
        .sort({ totalXp: -1 })
        .lean(),
      User.find({ banned: false })
        .select('_id elo')
        .sort({ elo: -1 })
        .lean()
    ]);

    const fetchTime = Date.now() - fetchStart;
    
    // Handle case where no users are found
    if (usersByXp.length === 0) {
      console.log(`[FETCH] ⚠️ No users found in database (fetched in ${fetchTime}ms) - skipping UserStats update`);
      return;
    }
    
    console.log(`[FETCH] ✅ Fetched ${usersByXp.length} users in ${fetchTime}ms (${(fetchTime/usersByXp.length).toFixed(2)}ms/user)`);

    // STEP 2: Create rank lookup maps (O(n) instead of O(n²))
    console.log('[RANK] Creating rank lookup maps...');
    const rankStart = Date.now();

    const xpRankMap = new Map();
    const eloRankMap = new Map();

    usersByXp.forEach((user, index) => {
      xpRankMap.set(user._id.toString(), index + 1);
    });

    usersByElo.forEach((user, index) => {
      eloRankMap.set(user._id.toString(), index + 1);
    });

    const rankTime = Date.now() - rankStart;
    console.log(`[RANK] ✅ Created rank maps in ${rankTime}ms (${(rankTime/usersByXp.length).toFixed(3)}ms/user)`);
    console.log(`[SETUP] Total setup time: ${fetchTime + rankTime}ms`);
    console.log('━'.repeat(60));
    console.log('[BULK] Starting bulk insert phase...');

    // STEP 3: Bulk insert with pre-calculated ranks
    const batchSize = 5000; // HUGE batches
    let totalUpdated = 0;

    for (let i = 0; i < usersByXp.length; i += batchSize) {
      const batch = usersByXp.slice(i, i + batchSize);

      // Create documents for bulk insert
      const documents = batch.map(user => ({
        userId: user._id,
        timestamp: new Date(),
        totalXp: user.totalXp || 0,
        xpRank: xpRankMap.get(user._id.toString()),
        elo: user.elo || STARTING_ELO,
        eloRank: eloRankMap.get(user._id.toString()),
        triggerEvent: 'weekly_update',
        gameId: null
      }));

      // Bulk insert - MUCH faster than individual creates
      try {
        await UserStats.insertMany(documents, { ordered: false });
        totalUpdated += documents.length;
      } catch (error) {
        console.error(`[ERROR] Bulk insert error for batch ${i}-${i + batch.length}:`, error.message);
        // Continue with next batch
      }

      // Progress update with detailed stats
      if ((i + batchSize) % 50000 === 0 || i + batchSize >= usersByXp.length) {
        const now = Date.now();
        const elapsedMs = now - startTime;
        const processed = Math.min(i + batchSize, usersByXp.length);
        const remaining = usersByXp.length - processed;

        // Calculate rates and estimates
        const usersPerMs = processed / elapsedMs;
        const usersPerSec = (usersPerMs * 1000).toFixed(0);
        const msPerUser = (elapsedMs / processed).toFixed(2);
        const progressPct = ((processed / usersByXp.length) * 100).toFixed(1);

        // Time estimates
        const elapsedMin = (elapsedMs / 1000 / 60).toFixed(1);
        const etaMs = remaining / usersPerMs;
        const etaMin = (etaMs / 1000 / 60).toFixed(1);
        const totalEtaMin = (elapsedMs + etaMs) / 1000 / 60;

        console.log(`[PROGRESS] ${processed}/${usersByXp.length} users (${progressPct}%)`);
        console.log(`[SPEED] ${usersPerSec}/sec | ${msPerUser}ms/user | Batch: ${documents.length} users`);
        console.log(`[TIME] Elapsed: ${elapsedMin}m | ETA: ${etaMin}m | Total: ${totalEtaMin.toFixed(1)}m`);
        console.log(`[MEMORY] ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB heap used`);
        console.log('─'.repeat(60));
      }
    }

    const totalTimeMs = Date.now() - startTime;
    const totalTimeSec = (totalTimeMs / 1000).toFixed(1);
    const totalTimeMin = (totalTimeMs / 1000 / 60).toFixed(1);

    console.log('━'.repeat(60));
    console.log(`[COMPLETE] 🚀 ULTRA-FAST update completed!`);
    console.log(`[STATS] ${totalUpdated} users updated in ${totalTimeMs}ms (${totalTimeSec}s, ${totalTimeMin}m)`);
    
    // Only show performance stats if users were actually updated (avoid division by zero)
    if (totalUpdated > 0) {
      const avgRate = (totalUpdated / totalTimeMs * 1000).toFixed(0);
      const msPerUser = (totalTimeMs / totalUpdated).toFixed(2);
      console.log(`[PERFORMANCE] ${avgRate} users/sec | ${msPerUser}ms/user`);
    } else {
      console.log(`[PERFORMANCE] No users were updated - check for bulk insert errors above`);
    }
    console.log('━'.repeat(60));

  } catch (error) {
    console.error('[ERROR] Weekly UserStats update failed:', error);
  }
};

// Set up weekly timer that runs every 7 days
const startWeeklyUserStatsTimer = () => {
  console.log('[INFO] UserStats weekly update timer started - next update in 7 days');
  const runUpdateAndRestart = async () => {
    await updateAllUserStats();
    // Restart the timer for another 7 days
    setTimeout(runUpdateAndRestart, WEEK_IN_MS);
  };

  // Start the timer
  setTimeout(runUpdateAndRestart, WEEK_IN_MS);
};

// Start the weekly timer
startWeeklyUserStatsTimer();

// ============================================================================
// DAILY LEADERBOARD PRE-COMPUTATION
// Computes and caches top 50k users every 15 minutes instead of on-demand
// ============================================================================

const LEADERBOARD_UPDATE_INTERVAL = 15 * 60 * 1000; // 15 minutes
const LEADERBOARD_TTL_DAYS = 30; // Keep leaderboards for 30 days

const computeDailyLeaderboards = async () => {
  if (!dbEnabled) {
    console.log('[SKIP] Daily leaderboard computation skipped - database not connected');
    return;
  }

  console.log('[LEADERBOARD] Starting daily leaderboard computation...');
  const startTime = Date.now();

  try {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

    // Get start of day (midnight UTC) for consistent date keys
    const todayMidnight = new Date(now);
    todayMidnight.setUTCHours(0, 0, 0, 0);

    // Compute both XP and ELO leaderboards in parallel
    const [xpLeaderboard, eloLeaderboard] = await Promise.all([
      computeLeaderboardForMode('xp', dayAgo),
      computeLeaderboardForMode('elo', dayAgo)
    ]);

    // Save both leaderboards to database
    const expiresAt = new Date(now.getTime() + (LEADERBOARD_TTL_DAYS * 24 * 60 * 60 * 1000));

    await Promise.all([
      DailyLeaderboard.findOneAndUpdate(
        { date: todayMidnight, mode: 'xp' },
        {
          date: todayMidnight,
          mode: 'xp',
          leaderboard: xpLeaderboard.leaderboard,
          totalActiveUsers: xpLeaderboard.totalActiveUsers,
          computedAt: now,
          expiresAt: expiresAt
        },
        { upsert: true, new: true }
      ),
      DailyLeaderboard.findOneAndUpdate(
        { date: todayMidnight, mode: 'elo' },
        {
          date: todayMidnight,
          mode: 'elo',
          leaderboard: eloLeaderboard.leaderboard,
          totalActiveUsers: eloLeaderboard.totalActiveUsers,
          computedAt: now,
          expiresAt: expiresAt
        },
        { upsert: true, new: true }
      )
    ]);

    const duration = Date.now() - startTime;
    console.log(`[LEADERBOARD] ✅ Daily leaderboards computed in ${duration}ms`);
    console.log(`[LEADERBOARD] XP: ${xpLeaderboard.leaderboard.length} users, ${xpLeaderboard.totalActiveUsers} total active`);
    console.log(`[LEADERBOARD] ELO: ${eloLeaderboard.leaderboard.length} users, ${eloLeaderboard.totalActiveUsers} total active`);
  } catch (error) {
    console.error('[LEADERBOARD] Error computing daily leaderboards:', error);
  }
};

// Helper function to compute leaderboard for a specific mode (xp or elo)
const computeLeaderboardForMode = async (mode, dayAgo) => {
  // Only events that actually move XP/ELO contribute to the daily delta.
  // weekly_update writes one row per user (millions) and was the dominant
  // source of work; excluding it shrinks the working set massively.
  //
  // We use $top/$bottom (Mongo 5.2+) so $group can pick the latest/oldest doc
  // per user without a global blocking $sort over the whole 24h slice. The
  // pipeline becomes a streaming hash aggregation with one-doc accumulators.
  const deltaField = mode === 'xp' ? 'xpDelta' : 'eloDelta';
  const pipeline = [
    {
      $match: {
        timestamp: { $gte: dayAgo },
        triggerEvent: { $in: ['game_completed', 'elo_refund'] }
      }
    },
    {
      $group: {
        _id: '$userId',
        latest: {
          $top: {
            sortBy: { timestamp: -1 },
            output: { totalXp: '$totalXp', elo: '$elo' }
          }
        },
        oldest: {
          $bottom: {
            sortBy: { timestamp: -1 },
            output: { totalXp: '$totalXp', elo: '$elo' }
          }
        }
      }
    },
    {
      $project: {
        userId: '$_id',
        xpDelta:    { $subtract: ['$latest.totalXp', '$oldest.totalXp'] },
        eloDelta:   { $subtract: ['$latest.elo',     '$oldest.elo'] },
        currentXp:  '$latest.totalXp',
        currentElo: '$latest.elo'
      }
    },
    { $match: { [deltaField]: { $gt: 0 } } },
    { $sort:  { [deltaField]: -1 } },
    { $limit: 50000 }
  ];

  // Execute aggregation with maxTimeMS to prevent hanging
  const userDeltas = await UserStats.aggregate(pipeline)
    .allowDiskUse(true)
    .option({ maxTimeMS: 60000 });

  // Get user details for top 50k. Exclude banned users and users with a
  // pending forced name change so moderation actions remove them from this
  // leaderboard on the next rebuild — without this, takeAction.js's scrub
  // would silently undo itself every 15 minutes.
  const userIds = userDeltas.map(u => u.userId);
  const users = await User.find({
    _id: { $in: userIds },
    banned: { $ne: true },
    pendingNameChange: { $ne: true }
  }).select('_id username countryCode').lean().maxTimeMS(30000);

  // Create user lookup map
  const userMap = new Map();
  users.forEach(user => {
    userMap.set(user._id.toString(), user);
  });

  // Build final leaderboard with user details — drop deltas whose user got
  // filtered (banned / pending name change) before assigning ranks so the
  // resulting list is contiguous.
  const leaderboard = userDeltas
    .filter(delta => userMap.has(delta.userId.toString()))
    .map((delta, index) => {
      const user = userMap.get(delta.userId.toString());
      return {
        userId: delta.userId.toString(),
        username: user.username,
        delta: mode === 'xp' ? delta.xpDelta : delta.eloDelta,
        currentValue: mode === 'xp' ? delta.currentXp : delta.currentElo,
        rank: index + 1,
        countryCode: user.countryCode || null
      };
    });

  return { leaderboard, totalActiveUsers: leaderboard.length };
};

// Start the daily leaderboard computation timer
const startDailyLeaderboardTimer = () => {
  console.log(`[LEADERBOARD] Daily leaderboard computation timer started - updates every ${LEADERBOARD_UPDATE_INTERVAL / 1000 / 60} minutes`);

  // Run immediately on startup
  computeDailyLeaderboards();

  // Then run every 15 minutes
  safeInterval('dailyLeaderboards', LEADERBOARD_UPDATE_INTERVAL, computeDailyLeaderboards);
};

// Start the timer
startDailyLeaderboardTimer();

// ============================================================================
// ACCOUNT DELETION PURGE
// Self-service account deletions have a 30-day grace period (User.scheduledDeletionAt).
// Once that passes, permanently purge the account + all associated data via the
// shared cascade (serverUtils/purgeUserCascade.js). Runs the heavy work OFF the
// HTTP request path — the in-request mod delete routinely timed out.
// ============================================================================

const DELETION_PURGE_INTERVAL = 24 * 60 * 60 * 1000; // daily
const DELETION_PURGE_BATCH = 500;                    // cap per run; next run catches the rest

const purgeScheduledDeletions = async () => {
  if (!dbEnabled) {
    console.log('[PURGE] Skipped account-deletion purge - database not connected');
    return;
  }
  try {
    const now = new Date();
    const due = await User.find({ scheduledDeletionAt: { $ne: null, $lte: now } })
      .sort({ scheduledDeletionAt: 1 })
      .limit(DELETION_PURGE_BATCH);
    if (due.length === 0) return;

    console.log(`[PURGE] ${due.length} account(s) past their deletion grace period`);
    let purged = 0;
    for (const candidate of due) {
      // Re-read just before purging: the user may have logged back in and
      // cancelled (scheduledDeletionAt cleared) between the query and now.
      const user = await User.findById(candidate._id);
      if (!user || !user.scheduledDeletionAt || new Date(user.scheduledDeletionAt) > new Date()) {
        continue;
      }
      try {
        await purgeUserCascade(user, { reason: 'self_service_deletion', isSelfService: true });
        purged++;
      } catch (e) {
        console.error('[PURGE] Failed to purge account', user._id?.toString(), e?.message || e);
      }
    }
    console.log(`[PURGE] Purged ${purged}/${due.length} account(s)`);
  } catch (e) {
    console.error('[PURGE] Account-deletion purge run failed:', e?.message || e);
  }
};

const startAccountDeletionPurgeTimer = () => {
  console.log('[PURGE] Account-deletion purge timer started - runs on startup, then daily');
  // Run on startup so a redeploy near a due time still catches overdue purges.
  purgeScheduledDeletions();
  safeInterval('deletionPurge', DELETION_PURGE_INTERVAL, purgeScheduledDeletions);
};

startAccountDeletionPurgeTimer();

// ============================================================================
// WALL-CLOCK ALIGNED JOBS (daily / weekly rollovers)
//
// Everything above this line is anchored to PROCESS START (setInterval from
// boot). That is fine for "refresh a cache every N minutes" and completely
// wrong for anything that must land ON a UTC boundary: a redeploy at 18:00
// would move "midnight" to 18:00 forever. These jobs use scheduleAligned,
// which recomputes the delay from the wall clock on every arm.
//
// The STAMPS_ENABLED / RATING_V2 gates below are STATIC imports at the top of
// this file. They used to be dynamic `await import()`s placed here, because a
// static binding is evaluated BEFORE this module's body — i.e. before
// configDotenv() runs — so anything reading process.env at import time froze the
// wrong value. Neither flag reads the env any more, so that trap is gone with
// them. The rule still applies to any NEW env-reading module: import it
// dynamically, below configDotenv(), or better, give it a default that is
// correct when the variable is absent.
// ============================================================================

/**
 * Arm one wall-clock-aligned job, with missed-boundary recovery.
 *
 * A pure timer only knows "did a tick fire". A cron process that was down,
 * deploying or crash-looping across 00:00 UTC never sees that tick and skips
 * the boundary FOREVER — the next tick is tomorrow's. CronState turns the
 * question into "has this period been processed" by bookmarking the period key
 * of the last successful run, which survives arbitrary downtime.
 *
 * The period key is derived at RUN time, not at arm time. That also absorbs a
 * timer that fires a hair early (23:59:59.999): the key would still be the old
 * period, so nothing is stamped for the new one, and scheduleAligned's 1s
 * minimum delay re-arms it to fire again just after midnight with the right key.
 *
 * The bookmark is written only AFTER the work commits. Stamping first would
 * turn a mid-run crash into a permanently skipped period.
 *
 * @param {string}   job    Stable CronState identifier.
 * @param {Function} nextFn Boundary generator (nextUtcMidnight / nextUtcMonday).
 * @param {Function} keyFn  Period key for a timestamp (dayKeyUTC / weekKeyUTC).
 * @param {Function} run    async (periodKey) => void. Must be idempotent.
 */
const startAlignedJob = (job, nextFn, keyFn, run) => {
  if (!dbEnabled) {
    console.log(`[CRON:${job}] Skipped - database not connected`);
    return;
  }

  const runAndStamp = async () => {
    if (!dbEnabled) return;
    const periodKey = keyFn(Date.now());
    try {
      await run(periodKey);
      await CronState.updateOne(
        { job },
        { $set: { job, lastPeriodKey: periodKey, lastRunAt: new Date() } },
        { upsert: true },
      );
    } catch (e) {
      // Deliberately NOT stamped: the next boot re-detects this period as
      // unprocessed and retries it. Never rethrown - this must not be able to
      // take the process down.
      console.error(`[CRON:${job}] Run failed for period ${periodKey}:`, e?.message || e);
    }
  };

  // Boundary recovery runs async so a slow/failing CronState read can never
  // block the schedule from arming below.
  (async () => {
    try {
      const state = await CronState.findOne({ job }).lean();
      const currentKey = keyFn(Date.now());
      if (state?.lastPeriodKey === currentKey) return;
      // No bookmark at all (first ever boot) also lands here and runs one pass.
      // Safe: every job wired through here is idempotent, and the alternative -
      // stamping without running - would silently swallow a real missed boundary
      // on the very first deploy.
      console.log(`[CRON:${job}] Missed boundary (last=${state?.lastPeriodKey || 'never'}, current=${currentKey}) - running recovery pass`);
      await runAndStamp();
    } catch (e) {
      console.error(`[CRON:${job}] Boundary recovery check failed:`, e?.message || e);
    }
  })();

  scheduleAligned(nextFn, runAndStamp, job);
  console.log(`[CRON:${job}] Armed - next run at ${new Date(nextFn(Date.now())).toISOString()}`);
};

// ============================================================================
// DAILY elo_today RESET (00:00 UTC)
// elo_today is $inc'd on every ranked game and was reset NOWHERE, so the
// "daily" ELO board has been showing lifetime drift since it shipped.
//
// Gated behind RATING_V2 rather than shipped bare: zeroing this changes what
// the daily board MEANS, so it flips over together with the new ladder instead
// of silently redefining the current one mid-season.
// ============================================================================

const resetEloToday = async () => {
  // Unindexed predicate over ~2M docs, but it runs once a day and the $ne
  // filter keeps the WRITE set to rows that actually drifted - adding an index
  // on elo_today would be paid on every ranked game to save one daily scan.
  const result = await User.updateMany({ elo_today: { $ne: 0 } }, { $set: { elo_today: 0 } });
  console.log(`[CRON:eloTodayReset] Reset elo_today on ${result.modifiedCount || 0} user(s)`);
};

const startEloTodayResetTimer = () => {
  if (!RATING_V2) {
    console.log('[CRON:eloTodayReset] Disabled (RATING_V2 off) - not armed');
    return;
  }
  startAlignedJob('eloTodayReset', nextUtcMidnight, dayKeyUTC, resetEloToday);
};

startEloTodayResetTimer();

// ============================================================================
// STAMPS PERIOD ROLLOVER (daily 00:00 UTC, weekly Monday 00:00 UTC)
//
// !!! DO NOT "FIX" THIS BY ADDING A PER-USER COUNTER RESET SWEEP !!!
//
// There is no reset. StampQuests period keys are derived from the wall clock at
// GRANT time, so a new period is simply a new periodKey, which is a new
// document with counters already at their defaults. The reset is IMPLICIT and
// happens for free, per user, at that user's first write of the new period -
// and only for users who actually play.
//
// Iterating users to zero counters would touch ~2M docs to accomplish exactly
// nothing, and would instantly become the most expensive thing in this process.
// Worse, it would be a correctness regression: a sweep that wrote into the
// CURRENT period's docs (a late-firing pass, a missed-boundary recovery run)
// would destroy live progress that the key-based model cannot lose.
//
// All these jobs do is set expiresAt on the docs of periods that are over, so
// the TTL index on StampQuests reaps them. Nothing is recomputed, and payment
// state is untouched: that lives exclusively in StampLedger's idempotencyKey.
// ============================================================================

const STAMP_QUESTS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // reap ~30 days after the period closes

const expireStampQuests = async (periodType, currentKey) => {
  const expiresAt = new Date(Date.now() + STAMP_QUESTS_TTL_MS);
  // `expiresAt: null` (which also matches "field absent") is LOAD-BEARING.
  // Without it, every nightly pass would push the TTL of every already-marked
  // doc another 30 days into the future and the collection would never be
  // reaped at all. Marking is one-way: once scheduled, a doc is left alone.
  //
  // Matching on `periodKey != currentKey` rather than on a computed "yesterday"
  // also mops up stragglers from any period this job missed entirely.
  const result = await StampQuests.updateMany(
    { periodType, periodKey: { $ne: currentKey }, expiresAt: null },
    { $set: { expiresAt } },
  );
  console.log(`[CRON:stamps${periodType === 'day' ? 'Daily' : 'Weekly'}Rollover] Scheduled ${result.modifiedCount || 0} closed '${periodType}' quest doc(s) for TTL reaping (current period ${currentKey})`);
};

const startStampsPeriodRolloverTimers = () => {
  if (!STAMPS_ENABLED) {
    console.log('[CRON:stampsRollover] Disabled (STAMPS_ENABLED off) - not armed');
    return;
  }
  startAlignedJob('stampsDailyRollover', nextUtcMidnight, dayKeyUTC, (periodKey) =>
    expireStampQuests('day', periodKey));
  startAlignedJob('stampsWeeklyRollover', nextUtcMonday, weekKeyUTC, (periodKey) =>
    expireStampQuests('week', periodKey));
};

startStampsPeriodRolloverTimers();

// ============================================================================
// STAMP LEDGER RECONCILIATION SWEEP (every 5 minutes)
//
// grantStamps writes the ledger row with applied:false FIRST and moves the
// user's balance SECOND. That order is chosen so the only way to fail is
// UNDER-payment: a crash between the two steps leaves a durable applied:false
// row and an unpaid user. (The reverse order fails as a double-pay, which is
// unrepairable - nothing records that the credit already happened.) This sweep
// is the other half of that bargain: it is what actually repairs the
// under-payment, so it is not optional infrastructure.
//
// Deliberately NOT calendar-aligned - it is a repair loop, not a boundary.
//
// CONCURRENCY: correctness here relies on cron.js remaining a SINGLE process.
// Two cron processes could both read the same row before either claims it. The
// claim is what saves it if that ever changes: the CAS below matches on the
// EXACT claimedAt value that was observed, so of two racing claimers only one
// can win and the loser skips the row. The claim is also a LEASE, not a
// permanent flag - a crash between claiming and the $inc would otherwise strand
// the row forever, so an expired claim (older than the timeout) is re-claimable
// and the repair self-heals on a later pass.
// ============================================================================

const STAMP_RECONCILE_INTERVAL = 5 * 60 * 1000; // sweep cadence
const STAMP_RECONCILE_MIN_AGE_MS = 60 * 1000;   // ignore rows a live grant may still be mid-flight on
const STAMP_RECONCILE_CLAIM_TTL_MS = 5 * 60 * 1000; // a claim older than this is presumed crashed
const STAMP_RECONCILE_BATCH = 500;              // cap per sweep; the next pass catches the rest

const reconcileStampLedger = async () => {
  if (!dbEnabled) return;
  try {
    const now = Date.now();
    const rows = await StampLedger.find({
      applied: false,
      // Age gate: a row younger than this probably belongs to an in-flight
      // grant that is about to apply it itself.
      createdAt: { $lt: new Date(now - STAMP_RECONCILE_MIN_AGE_MS) },
      $or: [
        { claimedAt: null },
        { claimedAt: { $lt: new Date(now - STAMP_RECONCILE_CLAIM_TTL_MS) } },
      ],
    }).limit(STAMP_RECONCILE_BATCH).lean();

    if (rows.length === 0) return;
    console.log(`[CRON:stampReconcile] ${rows.length} unapplied ledger row(s) to repair`);

    let repaired = 0;
    let contended = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        // CAS on the observed claimedAt (null included). Losing this race means
        // somebody else owns the row right now - skip it, do NOT apply.
        const claimed = await StampLedger.findOneAndUpdate(
          { _id: row._id, applied: false, claimedAt: row.claimedAt ?? null },
          { $set: { claimedAt: new Date() } },
          { new: true },
        );
        if (!claimed) {
          contended++;
          continue;
        }

        // Balance moves only AFTER the claim is won. delta is signed, so this
        // repairs credits and debits alike.
        await User.updateOne({ _id: row.userId }, { $inc: { stamps: row.delta } });
        await StampLedger.updateOne(
          { _id: row._id },
          { $set: { applied: true, appliedAt: new Date() } },
        );
        repaired++;
      } catch (e) {
        // Per-row isolation: one bad row must not abort the sweep. It stays
        // applied:false and its claim expires, so the next pass retries it.
        failed++;
        console.error(`[CRON:stampReconcile] Failed to repair ledger row ${row._id?.toString()}:`, e?.message || e);
      }
    }

    console.log(`[CRON:stampReconcile] Repaired ${repaired}, skipped ${contended} claimed, ${failed} failed`);
  } catch (e) {
    console.error('[CRON:stampReconcile] Sweep failed:', e?.message || e);
  }
};

const startStampLedgerReconcileTimer = () => {
  if (!STAMPS_ENABLED) {
    console.log('[CRON:stampReconcile] Disabled (STAMPS_ENABLED off) - not armed');
    return;
  }
  if (!dbEnabled) {
    console.log('[CRON:stampReconcile] Skipped - database not connected');
    return;
  }
  console.log(`[CRON:stampReconcile] Timer started - sweeps every ${STAMP_RECONCILE_INTERVAL / 1000 / 60} minutes`);
  // Run on startup: the most likely reason rows are stranded is the crash or
  // redeploy that just happened.
  reconcileStampLedger();
  safeInterval('stampReconcile', STAMP_RECONCILE_INTERVAL, reconcileStampLedger);
};

startStampLedgerReconcileTimer();

// ============================================================================
// COUNTRY LOCATIONS SYSTEM - Uses pre-processed JSON files with embedded country codes
// No runtime geo lookups needed - just shuffling and rotation for freshness
// ============================================================================

const SERVE_SIZE = 2000; // How many locations to serve per request
const SHUFFLE_INTERVAL = 30 * 1000; // Reshuffle every 30 seconds for freshness

// Get override countries (countries with manual map overrides)
const overrideCountries = [];
const mapOverridesDir = path.join(process.cwd(), 'data', 'mapOverrides');
const mapOverrideFiles = fs.readdirSync(mapOverridesDir).filter(file => file.endsWith('.json'));
for (const file of mapOverrideFiles) {
  overrideCountries.push(file.split('.')[0]);
}
console.log(`[INIT] Found override for countries: ${overrideCountries.join(', ')}`);

// Master pools - ALL locations grouped by country (never modified after init)
const countryPools = {};
// Served locations - rotating window into the pools
let countryLocations = {};
// Current offset per country for rotation
const countryOffsets = {};

// Fisher-Yates shuffle (in-place, fast)
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// Initialize country pools from both JSON files
const initializeCountryPools = () => {
  console.log('[INIT] Building country location pools from JSON files...');
  const startTime = Date.now();

  // Combine all locations
  // Read-and-release: these files only feed the country pools. world-extra.json
  // is the Vali/generateCountryLocations output — country top-ups only,
  // deliberately NOT part of the /allCountries world sample (mainWorld is).
  const readPool = (f) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', f), 'utf8'));
  const arbitraryWorld = readPool('world-arbitrary.json');
  const pinpointableWorld = readPool('world-pinpointable.json');
  const diverseWorld = readPool('diverse-locations.json'); // locations for countries underrepresented in the other maps
  // world-extra ships gzipped: at 4M+ locations the raw JSON is ~315MB, which
  // GitHub refuses (100MB file cap). ~80MB compressed.
  const extraWorld = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(process.cwd(), 'data', 'world-extra.json.gz'))).toString());
  console.log(`[INIT] Pool files: arbitrary ${arbitraryWorld.length}, pinpointable ${pinpointableWorld.length}, diverse ${diverseWorld.length}, extra ${extraWorld.length}`);

  const allLocations = [...mainWorld, ...arbitraryWorld, ...pinpointableWorld, ...diverseWorld, ...extraWorld];

  // Group by country
  for (const loc of allLocations) {
    const { lat, lng, country, heading, pitch, panoId } = loc;
    if (!country) continue;
    if (overrideCountries.includes(country)) continue; // Skip overridden countries

    if (!countryPools[country]) {
      countryPools[country] = [];
    }
    const entry = { lat, long: lng, country };
    if (heading !== undefined && heading !== null) entry.heading = heading;
    if (pitch !== undefined && pitch !== null) entry.pitch = pitch;
    if (panoId) entry.panoId = panoId;
    countryPools[country].push(entry);
  }

  // Shuffle each pool and initialize offsets
  const countryCounts = {};
  for (const country of Object.keys(countryPools)) {
    shuffle(countryPools[country]);
    countryOffsets[country] = 0;
    countryCounts[country] = countryPools[country].length;
  }

  // Initialize served locations (first window)
  refreshCountryLocations();

  const duration = Date.now() - startTime;
  const totalLocs = Object.values(countryPools).reduce((sum, arr) => sum + arr.length, 0);
  const countryCount = Object.keys(countryPools).length;

  // Filter to only include countries in countries.json
  const validCountries = new Set(countries);
  const filteredCountryCounts = Object.fromEntries(
    Object.entries(countryCounts).filter(([country]) => validCountries.has(country))
  );

  // Log stats
  const sorted = Object.entries(filteredCountryCounts).sort((a, b) => b[1] - a[1]);
  const top10 = sorted.slice(0, 10).map(([c, n]) => `${c}:${n}`).join(', ');
  const bottom5 = sorted.slice(-5).map(([c, n]) => `${c}:${n}`).join(', ');

  console.log('━'.repeat(60));
  console.log(`[INIT] ✅ Built pools: ${totalLocs.toLocaleString()} locations across ${countryCount} countries in ${duration}ms`);
  console.log(`[INIT] Most locations: ${top10}`);
  console.log(`[INIT] Least locations: ${bottom5}`);
  console.log('━'.repeat(60));
  console.log('[INIT] Total available locations per country (from countries.json):');
  sorted.forEach(([country, count]) => {
    console.log(`[INIT]   ${country}: ${count.toLocaleString()} locations`);
  });
  console.log('━'.repeat(60));
};

// Refresh served locations by rotating through pools
const refreshCountryLocations = () => {
  for (const country of Object.keys(countryPools)) {
    const pool = countryPools[country];
    if (pool.length === 0) continue;

    // Get current offset
    let offset = countryOffsets[country];

    // Build served array by rotating through pool
    const served = [];
    const count = Math.min(SERVE_SIZE, pool.length);

    for (let i = 0; i < count; i++) {
      served.push(pool[(offset + i) % pool.length]);
    }

    // Shuffle the served locations for randomness
    shuffle(served);

    // Advance offset for next refresh (with some randomness)
    countryOffsets[country] = (offset + Math.floor(count / 4) + Math.floor(Math.random() * 50)) % pool.length;

    countryLocations[country] = served;
  }
};

// Initialize pools on startup
initializeCountryPools();

// Background shuffler - keeps locations fresh by rotating and reshuffling
const startCountryLocationShuffler = () => {
  console.log(`[SHUFFLER] Started - refreshing every ${SHUFFLE_INTERVAL / 1000}s`);

  safeInterval('countryShuffle', SHUFFLE_INTERVAL, () => {
    const startTime = Date.now();

    // Occasionally reshuffle entire pools for variety (every 10 intervals)
    if (Math.random() < 0.1) {
      for (const pool of Object.values(countryPools)) {
        shuffle(pool);
      }
      console.log('[SHUFFLER] Full pool reshuffle');
    }

    // Refresh served locations
    refreshCountryLocations();

    const duration = Date.now() - startTime;
    console.log(`[SHUFFLER] Refreshed country locations in ${duration}ms`);
  });
};

startCountryLocationShuffler();


// ============================================================================
// ALL COUNTRIES (World Map) CACHE - Random sampling from mainWorld
// ============================================================================

let allCountriesCache = [];
let lastAllCountriesCacheUpdate = 0;
let isCacheUpdating = false;

// Background function to update allCountries cache
const updateAllCountriesCache = async () => {
  if (isCacheUpdating) {
    console.log('[CACHE] AllCountries cache update already in progress, skipping...');
    return;
  }

  isCacheUpdating = true;
  console.log('[CACHE] Starting allCountries cache update...');

  try {
    // Pick 2k locations randomly from mainWorld, prevent duplicates
    const totalLocs = mainWorld.length;
    const neededLocs = 2000;
    const indexes = new Set();

    while (indexes.size < neededLocs) {
      indexes.add(Math.floor(Math.random() * totalLocs));
    }

    const locations = [];
    for (const index of indexes) {
      try {
        const { lat, lng, country, heading, pitch, panoId } = mainWorld[index];
        const entry = { lat, long: lng, country };
        if (heading !== undefined && heading !== null) entry.heading = heading;
        if (pitch !== undefined && pitch !== null) entry.pitch = pitch;
        if (panoId) entry.panoId = panoId;
        locations.push(entry);
      } catch (error) {
        console.error('Error looking up country', error, index);
      }
    }

    console.log(`[CACHE] Generated ${locations.length} locations from mainWorld which has ${totalLocs} total locations.`);
    allCountriesCache = locations;
    lastAllCountriesCacheUpdate = Date.now();
  } catch (error) {
    console.error('[CACHE] Error updating allCountries cache:', error);
  } finally {
    isCacheUpdating = false;
  }
};

// Background cache updater - runs every 60 seconds
const startAllCountriesCacheUpdater = () => {
  // Initial cache generation
  updateAllCountriesCache();

  // Set up recurring updates every 60 seconds
  safeInterval('allCountriesCache', 60 * 1000, () => {
    updateAllCountriesCache();
  });

  console.log('[CACHE] AllCountries cache updater started - updates every 60 seconds');
};

// Start the background cache updater
startAllCountriesCacheUpdater();

// Instant endpoint that just returns the latest cache
app.get('/allCountries.json', (req, res) => {
  // Always return the current cache instantly - no generation during request
  return res.json({
    ready: allCountriesCache.length > 0,
    locations: allCountriesCache.slice() // Return a copy to avoid mutation
  });
});

app.get('/countryLocations/:country', (req, res) => {
  const country = req.params.country;
  if (!countryLocations[country]) {
    return res.status(404).json({ message: 'Country not found' });
  }
  return res.json({ ready:
    countryLocations[country].length > 0,
     locations: countryLocations[country] });
});

// Endpoint for /clueCountries.json (stub - clue locations not implemented in cron.js)
const clueLocations = []; // TODO: Implement clue locations if needed
app.get('/clueCountries.json', (req, res) => {
  if (clueLocations.length === 0) {
    return res.json({ ready: false });
  } else {
    return res.json({ ready: true, locations: shuffle([...clueLocations]) });
  }
});


// listen 3003
app.get('/', (req, res) => {
  res.status(200).send('WorldGuessr Utils');
});

app.listen(3003, () => {
  console.log('WorldGuessr Utils listening on port 3003');
});