#!/usr/bin/env node
/**
 * ONE-TIME Rating v2 migration. Converts every account's Season 0 rating onto
 * the v2 scale, snapshots the old value for rollback, backfills the placement
 * counter, and stamps the permanent Season 0 peak badge.
 *
 * DRY RUN BY DEFAULT. Nothing is written without --apply.
 *
 * WHAT IT DOES, IN ORDER
 * ----------------------
 * Pass 1 — SNAPSHOT: elo_s0 = elo for every in-scope user (only where elo_s0 is
 *   still null, so a re-run never re-snapshots an already-converted rating).
 *   Afterwards it verifies zero null elo_s0 in scope and REFUSES to continue if
 *   any remain. elo_s0 is the rollback anchor (scripts/rollbackRatingV2.js).
 *
 * Pass 2 — MAPPING, one $set per user containing ALL FOUR fields:
 *     elo              = f(elo_s0) from a FROZEN conversion table (JSON file),
 *                        clamped to [RATING_FLOOR, RATING_CEIL] = [100, 1600]
 *     ratedGames       = backfillRatedGames(user)   <-- NOT OPTIONAL, see below
 *     seasonPeakElo    = max(peakTable[userId] || 0, elo_s0)
 *     seasonPeakLeague = season0League(seasonPeakElo).name  (from the PEAK, and
 *                        pinned to the SEASON 0 tier table — never getLeague(),
 *                        which follows the ambient RATING_V2 flag)
 *
 *   All four in a SINGLE $set so the update is atomic per document: there is no
 *   instant at which a document has a converted `elo` but still has ratedGames
 *   0. A partially-migrated batch can therefore never exist in a
 *   placement-eligible state.
 *
 * WHY ratedGames IS NOT OPTIONAL
 * ------------------------------
 *   ratedGames is a NEW field with default 0, and the placement trigger fires on
 *   ratedGames === 0. Every one of the ~60k pre-existing accounts therefore
 *   reads as 0 the moment v2 ships. Without this backfill EVERY veteran on the
 *   ladder is placement-eligible, and the first one to queue has their
 *   carefully migrated rating OVERWRITTEN by a 500-800 placement seed. A
 *   2400-rated account becomes 640. There is no undo other than elo_s0.
 *   (components/utils/placementGates.js is gate 1; this backfill is gate 2, and
 *   they are independent on purpose.)
 *
 * WHY seasonPeakElo IS NOT elo_s0
 * -------------------------------
 *   elo_s0 is the rating AT migration, not the peak. Someone who hit 15,000 and
 *   slid to 12,000 would carry a permanent badge reading 12,000. The real peak
 *   comes from scripts/exportSeason0Peaks.js (a $max over UserStats, run at T-3
 *   on a restored backup). Taking max() against elo_s0 covers the T-3..T-0 gap
 *   for free and makes `seasonPeakElo >= elo_s0` true BY CONSTRUCTION — which is
 *   exactly what verifyMigration.js gates on: any violation means the peak table
 *   lookup silently missed.
 *
 *   Peaks and seasonPeakLeague stay in SEASON 0 units. The badge commemorates
 *   Season 0, so the peak is NOT run through the conversion table.
 *
 * IDEMPOTENT BY CONSTRUCTION
 * --------------------------
 *   Every mapped value is a pure function of elo_s0 and the duel counters, never
 *   of the current `elo`. Re-running RECOMPUTES rather than double-converting.
 *
 * THIS SCRIPT PAYS NOBODY
 * -----------------------
 *   No XP, no Stamps, no OG badge. Compensation is deliberately not fused into
 *   the rating conversion: a conversion that also moves currency is a conversion
 *   nobody can roll back (rollbackRatingV2.js restores elo from elo_s0 — it
 *   cannot un-mint an $inc). The player-facing grants promised by the Season 1
 *   first-login modal are scripts/grantSeason1Compensation.js, which runs AFTER
 *   this and refuses to start until elo_s0 and seasonPeakElo are set on every
 *   in-scope account, because its whole payout curve is keyed on the peak.
 *
 * REQUIRES
 * --------
 *   MONGODB env var (dotenv/.env is loaded).
 *   data/elo-conversion-map.json  — the FROZEN old->new rating table. If it is
 *     missing this script FAILS LOUDLY and does not write. It will never invent
 *     or compute a mapping at runtime: the table is a product decision, it is
 *     reviewed and frozen before migration day, and a rating curve conjured by a
 *     script at 3am is not something anyone can sign off on.
 *   data/season0-peaks.json — produced by scripts/exportSeason0Peaks.js.
 *
 * CONVERSION TABLE FORMAT (dense integer lookup keyed by OLD elo). Accepted:
 *   [n0, n1, n2, ...]                       index = old elo, starting at 0
 *   { "offset": 0, "table": [n0, n1, ...] } index = old elo - offset
 *   { "0": 100, "1": 100, "2": 101, ... }   numeric-keyed object, must be dense
 *   { "map": { "0": 100, ... } }            same, nested
 *
 * Usage (from project root):
 *   node scripts/migrateRatingV2.js                       (dry run — full simulation, no writes)
 *   node scripts/migrateRatingV2.js --limit 1000          (dry run over the first 1000 users)
 *   node scripts/migrateRatingV2.js --apply               (THE MIGRATION)
 *
 * Flags:
 *   --apply                  Required to write. Default is a dry run.
 *   --limit N                Only the first N users by _id ascending. Testing.
 *                            verifyMigration.js --limit N scopes identically.
 *   --map <path>             Conversion table. Default data/elo-conversion-map.json
 *   --peaks <path>           Peak table.       Default data/season0-peaks.json
 *   --batch N                Batch size. Default 100000.
 *   --pause-ms N             Pause between batches. Default 250.
 *   --allow-missing-peaks    Proceed without a peak table (every badge then reads
 *                            the CLOSING rating). Staging only.
 *   --allow-partial-peaks    Proceed with a peak file marked partial:true.
 *   --allow-out-of-range     Clamp elo_s0 values the table does not cover to the
 *                            nearest table end instead of aborting.
 *   --allow-nonmonotonic     Proceed with a table that is not non-decreasing.
 *                            (Such a table CREATES rank inversions — the
 *                            verifyMigration.js order gate will fail.)
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import User from '../models/User.js';
import { backfillRatedGames } from '../components/utils/placementGates.js';
import { RATING_FLOOR } from '../components/utils/eloSystem.js';
import { getLeague, leagues as SEASON0_LEAGUES } from '../components/utils/leagues.js';

/**
 * League name for a SEASON 0 rating, resolved against the Season 0 table
 * EXPLICITLY — never through getLeague().
 *
 * getLeague() picks its table from the ambient RATING_V2 flag. seasonPeakElo is
 * a Season 0 number (the badge commemorates the old ladder and is deliberately
 * NOT run through the conversion table), so resolving it with getLeague() while
 * the flag is on reads a Season 0 rating off the v2 tiers and produces names
 * that never existed on that ladder: a peak of 1000 came out "Voyager" instead
 * of "Trekker", and 2484 came out "Legend" instead of "Explorer". Legend is not
 * even in grantSeason1Compensation.js's starter-stamp budget, so it aborted.
 *
 * This is why the lookup is pinned: the migration must produce identical output
 * whether it runs before or after the flag is switched on.
 */
