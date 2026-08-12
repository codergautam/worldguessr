#!/usr/bin/env node
/**
 * Removes the cut Season 1 XP grant from ONE account, on the dev database.
 *
 * DRY RUN BY DEFAULT. Nothing is written without --apply.
 *
 * WHY THIS IS SCOPED TO ONE ACCOUNT
 * ---------------------------------
 *   The XP grant was cut before it ever ran in production, but it HAD already
 *   been applied on dev. A full 50k-account reversal was deliberately not worth
 *   the risk, so dev keeps its inflated numbers in general. This exists for the
 *   handful of accounts you actually look at while testing.
 *
 * THE PART THAT IS EASY TO GET WRONG
 * ----------------------------------
 *   `UserStats.totalXp` is an ABSOLUTE SNAPSHOT, not a delta
 *   (components/utils/userStatsService.js:33 writes `totalXp: user.totalXp`).
 *   So EVERY history row written after the grant carries the granted XP inside
 *   it. Fixing `User.totalXp` and deleting the marker is NOT enough: the graph
 *   plots UserStats rows, so the cliff would simply reappear at the first
 *   post-grant game instead of at the marker.
 *
 *   The fix therefore shifts the whole tail:
 *     1. granted = marker.totalXp - (newest row strictly BEFORE the marker).totalXp
 *     2. subtract `granted` from every row at or after the marker
 *     3. subtract `granted` from User.totalXp
 *     4. delete the marker row
 *
 *   Step 2 is what makes the curve continuous. After it, the marker row holds
 *   exactly the prior row's total, and deleting it closes the seam with no step
 *   at all. Consecutive differences elsewhere are untouched, because shifting a
 *   whole tail by a constant does not change any gap inside it.
 *
 * WHAT IT DOES NOT TOUCH
 * ----------------------
 *   Stamps and `ogAccount`. Those grants are being KEPT.
 *
 *   `xpRank` on the shifted rows is left stale. It is a global sort that was
 *   already meaningless on a dev box where 50,202 of 50,217 accounts never
 *   played, and rewriting history ranks for one account would make it no more
 *   truthful. The XP graph's rank mode will look odd; the XP mode, which is the
 *   one being fixed here, will be right.
 *
 * SUBTRACTION IS CLAMPED
 * ----------------------
 *   Both totals are `min: 0` in their schemas, so every write is a pipeline
 *   update with $max rather than a $inc. A bad number fails to a floor of 0
 *   instead of writing a negative balance nothing downstream expects.
 *
 * NOT IDEMPOTENT. Re-running after a successful --apply is safe only because
 * the marker is gone and the script then reports "no grant found" and exits. If
 * it dies PART WAY through an --apply, do not just re-run it: read the output,
 * see which of the three writes landed, and finish by hand.
 *
 * Usage (from project root):
 *   node scripts/fixSeason1Xp.js --username codergautam            (dry run)
 *   node scripts/fixSeason1Xp.js --username codergautam --apply    (the fix)
 *   node scripts/fixSeason1Xp.js --id 64f...abc --apply            (by account id)
 *
 * Flags:
 *   --username NAME   Account to fix. Exact match first, then case-insensitive.
 *   --id OBJECTID     Account to fix, by _id. Use instead of --username.
 *   --apply           Required to write. Default is a dry run.
 *   --amount N        Override the computed grant. ONLY for an account with no
 *                     history before the marker, where the diff cannot be taken.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { pathToFileURL } from 'url';
import User from '../models/User.js';
import UserStats from '../models/UserStats.js';

const TRIGGER_EVENT = 'season1_grant';

function flagValue(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) return fallback;
  return v;
}

const n = (v) => Number(v || 0).toLocaleString('en-US');

/** Escape a string for use inside a RegExp. */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function resolveUser({ username, id }) {
  if (id) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error(`--id "${id}" is not a valid ObjectId.`);
    const u = await User.findById(id).select('_id username totalXp').lean();
    if (!u) throw new Error(`No account with _id ${id}.`);
    return u;
  }
  let u = await User.findOne({ username }).select('_id username totalXp').lean();
  if (!u) {
    u = await User.findOne({ username: new RegExp(`^${escapeRe(username)}$`, 'i') })
      .select('_id username totalXp')
      .lean();
  }
  if (!u) throw new Error(`No account named "${username}".`);
  return u;
}

