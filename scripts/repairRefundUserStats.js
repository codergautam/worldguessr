#!/usr/bin/env node
/**
 * Correct UserStats history left inflated by the pre-migration refund scale bug.
 *
 * DRY RUN BY DEFAULT. Nothing is written without --apply.
 *
 * WHY THIS EXISTS
 * ---------------
 * scripts/repairPreMigrationRefunds.js fixed the LIVE rating on 374 accounts
 * that were credited a Season 0 delta onto a v2 rating. It deliberately did not
 * touch history, which leaves those profiles with a correct current rating and a
 * graph that still climbs through the inflated values: the 'elo_refund' row
 * itself, and every 'game_completed' row written afterwards, because user.elo
 * was inflated while they played.
 *
 * THE CORRECTION IS CUMULATIVE PER EVENT, NOT A FLAT OFFSET
 * ---------------------------------------------------------
 * A user may have been refunded more than once. Their inflation grew in steps,
 * so subtracting the full debit from the first refund onward would over-correct
 * the rows in between. Instead the over-credit is grouped by the refund instant
 * (Game.eloRefundedAt) and each UserStats row has the CUMULATIVE over-credit of
 * every refund event at or before that row's timestamp subtracted from it.
 *
 * SCOPE IS A WINDOW, BOUNDED AT BOTH ENDS
 * ---------------------------------------
 *   lower bound: the user's first post-migration refund. Earlier rows are on the
 *                old scale or predate the inflation.
 *   upper bound: --repaired-at, the instant the LIVE rating was corrected.
 *
 * THE UPPER BOUND IS NOT OPTIONAL. Once the rating repair has run, every row
 * written after it already holds the corrected value, so debiting it again
 * double-corrects. The first production run of this script omitted the bound and
 * over-corrected 11 rows across 8 users who happened to play in the ~6 minutes
 * between the two repairs; they were restored, and the bound exists so a re-run
 * or a second batch cannot repeat it.
 *
 * IDEMPOTENT: the write pins the exact expected current value of each row, so a
 * second run matches nothing.
 *
 * REVERSIBLE: --apply writes an audit JSON; --undo <file> --apply restores.
 *
 * Usage:
 *   node scripts/repairRefundUserStats.js
 *   node scripts/repairRefundUserStats.js --apply
 *   node scripts/repairRefundUserStats.js --undo audit.json --apply
 *
 * Requires: MONGODB env var.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';
import Game from '../models/Game.js';
import User from '../models/User.js';
import UserStats from '../models/UserStats.js';
import { MIGRATION_AT } from '../components/utils/ratingFlags.js';
import { RATING_FLOOR } from '../components/utils/eloSystem.js';
import { convertDelta } from '../components/utils/ratingConversion.js';
import { getConversionTable } from '../serverUtils/conversionTable.js';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const str = (f) => { const i = argv.indexOf(f); return i === -1 ? null : argv[i + 1]; };
const APPLY = has('--apply');
const UNDO_FILE = str('--undo');
const CHUNK = 1000;

// Instant the LIVE ratings were corrected by scripts/repairPreMigrationRefunds.js.
// Rows at or after this already hold the corrected value — see the header.
const REPAIRED_AT_RAW = str('--repaired-at');
const REPAIRED_AT = REPAIRED_AT_RAW ? new Date(REPAIRED_AT_RAW) : null;
if (REPAIRED_AT_RAW && Number.isNaN(REPAIRED_AT.getTime())) {
  throw new Error(`--repaired-at is not a valid date: ${REPAIRED_AT_RAW}`);
}

async function undo(file) {
  const audit = JSON.parse(await fs.readFile(file, 'utf8'));
  console.log(`[undo] ${audit.rows.length} UserStats rows from ${file}`);
  if (!APPLY) { console.log('[undo] DRY RUN. Re-run with --apply.'); return; }
  const ops = audit.rows.map((r) => ({
    updateOne: { filter: { _id: new mongoose.Types.ObjectId(r._id), elo: r.after }, update: { $set: { elo: r.before } } },
  }));
  let n = 0;
  for (let i = 0; i < ops.length; i += CHUNK) n += (await UserStats.bulkWrite(ops.slice(i, i + CHUNK), { ordered: false })).modifiedCount ?? 0;
  console.log(`[undo] restored ${n} of ${audit.rows.length}`);
}

async function main() {
  if (!process.env.MONGODB) throw new Error('MONGODB env var is not set');
  await mongoose.connect(process.env.MONGODB);
  if (UNDO_FILE) { await undo(UNDO_FILE); return; }

  const table = getConversionTable();
  if (!table) throw new Error('conversion table unavailable');

  console.log(`=== refund UserStats history repair ===\nmode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

  // Every game the rating repair accounted for. Includes already-stamped ones:
  // this script corrects HISTORY, which that stamp says nothing about.
  const games = await Game.find(
    { gameType: { $in: ['ranked_duel', '2v2'] }, eloRefunded: true },
    { createdAt: 1, eloRefundedAt: 1, 'players.accountId': 1, 'players.elo': 1 }
  ).lean();
  const broken = games.filter((g) => g.eloRefundedAt && g.eloRefundedAt >= MIGRATION_AT && g.createdAt < MIGRATION_AT);

  const ids = [...new Set(broken.flatMap((g) => (g.players || []).map((p) => p.accountId).filter(Boolean)))];
  const users = await User.find({ _id: { $in: ids } }, { username: 1, banned: 1 }).lean();
  const uMap = new Map(users.map((u) => [String(u._id), u]));
  const trail = new Set((await UserStats.aggregate([
    { $match: { triggerEvent: 'elo_refund', timestamp: { $gte: MIGRATION_AT } } },
    { $group: { _id: '$userId' } },
  ])).map((x) => String(x._id)));

  // per user -> [{ at, over }] one entry per refund event. SAME gates as the
  // rating repair, so exactly the same population is corrected.
  const events = new Map();
  for (const g of broken) {
    for (const p of (g.players || [])) {
      if (!p.accountId) continue;
      const key = String(p.accountId);
      const u = uMap.get(key);
      if (!u || u.banned || !trail.has(key)) continue;
      const ch = p.elo && typeof p.elo.change === 'number' ? p.elo.change : null;
      if (ch === null || ch >= 0) continue;
      const after = typeof p.elo.after === 'number' ? p.elo.after : (typeof p.elo.before === 'number' ? p.elo.before + ch : null);
      if (after === null) continue;
      const over = Math.abs(ch) - Math.abs(convertDelta(after, ch, table));
      if (over <= 0) continue;
      const at = +g.eloRefundedAt;
      const list = events.get(key) || new Map();
      list.set(at, (list.get(at) || 0) + over);
      events.set(key, list);
    }
  }
  console.log(`users in scope: ${events.size}`);
  const multi = [...events.values()].filter((m) => m.size > 1).length;
  console.log(`users with more than one refund event (cumulative handling): ${multi}`);

  const rows = [];
  for (const [uid, evMap] of events) {
    const evs = [...evMap.entries()].map(([at, over]) => ({ at, over })).sort((a, b) => a.at - b.at);
    const first = evs[0].at;
    const window = { $gte: new Date(first) };
    if (REPAIRED_AT) window.$lt = REPAIRED_AT;
    // refundScaleCorrected excluded here is what makes a re-run a no-op.
    const stats = await UserStats.find(
      { userId: uid, timestamp: window, refundScaleCorrected: { $ne: true } },
      { elo: 1, timestamp: 1, triggerEvent: 1 }
    ).lean();
    for (const s of stats) {
      // cumulative over-credit in force at this row's timestamp
      let cum = 0;
      for (const e of evs) { if (+s.timestamp >= e.at) cum += e.over; }
      const debit = Math.round(cum);
      if (debit <= 0) continue;
      const before = Math.round(s.elo);
      const after = Math.max(RATING_FLOOR, before - debit);
      if (after === before) continue;
      rows.push({ _id: String(s._id), userId: uid, before, after, triggerEvent: s.triggerEvent });
    }
  }
  console.log(`UserStats rows to correct: ${rows.length}`);
  if (rows.length === 0) { console.log('nothing to do.'); return; }
  const byUser = {};
  for (const r of rows) byUser[r.userId] = (byUser[r.userId] || 0) + 1;
  const worst = Object.entries(byUser).sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log('\nmost rows per user:');
  for (const [uid, n] of worst) console.log(`  ${(uMap.get(uid)?.username || uid).padEnd(20)} ${n} rows`);
  console.log('\nsample corrections:');
  for (const r of rows.slice(0, 8)) console.log(`  ${(uMap.get(r.userId)?.username || r.userId).padEnd(20)} ${r.triggerEvent.padEnd(15)} ${r.before} -> ${r.after}`);

  if (!APPLY) { console.log('\nDRY RUN COMPLETE.'); return; }

  const ranAt = new Date().toISOString();
  const auditPath = path.resolve(process.cwd(), `refund-userstats-audit-${ranAt.replace(/[:.]/g, '-')}.json`);
  await fs.writeFile(auditPath, JSON.stringify({ ranAt, rows }, null, 2));
  console.log(`\naudit written: ${auditPath}`);

  // Value pin (race safety) AND the marker (re-run safety) set in one write, so
  // a row can never end up corrected but unmarked.
  const ops = rows.map((r) => ({
    updateOne: {
      filter: { _id: new mongoose.Types.ObjectId(r._id), elo: r.before },
      update: { $set: { elo: r.after, refundScaleCorrected: true } },
    },
  }));
  let n = 0;
  for (let i = 0; i < ops.length; i += CHUNK) n += (await UserStats.bulkWrite(ops.slice(i, i + CHUNK), { ordered: false })).modifiedCount ?? 0;
  console.log(`modified: ${n} of ${rows.length}`);
  console.log(`undo with: node scripts/repairRefundUserStats.js --undo ${path.basename(auditPath)} --apply`);
}

main()
  .catch((e) => { console.error('\nFAILED:', e.message); process.exitCode = 1; })
  .finally(async () => { await mongoose.disconnect().catch(() => {}); });