function season0League(elo) {
  for (const key in SEASON0_LEAGUES) {
    const tier = SEASON0_LEAGUES[key];
    if (elo >= tier.min && elo <= tier.max) return tier;
  }
  return SEASON0_LEAGUES[Object.keys(SEASON0_LEAGUES)[0]];
}

// Top of the v2 scale. eloSystem.js owns the floor (100); the ceiling is a
// property of the frozen conversion table, so it lives with the migration.
export const RATING_CEIL = 1600;

// User schema default for `elo`. Used only when a document somehow has no elo
// at all, so the snapshot can never write a null elo_s0.
const DEFAULT_ELO = 1000;

const DEFAULT_MAP = path.join('data', 'elo-conversion-map.json');
const DEFAULT_PEAKS = path.join('data', 'season0-peaks.json');
const DEFAULT_BATCH = 100000;
const DEFAULT_PAUSE_MS = 250;
// bulkWrite payload chunk. Batches are 100k docs; sending 100k ops in one
// command is a needlessly enormous request.
const WRITE_CHUNK = 1000;

function flagValue(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) return fallback;
  return v;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ *
 * Conversion table
 * ------------------------------------------------------------------ */

/**
 * Load the frozen conversion table and return a dense lookup.
 * Throws (loudly, with operator instructions) rather than inventing anything.
 */
