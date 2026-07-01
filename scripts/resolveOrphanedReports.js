#!/usr/bin/env node
/**
 * Backfill: resolve orphaned reports left "open" by past account deletions.
 *
 * Before the deletion cascade learned to close out reports (serverUtils/purgeUserCascade.js),
 * deleting a reported user only anonymized the report (reportedUser.accountId -> null)
 * and left its status 'pending'/'reviewed'. Those orphans:
 *   - collapse into a single bogus "[Deleted User]" group in the /mod queue,
 *   - sort to the top (highest aggregate count), and
 *   - can never be cleared (takeAction rejects a null targetUserId).
 *
 * This one-off migration transitions every such orphan to action_taken/'user_deleted'
 * and credits the (still-existing) reporter, matching the new cascade behavior.
 * ELO is NOT refunded here: the underlying games were anonymized long ago and the
 * per-player loss data is gone — this only un-poisons the moderation queue.
 *
 * Idempotent: re-running finds nothing (already-resolved orphans no longer match).
 *
 * Run:  node scripts/resolveOrphanedReports.js [--dry-run] [--no-credit]
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { pathToFileURL } from 'url';
import Report from '../models/Report.js';
import User from '../models/User.js';

/**
 * Core resolution. Operates on the CURRENT mongoose connection (caller owns
 * connect/disconnect) so it's unit-testable against a scoped data set.
 *
 * @param {object}  [opts]
 * @param {boolean} [opts.dryRun]
 * @param {boolean} [opts.noCredit]
 * @param {object}  [opts.extraFilter] Extra query constraints (tests scope to seeded reports).
 * @returns {Promise<object>} summary
 */
export async function run({ dryRun = false, noCredit = false, extraFilter = {} } = {}) {
  const filter = {
    'reportedUser.accountId': null,
    status: { $in: ['pending', 'reviewed'] },
    ...extraFilter,
  };

  const orphans = await Report.find(filter).select('_id reportedBy.accountId').lean();

  if (orphans.length === 0) return { dryRun, found: 0, resolved: 0, credited: 0 };

  if (dryRun) {
    const crediting = noCredit ? 0 : orphans.filter((r) => r.reportedBy?.accountId).length;
    // `crediting` is an upper bound — a reporter who was themselves later deleted
    // no longer resolves, so the real run credits <= this.
    return { dryRun: true, found: orphans.length, resolved: 0, credited: crediting };
  }

  let resolved = 0;
  let credited = 0;
  for (const r of orphans) {
    const claimed = await Report.findOneAndUpdate(
      { _id: r._id, status: { $in: ['pending', 'reviewed'] } },
      {
        status: 'action_taken',
        actionTaken: 'user_deleted',
        reviewedBy: { accountId: 'system', username: 'backfill' },
        reviewedAt: new Date(),
        moderatorNotes: 'Reported user deleted their account (backfilled)',
      },
      { new: false },
    );
    if (!claimed) continue; // resolved by another run/mod between query and now
    resolved++;

    if (!noCredit && claimed.reportedBy?.accountId) {
      try {
        const res = await User.findByIdAndUpdate(claimed.reportedBy.accountId, {
          $inc: { 'reporterStats.helpfulReports': 1 },
        });
        if (res) credited++;
      } catch (e) {
        console.error('  credit failed for report', r._id.toString(), '-', e?.message || e);
      }
    }
  }

  return { dryRun: false, found: orphans.length, resolved, credited };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const noCredit = process.argv.includes('--no-credit');

  const mongoUri = process.env.MONGODB;
  if (!mongoUri) {
    console.error('MONGODB env variable not set');
    process.exit(1);
  }

  console.log(`Connecting to MongoDB...${dryRun ? ' (DRY RUN — no writes)' : ''}`);
  await mongoose.connect(mongoUri);
  console.log('Connected!\n');

  const r = await run({ dryRun, noCredit });
  if (r.found === 0) {
    console.log('Found 0 orphaned open report(s) against deleted users. Nothing to do.');
  } else if (r.dryRun) {
    console.log(`[DRY RUN] Would resolve ${r.found} report(s) and credit up to ${r.credited} reporter(s).`);
  } else {
    console.log(`\nDone. Resolved ${r.resolved} report(s); credited ${r.credited} reporter(s).`);
  }

  await mongoose.disconnect();
}

// Run main() only when invoked directly (node scripts/...), not when imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
}
