#!/usr/bin/env node
/**
 * Rating v2 ROLLBACK: restore every account's rating from the in-document
 * snapshot written by scripts/migrateRatingV2.js.
 *
 *     elo = elo_s0    (for every doc where elo_s0 is not null)
 *
 * DRY RUN BY DEFAULT. Nothing is written without --apply.
 *
 * WHY THE SNAPSHOT LIVES IN THE DOCUMENT
 * --------------------------------------
 * elo_s0 makes rollback a single field copy that needs no backup restore, no
 * downtime beyond the write itself, and no reconciliation of games played since
 * the migration. Restoring a backup would also roll back everything else that
 * happened in the meantime; this rolls back exactly the rating.
 *
 *   >>> NEVER DELETE elo_s0. Retain it for AT LEAST 60 DAYS after migration.
 *   >>> It is the only record of the pre-migration ladder. Dropping it makes
 *   >>> rollback impossible and makes every "my rating was wrong" support
 *   >>> ticket unanswerable.
 *
 * WHAT THIS DELIBERATELY DOES *NOT* UNDO
 * --------------------------------------
 * ratedGames is NOT unset. Three reasons:
 *   1. The v1 engine never reads it, so leaving it set changes nothing for a
 *      rolled-back ladder.
 *   2. The backfill is a pure $set of a pure function of pre-migration counters
 *      (min(duels_wins + duels_losses + duels_tied, 70)), so re-running the
 *      migration RECOMPUTES the value rather than compounding it.
 *   3. Unsetting it would make every account ratedGames 0 again — i.e. would
 *      re-arm the exact placement landmine the backfill exists to defuse. If v2
 *      were then re-enabled before a re-run of the migration, veterans would be
 *      placement-eligible with their v1 ratings live.
 *
 * seasonPeakElo / seasonPeakLeague are also left alone: they describe Season 0,
 * they are derived from elo_s0 and the frozen peak table, and a migration re-run
 * recomputes them identically.
 *
 *   !!! WARNING FOR FUTURE FEATURES !!!
 *   This "re-running recomputes rather than compounds" property holds ONLY for
 *   $set of pure functions. The XP grants that ship with the ranked economy are
 *   $inc operations. $inc is NOT self-healing: a rollback does not subtract
 *   them, and a re-run ADDS THEM AGAIN. Any future migration step that uses $inc
 *   needs its own idempotency guard (a per-user "granted" marker, a grant ledger
 *   collection, or a conditional filter), and its own explicit reversal here.
 *
 * Usage (from project root):
 *   node scripts/rollbackRatingV2.js                (dry run — report only)
 *   node scripts/rollbackRatingV2.js --limit 1000   (dry run, first 1000 users)
 *   node scripts/rollbackRatingV2.js --apply        (RESTORE v1 RATINGS)
 *
 * Flags:
 *   --apply         Required to write. Default is a dry run.
 *   --limit N       Only the first N users by _id ascending. Testing. Scopes
 *                   identically to migrateRatingV2.js --limit N.
 *   --batch N       Batch size. Default 100000.
 *   --pause-ms N    Pause between batches. Default 250.
 *
 * Requires: MONGODB env var (dotenv/.env is loaded).
 * Idempotent: a second run finds every elo already equal to its elo_s0 and
 * modifies nothing.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { pathToFileURL } from 'url';
import User from '../models/User.js';

const DEFAULT_BATCH = 100000;
const DEFAULT_PAUSE_MS = 250;

function flagValue(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) return fallback;
  return v;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** _id ranges of `batchSize` users, ascending. Same rule as migrateRatingV2.js. */
async function* idBatches({ batchSize, limit }) {
  let lastId = null;
  let seen = 0;
  for (;;) {
    const take = limit ? Math.min(batchSize, limit - seen) : batchSize;
    if (take <= 0) return;
    const query = lastId ? { _id: { $gt: lastId } } : {};
    const docs = await User.find(query).select('_id').sort({ _id: 1 }).limit(take).lean();
    if (docs.length === 0) return;
    yield { first: docs[0]._id, last: docs[docs.length - 1]._id, count: docs.length };
    lastId = docs[docs.length - 1]._id;
    seen += docs.length;
  }
}