export async function loadConversionMap(mapPath, { allowNonMonotonic = false } = {}) {
  const abs = path.resolve(process.cwd(), mapPath);
  let raw;
  try {
    raw = JSON.parse(await fs.readFile(abs, 'utf8'));
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new Error(
        `Conversion table not found: ${abs}\n` +
        '\n' +
        'This script will NOT invent or compute a rating mapping at runtime.\n' +
        'Obtain the FROZEN elo-conversion-map.json from the rating v2 spec owner,\n' +
        `place it at ${abs} (or pass --map <path>), and re-run.\n` +
        'Expected: a dense integer lookup keyed by OLD elo. See this file\'s header\n' +
        'for the accepted shapes.'
      );
    }
    throw new Error(`Conversion table at ${abs} could not be parsed: ${err.message}`);
  }

  let table = null;
  let offset = 0;
  const meta = {};

  if (Array.isArray(raw)) {
    table = raw;
  } else if (raw && typeof raw === 'object' && Array.isArray(raw.table)) {
    table = raw.table;
    offset = Number(raw.offset ?? raw.minElo ?? 0) || 0;
    if (raw.version !== undefined) meta.version = raw.version;
    if (raw.generated_at !== undefined) meta.generated_at = raw.generated_at;
  } else if (raw && typeof raw === 'object') {
    const src = raw.map && typeof raw.map === 'object' ? raw.map : raw;
    const keys = Object.keys(src).filter((k) => /^-?\d+$/.test(k)).map(Number);
    if (keys.length === 0) {
      throw new Error(
        `Conversion table at ${abs} has no integer keys. Expected a dense lookup keyed by old elo.`
      );
    }
    let min = Infinity;
    let max = -Infinity;
    for (const k of keys) {
      if (k < min) min = k;
      if (k > max) max = k;
    }
    const span = max - min + 1;
    if (keys.length !== span) {
      throw new Error(
        `Conversion table at ${abs} is SPARSE: keys ${min}..${max} span ${span} values ` +
        `but only ${keys.length} are present (${span - keys.length} missing).\n` +
        'A dense table is required. Filling the gaps here would be inventing a mapping.'
      );
    }
    offset = min;
    table = new Array(span);
    for (const k of keys) table[k - min] = Number(src[String(k)]);
  } else {
    throw new Error(`Conversion table at ${abs} is not an array or object.`);
  }

  if (!table.length) throw new Error(`Conversion table at ${abs} is empty.`);

  const bad = [];
  const nonMonotonic = [];
  for (let i = 0; i < table.length; i++) {
    const v = Number(table[i]);
    if (!Number.isFinite(v)) {
      bad.push(offset + i);
      if (bad.length > 10) break;
      continue;
    }
    table[i] = v;
    if (i > 0 && Number.isFinite(table[i - 1]) && v < table[i - 1]) {
      if (nonMonotonic.length < 10) nonMonotonic.push(`${offset + i - 1}->${offset + i}: ${table[i - 1]} -> ${v}`);
    }
  }
  if (bad.length) {
    throw new Error(
      `Conversion table at ${abs} has non-numeric entries at old elo ${bad.join(', ')}${bad.length > 10 ? ' ...' : ''}.`
    );
  }
  if (nonMonotonic.length && !allowNonMonotonic) {
    throw new Error(
      `Conversion table at ${abs} is NOT non-decreasing. Sample violations:\n  ` +
      nonMonotonic.join('\n  ') + '\n' +
      'A decreasing step swaps two players\' relative rank, which is exactly what the\n' +
      'verifyMigration.js order-preservation gate fails on. Fix the table, or pass\n' +
      '--allow-nonmonotonic if the inversion is intentional.'
    );
  }

  const minOld = offset;
  const maxOld = offset + table.length - 1;

  return {
    path: abs,
    meta,
    minOld,
    maxOld,
    size: table.length,
    nonMonotonic,
    /** old elo -> new elo, clamped to [RATING_FLOOR, RATING_CEIL]. */
    lookup(oldElo) {
      const key = Math.round(Number(oldElo));
      let idx = key - offset;
      let outOfRange = 0;
      if (idx < 0) { idx = 0; outOfRange = -1; }
      else if (idx >= table.length) { idx = table.length - 1; outOfRange = 1; }
      const mapped = table[idx];
      const clamped = Math.max(RATING_FLOOR, Math.min(RATING_CEIL, Math.round(mapped)));
      return { value: clamped, outOfRange, clamped: clamped !== Math.round(mapped) };
    },
  };
}

