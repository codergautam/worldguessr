// Delete genuinely broken locations from the map pool files, and nothing else.
//
// Wraps mapcheckr-cli. Three things make a naive `mapcheckr --worldguessr`
// run dangerous on these files, so this script exists to defuse all three:
//
// 1. THE PANOID TRAP. lib/svreq.js looks a location up BY ID when it carries a
//    panoId, and --radius only applies to locations without one. Our stored
//    panoIds are stale by design (production resolves by lat/lng and never
//    reads them), so a by-id run reports ~24% of world-main as SV_NOT_FOUND
//    when 1,708 of 1,710 sampled rejects had official coverage within 50m.
//    That is a 35,000-location false delete. This script STRIPS panoId before
//    checking, so every row is a lat/lng search at radius 50 — exactly how
//    production resolves a round — and writes the fresh id back afterwards.
//
// 2. THE --worldguessr PRESET REWRITES HEADINGS. It sets heading.filterBy all
//    true with directionBy "link", which overwrites every heading with
//    res.links[0], the first arrow in the list rather than the one the map
//    maker aimed at. Measured, the pools are already 97-100% within 10 degrees
//    of a road, so that trade is a pure loss. This script passes no
//    --heading-for-* flag at all, so mapcheckr leaves headings alone. It also
//    leaves pitch alone (the preset's removePitch deletes the field).
//
// 3. A NETWORK ERROR IS A REJECTION. cli.js tags an exhausted retry as reason
//    OTHER and drops the row. This script re-checks every rejected row in a
//    second pass and NEVER deletes on OTHER, so a flaky minute cannot cost
//    real locations.
//
// Everything it keeps is byte-identical to the input except panoId, and it
// asserts that before writing. Deleted rows are dumped to <file>.deleted.json
// with their reason so a bad run can be reversed.
//
// Usage:
//   node scripts/pruneInvalidLocations.js data/world-main.json
//   node scripts/pruneInvalidLocations.js data/world-main.json --dry
//   node scripts/pruneInvalidLocations.js data/mapOverrides/CY.json --keep-isolated
//   node scripts/pruneInvalidLocations.js data/world-extra.json.gz --heap 8192
//
// Flags:
//   --dry             report only, write nothing
//   --keep-isolated   keep panoramas with no navigation arrows (default is to
//                     drop them, matching the --worldguessr preset)
//   --keep-unofficial keep user photospheres that have no official pano nearby
//   --dedupe          also drop locations within 10m of another one
//   --concurrency N   pin mapcheckr concurrency (default: its own auto-tune)
//   --heap N          MB of heap for the mapcheckr child (default 4096)

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import os from 'os';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';

const CHECKER = path.join(process.cwd(), 'node_modules', 'mapcheckr-cli', 'cli.js');

// ---------------------------------------------------------------- file I/O
const isGz = (f) => f.endsWith('.gz');
const readFile = (f) => JSON.parse(isGz(f) ? zlib.gunzipSync(fs.readFileSync(f)).toString() : fs.readFileSync(f, 'utf8'));
function writeFile(f, data) {
  const json = JSON.stringify(data);
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, isGz(f) ? zlib.gzipSync(json, { level: 9 }) : json);
  fs.renameSync(tmp, f);
}
function rowsOf(doc) {
  if (Array.isArray(doc)) return doc;
  if (doc && Array.isArray(doc.customCoordinates)) return doc.customCoordinates;
  return null;
}
function setRows(doc, rows) {
  if (Array.isArray(doc)) return rows;
  return { ...doc, customCoordinates: rows };
}
const latOf = (r) => (typeof r.lat === 'number' ? r.lat : null);
const lngOf = (r) => (typeof r.lng === 'number' ? r.lng : (typeof r.long === 'number' ? r.long : null));

// Reasons that mean "this location cannot serve a round". OTHER is absent on
// purpose: it is the network bucket, never evidence about the location.
const FATAL = new Set(['SV_NOT_FOUND', 'UNOFFICIAL', 'NO_DESCRIPTION', 'WRONG_GENERATION', 'OUT_OF_DATE_RANGE', 'ISOLATED']);

