#!/usr/bin/env node
/**
 * Post-migration gates for Rating v2. READ-ONLY: this script never writes to
 * MongoDB under any flag. It exits NON-ZERO if any gate fails, so it can sit in
 * the migration runbook as a hard stop before ranked play is re-enabled.
 *
 * Run it immediately after scripts/migrateRatingV2.js --apply, with ranked
 * writes still disabled. Every gate below has a specific failure mode behind it:
 *
 *   1  COVERAGE       every user has elo_s0, seasonPeakElo and seasonPeakLeague.
 *                     A short count means a batch died mid-run.
 *   2  SNAPSHOT       zero null elo_s0. A null is a user with no rollback anchor.
 *   3  BOUNDS         zero ratings outside [100, 1600]. Out of bounds means the
 *                     conversion table was applied without the clamp.
 *   4  ORDER          sample random pairs and assert ZERO inversions between the
 *                     elo_s0 ordering and the new elo ordering. The conversion
 *                     must be monotone: if it is not, two players swapped
 *                     relative rank overnight without playing a game.
 *   5a PLACEMENT-A    zero users with ratedGames 0 who have career W/L/T > 0.
 *                     Each one is a veteran who is placement-eligible and whose
 *                     migrated rating gets bulldozed by a 500-800 seed on their
 *                     next queue.
 *   5b PLACEMENT-B    zero users with ratedGames > 70. The backfill caps at 70;
 *                     anything above means something other than the backfill
 *                     wrote the field.
 *   5c PLACEMENT-C    the top 100 by elo_s0 all sit at exactly 70. The most
 *                     valuable accounts on the ladder, spot-checked by hand.
 *   6  PEAK           zero users with seasonPeakElo < elo_s0. Impossible by
 *                     construction (the migration stamps max(peak, elo_s0)), so
 *                     a hit means the peak-table lookup silently missed and fell
 *                     back to 0 — i.e. the whole peak file keyed on the wrong id
 *                     format and EVERY badge is wrong.
 *   7  LEAGUES        Season 0 peak-league populations within 1% of expected.
 *
 * Usage (from project root):
 *   node scripts/verifyMigration.js
 *   node scripts/verifyMigration.js --limit 1000        (same scope as migrate --limit 1000)
 *   node scripts/verifyMigration.js --expected data/expected-leagues.json
 *
 * Flags:
 *   --limit N        Verify only the first N users by _id ascending. Scopes
 *                    identically to migrateRatingV2.js --limit N.
 *   --pairs N        Random pairs for the order gate. Default 200000.
 *   --sample N       Users drawn for the pair pool. Default 20000.
 *   --expected <p>   JSON of expected Season 0 peak-league populations, either
 *                    counts { "Nomad": 812, ... } or shares { "Nomad": 0.013, ... }.
 *                    Overrides EXPECTED_PEAK_LEAGUES below.
 *   --tolerance N    League tolerance as a fraction. Default 0.01 (1%).
 *   --strict         Treat a SKIPPED gate (e.g. no expected league table) as a
 *                    failure. Recommended for the real migration runbook.
 *   --apply          Accepted and ignored. This script has nothing to apply.
 *
 * Requires: MONGODB env var (dotenv/.env is loaded).
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import User from '../models/User.js';
import { RATING_FLOOR } from '../components/utils/eloSystem.js';

const RATING_CEIL = 1600;
const RATED_GAMES_CAP = 70; // must match backfillRatedGames' cap
const TOP_N = 100;

/**
 * Expected Season 0 peak-league populations. Fill this in from the pre-migration
 * distribution (or pass --expected <file>), otherwise gate 7 reports SKIPPED.
 * Values may be absolute counts or shares that sum to ~1.
 * e.g. { Trekker: 41000, Explorer: 12000, Voyager: 5200, Nomad: 1800 }
 */
const EXPECTED_PEAK_LEAGUES = null;

function flagValue(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) return fallback;
  return v;
}

/** Same scope rule as migrateRatingV2.js: the first N users by _id ascending. */
async function scopeFilterFor(limit) {
  if (!limit) return {};
  const docs = await User.find({}).select('_id').sort({ _id: 1 }).skip(limit - 1).limit(1).lean();
  if (docs.length === 0) return {};
  return { _id: { $lte: docs[0]._id } };
}