/* ------------------------------------------------------------------ *
 * Peak table
 * ------------------------------------------------------------------ */

export async function loadPeaks(peaksPath, { allowMissing = false, allowPartial = false } = {}) {
  const abs = path.resolve(process.cwd(), peaksPath);
  let raw;
  try {
    raw = JSON.parse(await fs.readFile(abs, 'utf8'));
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      if (allowMissing) {
        console.log(`WARNING: peak table ${abs} missing and --allow-missing-peaks given.`);
        console.log('         Every seasonPeakElo will fall back to the CLOSING rating (elo_s0).');
        console.log('         That is the exact lie the peak export exists to prevent. Staging only.');
        return { path: abs, peaks: Object.create(null), users: 0, partial: false, missing: true };
      }
      throw new Error(
        `Peak table not found: ${abs}\n` +
        '\n' +
        'Run scripts/exportSeason0Peaks.js --apply at T-3 against a RESTORED BACKUP\n' +
        'and copy the JSON here (or pass --peaks <path>).\n' +
        'Without it every Season 0 peak badge would show the closing rating instead of\n' +
        'the real high-water mark — a permanent, visible, unfixable error.\n' +
        'Staging only: --allow-missing-peaks.'
      );
    }
    throw new Error(`Peak table at ${abs} could not be parsed: ${err.message}`);
  }

  const peaks = raw && typeof raw === 'object' && raw.peaks && typeof raw.peaks === 'object'
    ? raw.peaks
    : raw;
  if (!peaks || typeof peaks !== 'object') {
    throw new Error(`Peak table at ${abs} is not an object map of { userId: peak }.`);
  }
  const partial = Boolean(raw && raw.partial);
  if (partial && !allowPartial) {
    throw new Error(
      `Peak table at ${abs} is marked partial:true (it was generated with --limit).\n` +
      'It does not contain every account\'s true peak. Regenerate it without --limit,\n' +
      'or pass --allow-partial-peaks for a staging test.'
    );
  }

  return {
    path: abs,
    peaks,
    users: Object.keys(peaks).length,
    partial,
    missing: false,
    generated_at: raw && raw.generated_at,
  };
}

/* ------------------------------------------------------------------ *
 * Batching
 * ------------------------------------------------------------------ */

/**
 * Yield { first, last, count } _id ranges of `batchSize` users, ascending.
 * Ranges (not $in lists) keep the updates index-driven and keep --limit
 * meaning "the first N users by _id" for both this script and
 * verifyMigration.js.
 */
