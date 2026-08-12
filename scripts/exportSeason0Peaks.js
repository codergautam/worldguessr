#!/usr/bin/env node
/**
 * Export the TRUE Season 0 peak rating for every account, to a JSON file that
 * scripts/migrateRatingV2.js reads when it stamps `seasonPeakElo`.
 *
 * WHY THIS EXISTS (do not delete it and stamp the peak from elo_s0)
 * -----------------------------------------------------------------
 * `elo_s0` is the rating AT THE MIGRATION INSTANT, not the peak. A player who
 * climbed to 15,000 and slid back to 12,000 before migration day would be shown
 * "Season 0 peak: 12,000" in a PERMANENT profile badge and in a one-time
 * end-of-season modal. That is a visible, unfixable lie about the one thing the
 * badge exists to commemorate. The only record of the real high-water mark is
 * UserStats: one document per rating-changing event, each carrying an ABSOLUTE
 * `elo` value, so a $max over the collection recovers the true peak.
 *
 * COST / WHEN TO RUN
 * ------------------
 * This is a FULL COLLECTION SCAN of UserStats (~6.3M documents). There is no
 * index that serves `$group by userId with $max(elo)` — the grouping key is
 * userId but the accumulator needs every document's elo, so Mongo reads all of
 * them. It runs with allowDiskUse so it cannot blow the 100MB in-memory group
 * limit, which means it may also spill to disk.
 *
 *   >>> NEVER RUN THIS INSIDE THE MIGRATION WINDOW, AND NEVER AGAINST THE LIVE
 *   >>> PRIMARY. Run it at T-3 (three days before migration) against a RESTORED
 *   >>> BACKUP COPY, and copy the resulting JSON to the migration host.
 *
 * The T-3 to T-0 gap costs nothing: migrateRatingV2.js stamps
 * `seasonPeakElo = max(peakTable[userId] || 0, elo_s0)`, so any player who set a
 * new peak in those three days is covered by their own closing rating, and the
 * invariant `seasonPeakElo >= elo_s0` holds by construction.
 *
 * READ-ONLY with respect to MongoDB. This script never writes to the database.
 * The only thing `--apply` gates is writing the output JSON file to disk.
 *
 * Peaks are in SEASON 0 (old) rating units, the same units as `elo_s0`, because
 * the badge commemorates Season 0. They are NOT run through the v2 conversion.
 *
 * Usage (from project root):
 *   node scripts/exportSeason0Peaks.js                     (dry run — scans, reports, writes nothing)
 *   node scripts/exportSeason0Peaks.js --apply             (write data/season0-peaks.json)
 *   node scripts/exportSeason0Peaks.js --apply --out path/to/peaks.json
 *   node scripts/exportSeason0Peaks.js --limit 50000       (smoke test: scan only 50k stats docs)
 *
 * Flags:
 *   --apply        Required to write the output file. Default is a dry run.
 *   --out <path>   Output path. Default: data/season0-peaks.json
 *   --limit N      Scan only the first N UserStats documents. TESTING ONLY —
 *                  the result is INCOMPLETE and is stamped partial:true, which
 *                  migrateRatingV2.js refuses to use without --allow-partial-peaks.
 *
 * Requires: MONGODB env var (dotenv/.env is loaded).
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import UserStats from '../models/UserStats.js';

const DEFAULT_OUT = path.join('data', 'season0-peaks.json');

function flagValue(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) return fallback;
  return v;
}

export async function run({ apply = false, out = DEFAULT_OUT, limit = null } = {}) {
  const started = Date.now();

  // $limit BEFORE $group so a smoke test actually reads less. That makes the
  // per-user maxima partial by definition, hence the partial flag below.
  const pipeline = [];
  if (limit) pipeline.push({ $limit: limit });
  pipeline.push({
    $group: {
      _id: '$userId',
      peak: { $max: '$elo' },
      n: { $sum: 1 },
    },
  });

  console.log(`[peaks] scanning UserStats${limit ? ` (LIMITED to ${limit} docs — PARTIAL result)` : ' (FULL COLLECTION SCAN)'}...`);

  const cursor = UserStats.aggregate(pipeline)
    .allowDiskUse(true)
    .cursor({ batchSize: 1000 });

  const peaks = Object.create(null);
  let users = 0;
  let statsDocs = 0;
  let skippedNoId = 0;
  let skippedBadPeak = 0;
  let minPeak = Infinity;
  let maxPeak = -Infinity;

  for await (const doc of cursor) {
    statsDocs += doc.n || 0;
    if (doc._id === null || doc._id === undefined || doc._id === '') {
      skippedNoId++;
      continue;
    }
    const peak = Number(doc.peak);
    if (!Number.isFinite(peak)) {
      skippedBadPeak++;
      continue;
    }
    const rounded = Math.round(peak);
    peaks[String(doc._id)] = rounded;
    users++;
    if (rounded < minPeak) minPeak = rounded;
    if (rounded > maxPeak) maxPeak = rounded;
    if (users % 10000 === 0) {
      console.log(`[peaks] ${users} users grouped (${statsDocs} stats docs read, ${Math.round((Date.now() - started) / 1000)}s)`);
    }
  }

  const elapsedMs = Date.now() - started;
  console.log(`\n[peaks] scan complete in ${Math.round(elapsedMs / 1000)}s`);
  console.log(`  users with a peak : ${users}`);
  console.log(`  stats docs read   : ${statsDocs}`);
  console.log(`  peak range        : ${users ? `${minPeak} .. ${maxPeak}` : 'n/a'}`);
  if (skippedNoId) console.log(`  skipped (no userId)     : ${skippedNoId}`);
  if (skippedBadPeak) console.log(`  skipped (non-numeric elo): ${skippedBadPeak}`);

  const payload = {
    generated_at: new Date().toISOString(),
    source: 'UserStats: $group by userId, $max of the absolute elo field',
    statsDocs,
    users,
    minPeak: users ? minPeak : null,
    maxPeak: users ? maxPeak : null,
    partial: Boolean(limit),
    scanLimit: limit || null,
    units: 'season0',
    peaks,
  };

  if (!apply) {
    console.log(`\nDry run — nothing written. Re-run with --apply to write ${out}.`);
    return { ...payload, peaks: undefined, written: false, outPath: out };
  }

  const outPath = path.resolve(process.cwd(), out);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(payload), 'utf8');
  const { size } = await fs.stat(outPath);
  console.log(`\nWrote ${outPath} (${(size / 1024 / 1024).toFixed(2)} MB, ${users} entries).`);
  if (payload.partial) {
    console.log('WARNING: this file is PARTIAL (--limit was used). Do not use it for a real migration.');
  }
  return { ...payload, peaks: undefined, written: true, outPath };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const out = flagValue('--out', DEFAULT_OUT);
  const limitRaw = flagValue('--limit', null);
  const limit = limitRaw === null ? null : Number(limitRaw);
  if (limitRaw !== null && (!Number.isInteger(limit) || limit <= 0)) {
    console.error(`--limit must be a positive integer (got "${limitRaw}")`);
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB;
  if (!mongoUri) {
    console.error('MONGODB env variable not set');
    process.exit(1);
  }

  console.log(`Connecting to MongoDB...${apply ? ' (APPLY MODE — will write the output FILE; Mongo stays read-only)' : ' (dry run — no file written)'}`);
  await mongoose.connect(mongoUri);
  console.log('Connected!\n');
  try {
    await run({ apply, out, limit });
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