// ---------------------------------------------------------------- checker
function runChecker(rows, opts, tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-'));
  const inFile = path.join(dir, 'in.json');
  const outFile = path.join(dir, 'out.json');
  const rejFile = path.join(dir, 'rej.json');
  fs.writeFileSync(inFile, JSON.stringify(rows));

  const args = [
    `--max-old-space-size=${opts.heap}`,
    CHECKER,
    inFile,
    '-o', outFile,
    '-r', rejFile,
    // Every row arrives without a panoId, so this is the radius that decides
    // liveness. 50m is what components/streetview/customStreetView.js uses.
    '--radius', '50',
    // The preset's coverage policy: any generation, any date since 2008.
    // The ceiling is explicit because mapcheckr defaults --to to the CURRENT
    // month, and Date.parse("2026-08") is the 1st: imagery published earlier
    // this month reads as OUT_OF_DATE_RANGE and gets deleted for being too
    // new. That cost 4 world-main rows on the first dry run.
    '--gen1', '--gen23', '--gen4', '--from', '2008-01', '--to', '2099-12',
    // Photospheres are swapped for the nearest official pano where one exists.
    '--change-to-official',
    '--update-pano-ids',
    '--retries', '3',
    '--quiet',
  ];
  if (opts.keepUnofficial) args.push('--no-reject-unofficial');
  if (opts.keepIsolated) args.push('--no-reject-no-links');
  if (opts.dedupe) args.push('--remove-nearby', '--nearby-radius', '10');
  if (opts.concurrency) args.push('-c', String(opts.concurrency));

  const started = Date.now();
  const res = spawnSync(process.execPath, args, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (res.status !== 0) throw new Error(`mapcheckr exited ${res.status} on ${tag}`);

  const survivors = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  const rejected = fs.existsSync(rejFile) ? JSON.parse(fs.readFileSync(rejFile, 'utf8')) : [];
  fs.rmSync(dir, { recursive: true, force: true });
  return { survivors, rejected, seconds: (Date.now() - started) / 1000 };
}

// ---------------------------------------------------------------- per file
function prune(file, opts) {
  console.log(`\n=== ${file} ===`);
  const doc = readFile(file);
  const rows = rowsOf(doc);
  if (!rows) { console.error('  unrecognised shape, skipping'); return; }
  console.log(`  ${rows.length.toLocaleString()} locations`);

  // __i is the only field this script adds. mapcheckr copies unknown keys
  // through on both the survivor and the reject side, so it survives the round
  // trip and is how each result finds its way home.
  const checkable = [];
  const unlocatable = new Set();
  const headingsBefore = rows.map((r) => r.heading);
  for (let i = 0; i < rows.length; i++) {
    const lat = latOf(rows[i]), lng = lngOf(rows[i]);
    if (lat === null || lng === null) { unlocatable.add(i); continue; }
    // heading rides along because svreq's isPanned gate reads it. panoId does
    // NOT: see the panoId trap at the top of this file.
    checkable.push({ lat, lng, heading: rows[i].heading, __i: i });
  }
  if (unlocatable.size) console.log(`  ${unlocatable.size} rows have no usable lat/lng, left untouched`);

  const pass1 = runChecker(checkable, opts, path.basename(file));
  console.log(`  pass 1: ${pass1.survivors.length.toLocaleString()} ok, ${pass1.rejected.length.toLocaleString()} rejected in ${pass1.seconds.toFixed(0)}s`);

  const verdict = new Map();   // __i -> { keep, reason, panoId }
  for (const s of pass1.survivors) verdict.set(s.__i, { keep: true, panoId: s.panoId });
  for (const r of pass1.rejected) verdict.set(r.__i, { keep: false, reason: r.reason });

  // Pass 2: everything pass 1 rejected gets one more honest look. Google
  // throttles, and a rejection built on a timeout is not evidence.
  if (pass1.rejected.length) {
    const retry = pass1.rejected.map((r) => ({ lat: r.lat, lng: r.lng, heading: r.heading, __i: r.__i }));
    const pass2 = runChecker(retry, opts, path.basename(file) + ' (recheck)');
    let rescued = 0;
    for (const s of pass2.survivors) { verdict.set(s.__i, { keep: true, panoId: s.panoId }); rescued++; }
    for (const r of pass2.rejected) verdict.set(r.__i, { keep: false, reason: r.reason });
    console.log(`  pass 2: rechecked ${retry.length.toLocaleString()}, rescued ${rescued.toLocaleString()} in ${pass2.seconds.toFixed(0)}s`);
  }

  // Tally, and decide. A row absent from both result files was dropped by
  // mapcheckr's own nearby-dedupe, which reports a count but not the rows.
  const counts = {};
  const keptIdx = [];
  const deleted = [];
  for (let i = 0; i < rows.length; i++) {
    const v = verdict.get(i);
    if (!v) {
      // unlocatable rows, and dedupe drops when --dedupe is on
      if (unlocatable.has(i)) { keptIdx.push(i); continue; }
      counts.DUPLICATE = (counts.DUPLICATE || 0) + 1;
      deleted.push({ ...rows[i], reason: 'DUPLICATE' });
      continue;
    }
    if (v.keep) {
      if (v.panoId && typeof v.panoId === 'string') rows[i].panoId = v.panoId;
      keptIdx.push(i);
      continue;
    }
    // Never delete on a network bucket, no matter how many passes hit it.
    if (!FATAL.has(v.reason)) {
      counts['KEPT_' + (v.reason || 'UNKNOWN')] = (counts['KEPT_' + (v.reason || 'UNKNOWN')] || 0) + 1;
      keptIdx.push(i);
      continue;
    }
    counts[v.reason] = (counts[v.reason] || 0) + 1;
    deleted.push({ ...rows[i], reason: v.reason });
  }
  const kept = keptIdx.map((i) => rows[i]);

  console.log(`  keep ${kept.length.toLocaleString()}  delete ${deleted.length.toLocaleString()}`);
  for (const [reason, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${reason.padEnd(22)} ${n.toLocaleString()}`);
  }

  // ------------------------------------------------------------ assertions
  if (kept.length + deleted.length !== rows.length) {
    console.error(`  ABORT: ${kept.length} + ${deleted.length} != ${rows.length}`);
    process.exit(1);
  }
  // The heading work this run sits on top of must come through untouched.
  for (const i of keptIdx) {
    if (rows[i].heading !== headingsBefore[i]) {
      console.error(`  ABORT: row ${i} heading changed ${headingsBefore[i]} -> ${rows[i].heading}`);
      process.exit(1);
    }
  }
  if (deleted.length / rows.length > 0.10) {
    console.error(`  ABORT: ${(100 * deleted.length / rows.length).toFixed(1)}% would be deleted. That is the shape of a`);
    console.error('         systematic false-reject (see the panoId trap), not a dead-location rate.');
    console.error('         Inspect before overriding.');
    process.exit(1);
  }

  if (opts.dry) { console.log('  --dry: nothing written'); return; }
  if (deleted.length === 0) { console.log('  nothing to delete'); return; }
  fs.writeFileSync(file + '.deleted.json', JSON.stringify(deleted, null, 1));
  writeFile(file, setRows(doc, kept));
  console.log(`  wrote ${file}`);
  console.log(`  deleted rows saved to ${path.basename(file)}.deleted.json`);

  // fixHeadings.js checkpoints by ROW INDEX, and deleting rows shifts every
  // index after the first gap. A stale checkpoint would then write headings
  // onto the wrong locations, so it goes with the prune.
  const progressFile = file + '.headings.progress.json';
  if (fs.existsSync(progressFile)) {
    fs.unlinkSync(progressFile);
    console.log(`  dropped ${path.basename(progressFile)} (row indices shifted)`);
  }
}

// ---------------------------------------------------------------- cli
function parseArgs(args) {
  const has = (n) => args.includes('--' + n);
  const val = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
  const VALUE_FLAGS = new Set(['concurrency', 'heap']);
  const files = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) { if (VALUE_FLAGS.has(args[i].slice(2))) i++; continue; }
    files.push(args[i]);
  }
  return {
    files,
    dry: has('dry'),
    keepIsolated: has('keep-isolated'),
    keepUnofficial: has('keep-unofficial'),
    dedupe: has('dedupe'),
    concurrency: val('concurrency', null),
    heap: parseInt(val('heap', '4096'), 10),
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.files.length) {
    console.error('Usage: node scripts/pruneInvalidLocations.js <file.json|file.json.gz> [--dry] [--keep-isolated] [--keep-unofficial] [--dedupe] [--concurrency N] [--heap MB]');
    process.exit(1);
  }
  if (!fs.existsSync(CHECKER)) {
    console.error(`mapcheckr-cli not found at ${CHECKER} — run pnpm install`);
    process.exit(1);
  }
  for (const f of opts.files) {
    const full = path.isAbsolute(f) ? f : path.join(process.cwd(), f);
    if (!fs.existsSync(full)) { console.error(`missing file: ${f}`); continue; }
    prune(full, opts);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}

export { FATAL, rowsOf, setRows };
