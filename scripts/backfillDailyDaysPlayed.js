// One-shot backfill: set User.dailyDaysPlayed to the EXACT lifetime count of
// daily challenges played, from DailyChallengeScore — which has no TTL, one
// row per locked (date, userId) forever, DQ markers included (a DQ advances
// the streak like a played day, so it counts here too; same rule as the
// /submit counter).
//
// The deployed fix only seeds legacy users at a provable LOWER BOUND
// (max(30-entry window, streaks)) on their next submit. This recovers the
// true historical number for everyone at once. Days played as a GUEST before
// claiming an account are not in DailyChallengeScore (GuestScore TTLs at 30
// days) and stay unrecoverable — the count can only be exact for logged-in
// play.
//
// Usage (from project root):
//   node scripts/backfillDailyDaysPlayed.js
//
// Idempotent — writes are $max, so re-running never lowers anything, and a
// user who submits mid-run keeps whichever count is higher (the live counter
// includes today; the aggregation snapshot may or may not).
//
// Run AFTER the /submit counter deploy (any submit between snapshot and
// write is covered by the $max; a submit after the write increments on top).

import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';
import DailyChallengeScore from '../models/DailyChallengeScore.js';

if (!process.env.MONGODB) {
  console.error('MONGODB env var not set');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB);
console.log('[backfill] connected');

// Exact per-user played-date counts. Grouped server-side; the {userId:1}
// index keeps this an index scan. Distinct dates per user are guaranteed by
// the unique (date, userId) index, so a plain count IS the day count.
const start = Date.now();
const counts = await DailyChallengeScore.aggregate([
  { $group: { _id: '$userId', days: { $sum: 1 } } },
]);
console.log(`[backfill] ${counts.length} users with daily rows (${Date.now() - start}ms)`);

let modified = 0;
const BATCH = 1000;
for (let i = 0; i < counts.length; i += BATCH) {
  const ops = counts.slice(i, i + BATCH)
    .filter((c) => c._id != null)
    .map((c) => ({
      updateOne: {
        filter: { _id: c._id },
        // $max: never lower an already-correct live counter.
        update: { $max: { dailyDaysPlayed: c.days } },
      },
    }));
  if (ops.length === 0) continue;
  const res = await User.bulkWrite(ops, { ordered: false });
  modified += res.modifiedCount || 0;
  console.log(`[backfill] ${Math.min(i + BATCH, counts.length)}/${counts.length} processed, ${modified} modified`);
}

console.log(`[backfill] done: ${modified} users updated in ${Date.now() - start}ms`);
await mongoose.disconnect();
process.exit(0);