export async function run({ username = null, id = null, apply = false, amount = null } = {}) {
  const user = await resolveUser({ username, id });
  const uid = String(user._id);
  console.log(`[fix-s1-xp] account: ${user.username || '(unnamed)'}  ${uid}`);
  console.log(`[fix-s1-xp] User.totalXp now: ${n(user.totalXp)}\n`);

  const markers = await UserStats.find({ userId: uid, triggerEvent: TRIGGER_EVENT })
    .sort({ timestamp: -1 })
    .lean();

  if (markers.length === 0) {
    console.log('[fix-s1-xp] No season1_grant marker on this account. Nothing to undo.');
    console.log('[fix-s1-xp] (Either it was never granted, or this has already been run.)');
    return { changed: false };
  }
  if (markers.length > 1) {
    console.log(`[fix-s1-xp] WARNING: ${markers.length} markers found. Using the newest; re-run for the rest.`);
  }
  const marker = markers[0];

  // The pre-grant balance. Must be read BEFORE anything is written.
  const prior = await UserStats.findOne({
    userId: uid,
    triggerEvent: { $ne: TRIGGER_EVENT },
    timestamp: { $lt: marker.timestamp },
  })
    .sort({ timestamp: -1 })
    .select('timestamp totalXp')
    .lean();

  let granted;
  if (amount !== null) {
    granted = amount;
    console.log(`[fix-s1-xp] grant amount: ${n(granted)}  (FROM --amount, overriding the diff)`);
  } else if (prior) {
    granted = Math.round(marker.totalXp - prior.totalXp);
    console.log(`[fix-s1-xp] marker  ${new Date(marker.timestamp).toISOString()}  totalXp ${n(marker.totalXp)}`);
    console.log(`[fix-s1-xp] prior   ${new Date(prior.timestamp).toISOString()}  totalXp ${n(prior.totalXp)}`);
    console.log(`[fix-s1-xp] grant amount: ${n(granted)}  (marker minus prior — exact)`);
  } else {
    throw new Error(
      'This account has no UserStats history before the marker, so the grant cannot be\n' +
      'derived by difference. Pass --amount N with the figure to remove.'
    );
  }

  if (!Number.isFinite(granted) || granted < 0) {
    throw new Error(`Computed grant is ${granted}. Refusing to run: this would ADD XP, not remove it.`);
  }
  if (granted === 0) {
    console.log('\n[fix-s1-xp] Grant resolves to 0 XP. Only the marker row needs removing.');
  }

  // Every row the marker's XP is baked into: the marker itself and everything after.
  const tail = await UserStats.find({ userId: uid, timestamp: { $gte: marker.timestamp } })
    .sort({ timestamp: 1 })
    .select('timestamp totalXp triggerEvent')
    .lean();

  console.log(`\n[fix-s1-xp] rows at or after the marker: ${tail.length}  (all shifted down by ${n(granted)})`);
  console.log('[fix-s1-xp] preview of the XP curve across the seam:');
  if (prior) {
    console.log(`    ${new Date(prior.timestamp).toISOString()}  ${String(n(prior.totalXp)).padStart(12)}  (unchanged, before the grant)`);
  }
  for (const row of tail.slice(0, 6)) {
    const after = Math.max(0, row.totalXp - granted);
    const tag = row.triggerEvent === TRIGGER_EVENT ? '  <- MARKER, will be DELETED' : '';
    console.log(`    ${new Date(row.timestamp).toISOString()}  ${String(n(row.totalXp)).padStart(12)} -> ${String(n(after)).padStart(12)}${tag}`);
  }
  if (tail.length > 6) console.log(`    ... and ${tail.length - 6} more rows`);

  console.log(`\n[fix-s1-xp] User.totalXp: ${n(user.totalXp)} -> ${n(Math.max(0, (user.totalXp || 0) - granted))}`);

  if (!apply) {
    console.log('\nDRY RUN — nothing was written. Re-run with --apply to fix it.');
    return { changed: false, granted, rows: tail.length };
  }

  // 1. Shift the tail. This is the step that actually flattens the graph.
  const shifted = await UserStats.updateMany(
    { userId: uid, timestamp: { $gte: marker.timestamp } },
    [{ $set: { totalXp: { $max: [0, { $subtract: [{ $ifNull: ['$totalXp', 0] }, granted] }] } } }],
  );
  console.log(`\n[fix-s1-xp] history rows updated : ${shifted.modifiedCount}`);

  // 2. The live balance.
  await User.updateOne(
    { _id: user._id },
    [{ $set: { totalXp: { $max: [0, { $subtract: [{ $ifNull: ['$totalXp', 0] }, granted] }] } } }],
  );

  // 3. The marker last: while it exists, a re-run can still recompute the same
  //    amount, so a crash before this point is recoverable by inspection.
  const del = await UserStats.deleteMany({ userId: uid, triggerEvent: TRIGGER_EVENT });
  console.log(`[fix-s1-xp] markers deleted      : ${del.deletedCount}`);

  const after = await User.findById(user._id).select('totalXp').lean();
  console.log(`[fix-s1-xp] User.totalXp is now  : ${n(after?.totalXp)}`);

  // Prove the seam actually closed rather than trusting the arithmetic.
  const check = await UserStats.find({ userId: uid })
    .sort({ timestamp: 1 })
    .select('timestamp totalXp')
    .lean();
  let biggest = { gain: 0, at: null };
  for (let i = 1; i < check.length; i++) {
    const gain = (check[i].totalXp || 0) - (check[i - 1].totalXp || 0);
    if (gain > biggest.gain) biggest = { gain, at: check[i].timestamp };
  }
  console.log(`[fix-s1-xp] largest single XP step left: ${n(biggest.gain)}` +
    `${biggest.at ? ' at ' + new Date(biggest.at).toISOString() : ''}`);
  if (biggest.gain > 100000) {
    console.log('[fix-s1-xp] WARNING: that is still cliff-sized. Check this account by hand.');
  } else {
    console.log('[fix-s1-xp] Curve looks continuous. Reload the profile and check the XP graph.');
  }

  return { changed: true, granted, rows: shifted.modifiedCount };
}

async function main() {
  const username = flagValue('--username', null);
  const id = flagValue('--id', null);
  if (!username && !id) {
    console.error('Pass --username NAME or --id OBJECTID.');
    process.exit(1);
  }
  const amountRaw = flagValue('--amount', null);
  const amount = amountRaw === null ? null : Number(amountRaw);
  if (amountRaw !== null && (!Number.isFinite(amount) || amount < 0)) {
    console.error('--amount must be a non-negative number');
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB;
  if (!mongoUri) {
    console.error('MONGODB env variable not set');
    process.exit(1);
  }

  const apply = process.argv.includes('--apply');
  console.log(`Connecting to MongoDB...${apply ? ' (APPLY MODE — THIS WRITES)' : ' (dry run — no writes)'}`);
  await mongoose.connect(mongoUri);
  console.log('Connected!\n');
  try {
    await run({ username, id, apply, amount });
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('\nSEASON 1 XP FIX ABORTED\n');
    console.error(err.message || err);
    process.exit(1);
  });
}