export async function run({
  apply = false,
  limit = null,
  batchSize = DEFAULT_BATCH,
  pauseMs = DEFAULT_PAUSE_MS,
} = {}) {
  const started = Date.now();
  const total = await User.countDocuments({});
  console.log(`[rollback] scope: ${limit ? `first ${limit} of ${total}` : `all ${total}`} users`);
  console.log(`[rollback] batch size ${batchSize}, pause ${pauseMs}ms\n`);

  // What the rollback will actually change, before touching anything.
  const preview = await User.find({
    elo_s0: { $ne: null },
    $expr: { $ne: ['$elo', '$elo_s0'] },
  }).select('_id username elo elo_s0').limit(10).lean();
  if (preview.length) {
    console.log('[rollback] sample of ratings that will be restored:');
    for (const u of preview) {
      console.log(`  ${(u.username || '(unnamed)').padEnd(18)} elo=${String(u.elo).padStart(6)} -> ${String(u.elo_s0).padStart(6)} (elo_s0)`);
    }
    console.log('');
  }

  let batches = 0;
  let snapshotted = 0;
  let differing = 0;
  let matched = 0;
  let modified = 0;

  for await (const range of idBatches({ batchSize, limit })) {
    batches++;
    const filter = { _id: { $gte: range.first, $lte: range.last }, elo_s0: { $ne: null } };

    const inBatchSnapshotted = await User.countDocuments(filter);
    snapshotted += inBatchSnapshotted;
    const inBatchDiffering = await User.countDocuments({
      ...filter,
      $expr: { $ne: ['$elo', '$elo_s0'] },
    });
    differing += inBatchDiffering;

    if (apply) {
      // Pipeline update: copy the snapshot field back onto elo, server-side.
      // No read-modify-write, so a game finishing mid-batch cannot interleave a
      // stale value.
      const res = await User.updateMany(filter, [{ $set: { elo: '$elo_s0' } }]);
      matched += res.matchedCount || 0;
      modified += res.modifiedCount || 0;
    }

    console.log(`[rollback] batch ${batches}: ${range.count} users in range, ` +
      `${inBatchSnapshotted} snapshotted, ${inBatchDiffering} differing` +
      `${apply ? `, ${modified} restored so far` : ''}`);
    if (pauseMs) await sleep(pauseMs);
  }

  const elapsed = Math.round((Date.now() - started) / 1000);
  console.log('\n============ ROLLBACK SUMMARY ============');
  console.log(`mode                 : ${apply ? 'APPLY' : 'DRY RUN (no writes)'}`);
  console.log(`users with a snapshot: ${snapshotted}`);
  console.log(`ratings differing    : ${differing}`);
  console.log(`docs matched         : ${apply ? matched : `${snapshotted} (would be)`}`);
  console.log(`docs modified        : ${apply ? modified : `${differing} (would be)`}`);
  console.log(`elapsed              : ${elapsed}s`);
  console.log('ratedGames           : left in place ON PURPOSE (see this file\'s header)');
  console.log('elo_s0               : NEVER deleted — retain at least 60 days');
  console.log('==========================================');
  if (!apply) {
    console.log('\nDRY RUN — nothing was written. Re-run with --apply to roll back.');
  } else {
    console.log('\nRollback applied. The v1 engine is deleted from the codebase — revert the v2 rating code from git history before ranked writes resume.');
  }

  return { apply, snapshotted, differing, matched, modified };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const limitRaw = flagValue('--limit', null);
  const limit = limitRaw === null ? null : Number(limitRaw);
  if (limitRaw !== null && (!Number.isInteger(limit) || limit <= 0)) {
    console.error(`--limit must be a positive integer (got "${limitRaw}")`);
    process.exit(1);
  }
  const batchSize = Number(flagValue('--batch', DEFAULT_BATCH));
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    console.error('--batch must be a positive integer');
    process.exit(1);
  }
  const pauseMs = Number(flagValue('--pause-ms', DEFAULT_PAUSE_MS));
  if (!Number.isFinite(pauseMs) || pauseMs < 0) {
    console.error('--pause-ms must be >= 0');
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB;
  if (!mongoUri) {
    console.error('MONGODB env variable not set');
    process.exit(1);
  }

  console.log(`Connecting to MongoDB...${apply ? ' (APPLY MODE — THIS RESTORES v1 RATINGS)' : ' (dry run — no writes)'}`);
  await mongoose.connect(mongoUri);
  console.log('Connected!\n');
  try {
    await run({ apply, limit, batchSize, pauseMs });
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
}