async function* idBatches({ batchSize, limit }) {
  let lastId = null;
  let seen = 0;
  for (;;) {
    const take = limit ? Math.min(batchSize, limit - seen) : batchSize;
    if (take <= 0) return;
    const query = lastId ? { _id: { $gt: lastId } } : {};
    const docs = await User.find(query).select('_id').sort({ _id: 1 }).limit(take).lean();
    if (docs.length === 0) return;
    const first = docs[0]._id;
    const last = docs[docs.length - 1]._id;
    yield { first, last, count: docs.length };
    lastId = last;
    seen += docs.length;
  }
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

export async function run({
  apply = false,
  limit = null,
  mapPath = DEFAULT_MAP,
  peaksPath = DEFAULT_PEAKS,
  batchSize = DEFAULT_BATCH,
  pauseMs = DEFAULT_PAUSE_MS,
  allowMissingPeaks = false,
  allowPartialPeaks = false,
  allowOutOfRange = false,
  allowNonMonotonic = false,
} = {}) {
  const started = Date.now();

  // ---- load frozen inputs BEFORE touching a single document -------------
  const conv = await loadConversionMap(mapPath, { allowNonMonotonic });
  console.log(`[migrate] conversion table: ${conv.path}`);
  console.log(`[migrate]   old elo ${conv.minOld}..${conv.maxOld} (${conv.size} entries)` +
    `${conv.meta.version !== undefined ? `, version ${conv.meta.version}` : ''}`);
  if (conv.nonMonotonic.length) {
    console.log(`[migrate]   WARNING: table is NOT non-decreasing (${conv.nonMonotonic.length}+ violations), proceeding on --allow-nonmonotonic`);
  }

  const peakTable = await loadPeaks(peaksPath, { allowMissing: allowMissingPeaks, allowPartial: allowPartialPeaks });
  console.log(`[migrate] peak table: ${peakTable.missing ? '(none)' : peakTable.path}` +
    `${peakTable.missing ? '' : ` — ${peakTable.users} users, generated ${peakTable.generated_at || 'unknown'}`}`);

  const totalUsers = await User.countDocuments({});
  const scopeNote = limit ? `first ${limit} of ${totalUsers} users` : `all ${totalUsers} users`;
  console.log(`[migrate] scope: ${scopeNote}`);
  console.log(`[migrate] batch size ${batchSize}, pause ${pauseMs}ms\n`);

  /* ---- PASS 1: SNAPSHOT ------------------------------------------------ */
  console.log('=== PASS 1: SNAPSHOT (elo_s0 = elo) ===');
  let snapMatched = 0;
  let snapModified = 0;
  let snapBatches = 0;
  let scopeCount = 0;
  let scopeLastId = null;

  for await (const range of idBatches({ batchSize, limit })) {
    snapBatches++;
    scopeCount += range.count;
    scopeLastId = range.last;
    const filter = { _id: { $gte: range.first, $lte: range.last }, elo_s0: null };
    if (apply) {
      const res = await User.updateMany(filter, [
        // $ifNull so a doc missing `elo` entirely still snapshots a number:
        // a null elo_s0 would fail verifyMigration.js and break rollback.
        { $set: { elo_s0: { $ifNull: ['$elo', DEFAULT_ELO] } } },
      ]);
      snapMatched += res.matchedCount || 0;
      snapModified += res.modifiedCount || 0;
    } else {
      const n = await User.countDocuments(filter);
      snapMatched += n;
    }
    console.log(`[migrate] snapshot batch ${snapBatches}: ${range.count} users in range, ` +
      `${snapMatched} needing snapshot so far${apply ? `, ${snapModified} written` : ''}`);
    if (pauseMs) await sleep(pauseMs);
  }

  const scopeFilter = scopeLastId ? { _id: { $lte: scopeLastId } } : {};
  if (apply) {
    const remainingNull = await User.countDocuments({ ...scopeFilter, elo_s0: null });
    console.log(`[migrate] snapshot done: ${snapModified} written, ${remainingNull} null elo_s0 remaining in scope`);
    if (remainingNull !== 0) {
      throw new Error(
        `SNAPSHOT INCOMPLETE: ${remainingNull} users still have a null elo_s0. ` +
        'Refusing to run the mapping pass — without a snapshot there is no rollback anchor.'
      );
    }
  } else {
    console.log(`[migrate] snapshot done (dry run): ${snapMatched} users would be snapshotted`);
  }

  /* ---- PRE-FLIGHT: does the table cover the data? ---------------------- */
  const [range] = await User.aggregate([
    { $match: scopeFilter },
    {
      $group: {
        _id: null,
        // In a dry run elo_s0 is still null, so fall back to the value pass 1
        // would have written.
        min: { $min: { $ifNull: ['$elo_s0', { $ifNull: ['$elo', DEFAULT_ELO] }] } },
        max: { $max: { $ifNull: ['$elo_s0', { $ifNull: ['$elo', DEFAULT_ELO] }] } },
      },
    },
  ]);
  if (range) {
    console.log(`\n[migrate] source rating range in scope: ${range.min} .. ${range.max}`);
    const uncovered = range.min < conv.minOld || range.max > conv.maxOld;
    if (uncovered && !allowOutOfRange) {
      throw new Error(
        `Conversion table covers old elo ${conv.minOld}..${conv.maxOld} but the data spans ` +
        `${range.min}..${range.max}.\n` +
        'Refusing to run: values outside the table would be clamped to the nearest table end,\n' +
        'which is a mapping nobody signed off on. Extend the table, or pass --allow-out-of-range\n' +
        'if clamping really is the intended behaviour.'
      );
    }
    if (uncovered) {
      console.log('[migrate] WARNING: data exceeds table range; clamping to table ends (--allow-out-of-range)');
    }
  }

  /* ---- PASS 2: MAPPING ------------------------------------------------- */
  console.log('\n=== PASS 2: MAPPING (elo, ratedGames, seasonPeakElo, seasonPeakLeague) ===');
  let processed = 0;
  let written = 0;
  let mapBatches = 0;
  let minNew = Infinity;
  let maxNew = -Infinity;
  let outOfRangeLow = 0;
  let outOfRangeHigh = 0;
  let clampedCount = 0;
  let peakHits = 0;
  let peakMisses = 0;
  let peakAboveClose = 0;
  let ratedAtCap = 0;
  let ratedZero = 0;
  const peakLeagueHist = Object.create(null);
  const newLeagueHist = Object.create(null);
  const samples = [];

  for await (const b of idBatches({ batchSize, limit })) {
    mapBatches++;
    const docs = await User.find({ _id: { $gte: b.first, $lte: b.last } })
      .select('_id username elo elo_s0 duels_wins duels_losses duels_tied')
      .lean();

    const ops = [];
    for (const u of docs) {
      // ALWAYS from the snapshot, never from the live elo. That is what makes
      // a re-run recompute instead of double-converting.
      const s0 = u.elo_s0 ?? u.elo ?? DEFAULT_ELO;

      const mapped = conv.lookup(s0);
      if (mapped.outOfRange < 0) outOfRangeLow++;
      else if (mapped.outOfRange > 0) outOfRangeHigh++;
      if (mapped.clamped) clampedCount++;
      const newElo = mapped.value;
      if (newElo < minNew) minNew = newElo;
      if (newElo > maxNew) maxNew = newElo;

      // ratedGames: NOT OPTIONAL. See the header. min(W+L+T, 70).
      const ratedGames = backfillRatedGames(u);
      if (ratedGames === 70) ratedAtCap++;
      if (ratedGames === 0) ratedZero++;

      const recorded = Number(peakTable.peaks[String(u._id)]);
      if (Number.isFinite(recorded)) peakHits++; else peakMisses++;
      const seasonPeakElo = Math.max(Number.isFinite(recorded) ? Math.round(recorded) : 0, Math.round(s0));
      if (seasonPeakElo > Math.round(s0)) peakAboveClose++;
      // Season 0 table, pinned — see season0League() above.
      const seasonPeakLeague = season0League(seasonPeakElo).name;

      peakLeagueHist[seasonPeakLeague] = (peakLeagueHist[seasonPeakLeague] || 0) + 1;
      const newLeague = getLeague(newElo).name;
      newLeagueHist[newLeague] = (newLeagueHist[newLeague] || 0) + 1;

      if (samples.length < 10) {
        samples.push(`  ${(u.username || '(unnamed)').padEnd(18)} elo_s0=${String(Math.round(s0)).padStart(6)} -> elo=${String(newElo).padStart(5)}  ratedGames=${String(ratedGames).padStart(2)}  peak=${String(seasonPeakElo).padStart(6)} (${seasonPeakLeague})`);
      }

      ops.push({
        updateOne: {
          filter: { _id: u._id },
          // ONE $set. Atomic per document: no doc is ever visible with a
          // converted elo but a still-zero ratedGames (= placement eligible).
          update: {
            $set: {
              elo: newElo,
              ratedGames,
              seasonPeakElo,
              seasonPeakLeague,
            },
          },
        },
      });
      processed++;
    }

    if (apply) {
      for (let i = 0; i < ops.length; i += WRITE_CHUNK) {
        const res = await User.bulkWrite(ops.slice(i, i + WRITE_CHUNK), { ordered: false });
        written += res.modifiedCount || 0;
      }
    }
    console.log(`[migrate] mapping batch ${mapBatches}: ${docs.length} users${apply ? `, ${written} written so far` : ''} (${processed} processed)`);
    if (pauseMs) await sleep(pauseMs);
  }

  /* ---- SUMMARY --------------------------------------------------------- */
  const elapsed = Math.round((Date.now() - started) / 1000);
  console.log('\n============ SUMMARY ============');
  console.log(`mode                : ${apply ? 'APPLY' : 'DRY RUN (no writes)'}`);
  console.log(`scope               : ${scopeNote}`);
  console.log(`users processed     : ${processed}`);
  console.log(`docs touched        : ${apply ? written : `${processed} (would be)`}`);
  console.log(`snapshots written   : ${apply ? snapModified : `${snapMatched} (would be)`}`);
  console.log(`resulting elo range : ${processed ? `${minNew} .. ${maxNew}` : 'n/a'} (floor ${RATING_FLOOR}, ceil ${RATING_CEIL})`);
  console.log(`clamped to floor/ceil: ${clampedCount}`);
  console.log(`out of table range  : ${outOfRangeLow} low, ${outOfRangeHigh} high`);
  console.log(`ratedGames at cap 70: ${ratedAtCap}`);
  console.log(`ratedGames still 0  : ${ratedZero}  (accounts with zero W/L/T — expected for never-duelled accounts)`);
  console.log(`peak table hits     : ${peakHits}, misses (fell back to elo_s0): ${peakMisses}`);
  console.log(`peak above closing  : ${peakAboveClose}  (players who slid from their high-water mark)`);

  console.log('\nSeason 0 PEAK league populations (seasonPeakLeague, Season 0 scale):');
  printHist(peakLeagueHist, processed);
  console.log('\nPost-conversion league populations (getLeague(new elo)):');
  printHist(newLeagueHist, processed);
  console.log('  NOTE: components/utils/leagues.js thresholds are Season 0 scale (0..20000).');
  console.log('        A v2 rating maxes at 1600, so this histogram collapses into the lowest');
  console.log('        band until the league table is re-cut for v2. The PEAK histogram above');
  console.log('        is the meaningful one.');

  if (samples.length) {
    console.log('\nSample conversions:');
    for (const s of samples) console.log(s);
  }
  console.log(`\nelapsed: ${elapsed}s`);
  if (!apply) {
    console.log('\nDRY RUN — nothing was written. Re-run with --apply to migrate.');
  } else {
    console.log('\nMigration applied. Now run: node scripts/verifyMigration.js');
  }
  console.log('=================================');

  return {
    apply,
    processed,
    written,
    snapModified,
    minNew: processed ? minNew : null,
    maxNew: processed ? maxNew : null,
    peakLeagueHist,
    newLeagueHist,
    peakHits,
    peakMisses,
    ratedAtCap,
    ratedZero,
  };
}

function printHist(hist, total) {
  const entries = Object.entries(hist).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    console.log('  (empty)');
    return;
  }
  for (const [name, count] of entries) {
    const pct = total ? ((count / total) * 100).toFixed(2) : '0.00';
    const bar = '#'.repeat(Math.min(40, Math.round((count / total) * 40)));
    console.log(`  ${name.padEnd(12)} ${String(count).padStart(8)}  ${pct.padStart(6)}%  ${bar}`);
  }
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

  console.log(`Connecting to MongoDB...${apply ? ' (APPLY MODE — THIS WRITES)' : ' (dry run — no writes)'}`);
  await mongoose.connect(mongoUri);
  console.log('Connected!\n');
  try {
    await run({
      apply,
      limit,
      mapPath: flagValue('--map', DEFAULT_MAP),
      peaksPath: flagValue('--peaks', DEFAULT_PEAKS),
      batchSize,
      pauseMs,
      allowMissingPeaks: process.argv.includes('--allow-missing-peaks'),
      allowPartialPeaks: process.argv.includes('--allow-partial-peaks'),
      allowOutOfRange: process.argv.includes('--allow-out-of-range'),
      allowNonMonotonic: process.argv.includes('--allow-nonmonotonic'),
    });
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('\nMIGRATION ABORTED\n');
    console.error(err.message || err);
    process.exit(1);
  });
}
