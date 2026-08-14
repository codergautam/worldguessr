#!/usr/bin/env node
/**
 * ONE-TIME repair for ELO refunds that credited a Season 0 delta onto a v2 rating.
 *
 * DRY RUN BY DEFAULT. Nothing is written without --apply.
 *
 * THE BUG THIS CLEANS UP
 * ----------------------
 * serverUtils/eloRefunds.js credited `Math.abs(player.elo.change)` straight onto
 * `user.elo`. `elo.change` is on whatever scale the GAME was played on, so for a
 * game played before MIGRATION_AT that is a Season 0 delta (0..20,000 scale)
 * being added to a v2 rating (100..1600). The error grows with rating because
 * the conversion compresses hardest at the top: a 60-point drop at Season 0
 * 15,000 is worth about 2 v2 points and was credited as 60.
 *
 * The live path is fixed (it now re-derives via convertDelta). This script
 * corrects the credits already applied between MIGRATION_AT and that fix.
 *
 * HOW THE DEBIT IS DERIVED
 * ------------------------
 * For every game with createdAt < MIGRATION_AT and eloRefundedAt >= MIGRATION_AT,
 * for every player leg that was actually credited:
 *
 *     overCredit = |change| - |f(after) - f(after - change)|
 *
 * summed per user, then subtracted. f is the SAME frozen table the migration and
 * the live refund path use (serverUtils/conversionTable.js), so the repair and
 * the fix agree by construction rather than by luck.
 *
 * TWO SAFETY GATES, BOTH REQUIRED, BOTH FAIL CLOSED
 * -------------------------------------------------
 *   1. THE OFFENDER IS EXCLUDED. processRefundGames() skips the banned account
 *      (`if (player.accountId === bannedAccountId) continue`), so a banned
 *      player's own losing leg was never credited. Debiting it would take away
 *      rating they never received. We cannot read bannedAccountId off the game,
 *      so we exclude any player currently flagged `banned`.
 *
 *   2. AN elo_refund TRAIL MUST EXIST. The live path writes a UserStats row with
 *      triggerEvent 'elo_refund' for every opponent it credits. A user without
 *      one post-MIGRATION_AT was demonstrably not credited, so they are skipped.
 *      At the time of writing this gate excluded 0 of 376 users — it is a
 *      backstop, not a filter that is expected to bite.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 *   No UserStats row is written for the correction. The refund already produced
 *   an 'elo_refund' point on the profile graph; adding a second synthetic point
 *   would render as a real in-game loss. The audit file is the record.
 *
 *   No attempt is made to claw back rating that has since moved. Some of the
 *   over-credit has already transferred to other players through normal
 *   zero-sum play. This corrects the holder's rating, not the whole diffusion,
 *   which is not recoverable and not worth chasing at this magnitude.
 *
 * IDEMPOTENCY IS ENFORCED BY A FLAG ON THE GAME, NOT BY THE RATING
 * ----------------------------------------------------------------
 * `refundScaleRepaired: true` is stamped on every game this script accounts for,
 * and already-stamped games are excluded from the next run.
 *
 * It has to work this way. Pinning the write to the user's expected current
 * rating (which is what this script did on its first version) prevents a RACE
 * but NOT a re-run: the debit is recomputed from the games, which never change,
 * so a second --apply reads the already-debited rating as "before" and happily
 * subtracts the same amount again. That bug was caught after the first
 * production run — the run itself was correct, a second one would not have been.
 *
 * The rating pin is KEPT as well, so a user who plays between the read and the
 * write is skipped rather than debited off a stale value.
 *
 * REVERSIBLE: --apply writes an audit JSON with each user's before/after, and
 * --undo <file> restores it.
 *
 * Usage (from project root):
 *   node scripts/repairPreMigrationRefunds.js               dry run
 *   node scripts/repairPreMigrationRefunds.js --apply
 *   node scripts/repairPreMigrationRefunds.js --undo audit-xxx.json --apply
 *
 * Flags:
 *   --apply        Write. Without it, nothing is modified.
 *   --max N        Abort if more than N users match. Default 2000.
 *   --undo <file>  Restore prior ratings from an audit file and exit.
 *
 * Requires: MONGODB env var (dotenv/.env is loaded).
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';
import User from '../models/User.js';
import Game from '../models/Game.js';
import UserStats from '../models/UserStats.js';
import { MIGRATION_AT } from '../components/utils/ratingFlags.js';
import { RATING_FLOOR } from '../components/utils/eloSystem.js';
import { convertDelta } from '../components/utils/ratingConversion.js';
import { getConversionTable } from '../serverUtils/conversionTable.js';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const str = (f) => { const i = argv.indexOf(f); return i === -1 ? null : argv[i + 1]; };
const num = (f, d) => { const i = argv.indexOf(f); return i === -1 ? d : Number(argv[i + 1]); };

const APPLY = has('--apply');
const MAX = num('--max', 2000);
const UNDO_FILE = str('--undo');
const WRITE_CHUNK = 500;

async function undo(file) {
  const audit = JSON.parse(await fs.readFile(file, 'utf8'));
  console.log(`[undo] ${audit.changes.length} users from ${file} (run at ${audit.ranAt})`);
  if (!APPLY) {
    for (const ch of audit.changes.slice(0, 10)) console.log(`  ${ch.username ?? ch._id}: ${ch.after} -> ${ch.before}`);
    console.log('[undo] DRY RUN. Re-run with --apply to restore.');
    return;
  }
  const ops = audit.changes.map((ch) => ({
    updateOne: { filter: { _id: new mongoose.Types.ObjectId(ch._id), elo: ch.after }, update: { $set: { elo: ch.before } } },
  }));
  let restored = 0;
  for (let i = 0; i < ops.length; i += WRITE_CHUNK) {
    const res = await User.bulkWrite(ops.slice(i, i + WRITE_CHUNK), { ordered: false });
    restored += res.modifiedCount ?? 0;
  }
  console.log(`[undo] restored ${restored}, skipped ${audit.changes.length - restored} (rating moved since)`);
}

async function main() {
  const uri = process.env.MONGODB;
  if (!uri) throw new Error('MONGODB env var is not set');
  await mongoose.connect(uri);

  if (UNDO_FILE) { await undo(UNDO_FILE); return; }

  const table = getConversionTable();
  if (!table) throw new Error('conversion table unavailable — cannot compute corrections');

  console.log('=== pre-migration refund scale repair ===');
  console.log(`mode: ${APPLY ? 'APPLY (writes)' : 'DRY RUN (no writes)'}`);
  console.log(`migration instant: ${MIGRATION_AT.toISOString()}\n`);

  // refundScaleRepaired excluded here is what makes a re-run a no-op.
  const games = await Game.find(
    { gameType: { $in: ['ranked_duel', '2v2'] }, eloRefunded: true, refundScaleRepaired: { $ne: true } },
    { createdAt: 1, eloRefundedAt: 1, 'players.accountId': 1, 'players.elo': 1 }
  ).lean();
  const broken = games.filter((g) => g.eloRefundedAt && g.eloRefundedAt >= MIGRATION_AT && g.createdAt < MIGRATION_AT);
  console.log(`refunded games not yet repaired: ${games.length}, of those PLAYED pre-migration: ${broken.length}`);

  const ids = [...new Set(broken.flatMap((g) => (g.players || []).map((p) => p.accountId).filter(Boolean)))];
  const users = await User.find({ _id: { $in: ids } }, { username: 1, elo: 1, banned: 1 }).lean();
  const uMap = new Map(users.map((u) => [String(u._id), u]));

  // GATE 2 data: who actually has an elo_refund trail after the migration.
  const trail = new Set((await UserStats.aggregate([
    { $match: { triggerEvent: 'elo_refund', timestamp: { $gte: MIGRATION_AT } } },
    { $group: { _id: '$userId' } },
  ])).map((x) => String(x._id)));

  const per = new Map();
  let skippedBanned = 0, skippedNoTrail = 0;
  for (const g of broken) {
    for (const p of (g.players || [])) {
      if (!p.accountId) continue;
      const key = String(p.accountId);
      const u = uMap.get(key);
      if (!u) continue;
      if (u.banned) { skippedBanned++; continue; }              // GATE 1
      if (!trail.has(key)) { skippedNoTrail++; continue; }      // GATE 2

      const ch = p.elo && typeof p.elo.change === 'number' ? p.elo.change : null;
      if (ch === null || ch >= 0) continue;
      const after = typeof p.elo.after === 'number'
        ? p.elo.after
        : (typeof p.elo.before === 'number' ? p.elo.before + ch : null);
      if (after === null) continue;

      const raw = Math.abs(ch);
      const correct = Math.abs(convertDelta(after, ch, table));
      const over = raw - correct;
      if (over <= 0) continue;

      const e = per.get(key) || { raw: 0, correct: 0, over: 0, legs: 0 };
      e.raw += raw; e.correct += correct; e.over += over; e.legs++;
      per.set(key, e);
    }
  }

  console.log(`legs skipped — banned offender: ${skippedBanned}, no elo_refund trail: ${skippedNoTrail}`);
  console.log(`users to repair: ${per.size}`);
  if (per.size === 0) { console.log('nothing to do.'); return; }
  if (per.size > MAX) throw new Error(`SAFETY ABORT: ${per.size} users matched, over --max ${MAX}`);

  const changes = [];
  for (const [id, e] of per) {
    const u = uMap.get(id);
    const before = Math.round(u.elo);
    const after = Math.max(RATING_FLOOR, before - Math.round(e.over));
    if (after === before) continue;
    changes.push({ _id: id, username: u.username ?? null, before, after, debit: before - after, ...e });
  }
  const totalRaw = [...per.values()].reduce((a, e) => a + e.raw, 0);
  const totalCorrect = [...per.values()].reduce((a, e) => a + e.correct, 0);
  const totalDebit = changes.reduce((a, ch) => a + ch.debit, 0);
  console.log(`\nraw credited ${totalRaw}, correct ${totalCorrect}, over-credit ${totalRaw - totalCorrect}`);
  console.log(`users actually changing: ${changes.length}, total debit: ${totalDebit}`);

  console.log('\nlargest 15 debits:');
  for (const ch of [...changes].sort((a, b) => b.debit - a.debit).slice(0, 15)) {
    console.log(`  ${(ch.username || ch._id).padEnd(20)} legs ${String(ch.legs).padStart(2)}  raw +${String(ch.raw).padStart(4)} correct +${String(ch.correct).padStart(3)}  elo ${ch.before} -> ${ch.after} (-${ch.debit})`);
  }

  if (!APPLY) { console.log('\nDRY RUN COMPLETE. No documents were modified.'); return; }

  const ranAt = new Date().toISOString();
  const auditPath = path.resolve(process.cwd(), `refund-scale-repair-audit-${ranAt.replace(/[:.]/g, '-')}.json`);
  await fs.writeFile(auditPath, JSON.stringify({ ranAt, migrationAt: MIGRATION_AT, totalDebit, changes }, null, 2));
  console.log(`\naudit written: ${auditPath}`);

  // Filter pins the exact expected rating: idempotent, and a user who played
  // between the read and the write is skipped rather than debited off a stale value.
  const ops = changes.map((ch) => ({
    updateOne: { filter: { _id: new mongoose.Types.ObjectId(ch._id), elo: ch.before }, update: { $set: { elo: ch.after } } },
  }));
  let modified = 0;
  for (let i = 0; i < ops.length; i += WRITE_CHUNK) {
    const res = await User.bulkWrite(ops.slice(i, i + WRITE_CHUNK), { ordered: false });
    modified += res.modifiedCount ?? 0;
  }

  // Stamp the games LAST: if the ratings write dies part-way, the games stay
  // unstamped and a re-run recomputes from scratch. Stamping first would strand
  // the un-debited remainder as permanently invisible.
  const stamped = await Game.updateMany(
    { _id: { $in: broken.map((g) => g._id) } },
    { $set: { refundScaleRepaired: true, refundScaleRepairedAt: new Date() } }
  );
  console.log(`games stamped refundScaleRepaired: ${stamped.modifiedCount}`);

  console.log(`\nmodified: ${modified} of ${changes.length}`);
  if (modified !== changes.length) console.log(`skipped ${changes.length - modified} (rating changed between read and write; re-run to catch them)`);
  console.log(`undo with: node scripts/repairPreMigrationRefunds.js --undo ${path.basename(auditPath)} --apply`);
}

main()
  .catch((e) => { console.error('\nFAILED:', e.message); process.exitCode = 1; })
  .finally(async () => { await mongoose.disconnect().catch(() => {}); });