export async function run({
  limit = null,
  pairs = 200000,
  sampleSize = 20000,
  expectedPath = null,
  tolerance = 0.01,
  strict = false,
} = {}) {
  const results = [];
  const gate = (id, name, pass, detail, extra = []) =>
    results.push({ id, name, status: pass === null ? 'SKIP' : (pass ? 'PASS' : 'FAIL'), detail, extra });

  const scope = await scopeFilterFor(limit);
  const total = await User.countDocuments(scope);
  console.log(`Verifying ${total} user(s)${limit ? ` (limited to the first ${limit} by _id)` : ' (all)'}\n`);

  /* ---- GATE 1: coverage ------------------------------------------------ */
  const [withS0, withPeak, withPeakLeague] = await Promise.all([
    User.countDocuments({ ...scope, elo_s0: { $ne: null } }),
    User.countDocuments({ ...scope, seasonPeakElo: { $ne: null } }),
    User.countDocuments({ ...scope, seasonPeakLeague: { $ne: null } }),
  ]);
  gate('1', 'COVERAGE  docs touched == total users',
    withS0 === total && withPeak === total && withPeakLeague === total,
    `total=${total} elo_s0=${withS0} seasonPeakElo=${withPeak} seasonPeakLeague=${withPeakLeague}`);

  /* ---- GATE 2: no null snapshots --------------------------------------- */
  const nullS0 = await User.countDocuments({
    ...scope,
    $or: [{ elo_s0: null }, { elo_s0: { $exists: false } }],
  });
  gate('2', 'SNAPSHOT  zero null elo_s0', nullS0 === 0, `null elo_s0 = ${nullS0}`);

  /* ---- GATE 3: rating bounds ------------------------------------------- */
  const [above, below, nullElo] = await Promise.all([
    User.countDocuments({ ...scope, elo: { $gt: RATING_CEIL } }),
    User.countDocuments({ ...scope, elo: { $lt: RATING_FLOOR } }),
    User.countDocuments({ ...scope, $or: [{ elo: null }, { elo: { $exists: false } }] }),
  ]);
  const boundOffenders = (above + below) > 0
    ? (await User.find({ ...scope, $or: [{ elo: { $gt: RATING_CEIL } }, { elo: { $lt: RATING_FLOOR } }] })
        .select('_id username elo elo_s0').limit(10).lean())
        .map((u) => `    ${u.username || '(unnamed)'} [${u._id}] elo=${u.elo} elo_s0=${u.elo_s0}`)
    : [];
  gate('3', `BOUNDS    all elo within [${RATING_FLOOR}, ${RATING_CEIL}]`,
    above === 0 && below === 0 && nullElo === 0,
    `above=${above} below=${below} null=${nullElo}`, boundOffenders);

  /* ---- GATE 4: order preservation -------------------------------------- */
  console.log(`Sampling ${sampleSize} users for the order gate...`);
  const sample = await User.aggregate([
    { $match: { ...scope, elo_s0: { $ne: null }, elo: { $ne: null } } },
    { $sample: { size: sampleSize } },
    { $project: { _id: 1, username: 1, elo: 1, elo_s0: 1 } },
  ]);
  let inversions = 0;
  const inversionExamples = [];
  if (sample.length < 2) {
    gate('4', `ORDER     zero inversions over ${pairs} random pairs`, null,
      `sample too small (${sample.length} users with both elo and elo_s0)`);
  } else {
    for (let i = 0; i < pairs; i++) {
      const a = sample[(Math.random() * sample.length) | 0];
      let b = sample[(Math.random() * sample.length) | 0];
      if (a === b) { b = sample[(i + 1) % sample.length]; if (a === b) continue; }
      const dOld = a.elo_s0 - b.elo_s0;
      const dNew = a.elo - b.elo;
      // Monotone non-decreasing is fine: equal old -> anything, and distinct old
      // collapsing to equal new is allowed. Only a STRICT sign flip is a bug.
      if ((dOld > 0 && dNew < 0) || (dOld < 0 && dNew > 0)) {
        inversions++;
        if (inversionExamples.length < 10) {
          inversionExamples.push(
            `    ${a.username || a._id}: ${a.elo_s0}->${a.elo}  vs  ${b.username || b._id}: ${b.elo_s0}->${b.elo}`
          );
        }
      }
    }
    gate('4', `ORDER     zero inversions over ${pairs} random pairs`,
      inversions === 0,
      `inversions=${inversions} (pool ${sample.length} users)`, inversionExamples);
  }

  /* ---- GATE 5a/5b/5c: placement safety --------------------------------- */
  const veteransAtZero = await User.countDocuments({
    ...scope,
    $and: [
      { $or: [{ ratedGames: 0 }, { ratedGames: null }, { ratedGames: { $exists: false } }] },
      { $or: [{ duels_wins: { $gt: 0 } }, { duels_losses: { $gt: 0 } }, { duels_tied: { $gt: 0 } }] },
    ],
  });
  const vetExamples = veteransAtZero > 0
    ? (await User.find({
        ...scope,
        $and: [
          { $or: [{ ratedGames: 0 }, { ratedGames: null }, { ratedGames: { $exists: false } }] },
          { $or: [{ duels_wins: { $gt: 0 } }, { duels_losses: { $gt: 0 } }, { duels_tied: { $gt: 0 } }] },
        ],
      }).select('_id username elo ratedGames duels_wins duels_losses duels_tied').limit(10).lean())
        .map((u) => `    ${u.username || '(unnamed)'} [${u._id}] elo=${u.elo} ratedGames=${u.ratedGames} W/L/T=${u.duels_wins || 0}/${u.duels_losses || 0}/${u.duels_tied || 0}`)
    : [];
  gate('5a', 'PLACEMENT zero ratedGames=0 accounts with career W/L/T > 0',
    veteransAtZero === 0,
    `${veteransAtZero} veteran(s) would be placement-eligible and lose their migrated rating`,
    vetExamples);

  const overCap = await User.countDocuments({ ...scope, ratedGames: { $gt: RATED_GAMES_CAP } });
  gate('5b', `PLACEMENT zero ratedGames > ${RATED_GAMES_CAP}`,
    overCap === 0, `over cap = ${overCap}`);

  const top = await User.find({ ...scope, elo_s0: { $ne: null } })
    .sort({ elo_s0: -1 })
    .limit(TOP_N)
    .select('_id username elo elo_s0 ratedGames duels_wins duels_losses duels_tied')
    .lean();
  const topBad = top.filter((u) => (u.ratedGames ?? 0) !== RATED_GAMES_CAP);
  gate('5c', `PLACEMENT top ${TOP_N} by elo_s0 all at exactly ${RATED_GAMES_CAP}`,
    topBad.length === 0,
    `${topBad.length}/${top.length} off-cap`,
    topBad.slice(0, 10).map((u) => `    ${u.username || '(unnamed)'} [${u._id}] elo_s0=${u.elo_s0} ratedGames=${u.ratedGames ?? 'missing'} W/L/T=${u.duels_wins || 0}/${u.duels_losses || 0}/${u.duels_tied || 0}`));

  /* ---- GATE 6: peak sanity --------------------------------------------- */
  const peakBelowClose = await User.countDocuments({
    ...scope,
    $expr: { $lt: ['$seasonPeakElo', '$elo_s0'] },
  });
  const peakExamples = peakBelowClose > 0
    ? (await User.find({ ...scope, $expr: { $lt: ['$seasonPeakElo', '$elo_s0'] } })
        .select('_id username elo_s0 seasonPeakElo seasonPeakLeague').limit(10).lean())
        .map((u) => `    ${u.username || '(unnamed)'} [${u._id}] elo_s0=${u.elo_s0} seasonPeakElo=${u.seasonPeakElo}`)
    : [];
  gate('6', 'PEAK      zero seasonPeakElo < elo_s0',
    peakBelowClose === 0,
    `${peakBelowClose} impossible peak(s) — the peak-table lookup missed and fell back to 0`,
    peakExamples);

  /* ---- GATE 7: league populations --------------------------------------- */
  let expected = EXPECTED_PEAK_LEAGUES;
  if (expectedPath) {
    const abs = path.resolve(process.cwd(), expectedPath);
    try {
      expected = JSON.parse(await fs.readFile(abs, 'utf8'));
    } catch (err) {
      gate('7', 'LEAGUES   populations within tolerance', false,
        `could not read --expected ${abs}: ${err.message}`);
      expected = undefined;
    }
  }

  if (expected === undefined) {
    // already gated as a failure above
  } else if (!expected) {
    gate('7', 'LEAGUES   populations within tolerance', null,
      'no expected table: fill EXPECTED_PEAK_LEAGUES in this file or pass --expected <file>');
  } else {
    const rows = await User.aggregate([
      { $match: { ...scope, seasonPeakLeague: { $ne: null } } },
      { $group: { _id: '$seasonPeakLeague', count: { $sum: 1 } } },
    ]);
    const actual = Object.create(null);
    let counted = 0;
    for (const r of rows) { actual[r._id] = r.count; counted += r.count; }

    const expSum = Object.values(expected).reduce((a, b) => a + Number(b), 0);
    const asShares = expSum > 0 && expSum <= 1.5; // shares summing to ~1
    const lines = [];
    let worst = 0;
    const names = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    for (const name of names) {
      const exp = asShares ? Number(expected[name] || 0) * counted : Number(expected[name] || 0);
      const act = actual[name] || 0;
      const drift = exp > 0 ? Math.abs(act - exp) / exp : (act === 0 ? 0 : 1);
      if (drift > worst) worst = drift;
      lines.push(`    ${name.padEnd(12)} actual=${String(act).padStart(8)} expected=${String(Math.round(exp)).padStart(8)} drift=${(drift * 100).toFixed(2)}%`);
    }
    gate('7', `LEAGUES   Season 0 peak-league populations within ${(tolerance * 100).toFixed(1)}%`,
      worst <= tolerance,
      `worst drift ${(worst * 100).toFixed(2)}% over ${counted} users`, lines);
  }

  /* ---- REPORT ----------------------------------------------------------- */
  console.log('\n================ VERIFICATION ================');
  let failed = 0;
  let skipped = 0;
  for (const r of results) {
    console.log(`[${r.status}] ${r.id.padEnd(3)} ${r.name}`);
    console.log(`        ${r.detail}`);
    for (const line of r.extra) console.log(line);
    if (r.status === 'FAIL') failed++;
    if (r.status === 'SKIP') skipped++;
  }
  console.log('==============================================');
  console.log(`${results.length - failed - skipped} passed, ${failed} failed, ${skipped} skipped`);

  const ok = failed === 0 && (!strict || skipped === 0);
  if (failed > 0) {
    console.log('\nRESULT: FAIL — do NOT enable ranked writes. Fix, or roll back with');
    console.log('        node scripts/rollbackRatingV2.js --apply');
  } else if (skipped > 0 && strict) {
    console.log('\nRESULT: FAIL — a gate was skipped and --strict is on.');
  } else if (skipped > 0) {
    console.log('\nRESULT: PASS (with skipped gates — re-run with --strict for the real migration).');
  } else {
    console.log('\nRESULT: PASS — all gates green.');
  }
  return { ok, failed, skipped, results };
}

async function main() {
  const limitRaw = flagValue('--limit', null);
  const limit = limitRaw === null ? null : Number(limitRaw);
  if (limitRaw !== null && (!Number.isInteger(limit) || limit <= 0)) {
    console.error(`--limit must be a positive integer (got "${limitRaw}")`);
    process.exit(1);
  }
  const pairs = Number(flagValue('--pairs', 200000));
  const sampleSize = Number(flagValue('--sample', 20000));
  const tolerance = Number(flagValue('--tolerance', 0.01));
  if (!Number.isInteger(pairs) || pairs <= 0) { console.error('--pairs must be a positive integer'); process.exit(1); }
  if (!Number.isInteger(sampleSize) || sampleSize <= 1) { console.error('--sample must be an integer > 1'); process.exit(1); }
  if (!Number.isFinite(tolerance) || tolerance < 0) { console.error('--tolerance must be >= 0'); process.exit(1); }

  const mongoUri = process.env.MONGODB;
  if (!mongoUri) {
    console.error('MONGODB env variable not set');
    process.exit(1);
  }

  console.log('Connecting to MongoDB... (READ-ONLY — this script never writes)');
  await mongoose.connect(mongoUri);
  console.log('Connected!\n');
  let ok = false;
  try {
    ({ ok } = await run({
      limit,
      pairs,
      sampleSize,
      expectedPath: flagValue('--expected', null),
      tolerance,
      strict: process.argv.includes('--strict'),
    }));
  } finally {
    await mongoose.disconnect();
  }
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
}
