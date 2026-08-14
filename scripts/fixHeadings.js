// Repair the per-location `heading` in the map pool files.
//
// Why: a location that ships without a heading renders facing due NORTH. The
// Maps Embed API's undocumented default is a hardcoded 0 (verified: the embed
// page's init payload carries `[[null,[lat,lng],0,0,...]]` when the heading
// param is absent, and the requested heading when it is present). Nothing in
// the client computes one, so a missing heading is a broken round. A heading
// that points 90 degrees off the street is the same bug with extra steps.
//
// What it does, per location: read the pano's own metadata (photometa), take
// the road directions (link bearings) and the image-centre bearing (the drive
// direction for car coverage), then
//   - no heading            -> fill with the road direction
//   - heading within --tol  -> KEEP IT (respect a deliberate aim)
//   - heading further off   -> snap to whichever road direction is nearest to
//                              it, so which way down the street is preserved
//
// It never deletes, reorders or reshapes a row, never touches panoId (stale
// ids are inert in production and a naive sweep of them deletes playable
// locations — see the July 15 audit), and asserts the row count before it
// writes. Output goes through a temp file + rename.
//
// Usage:
//   node scripts/fixHeadings.js data/world-main.json
//   node scripts/fixHeadings.js data/world-extra.json.gz --missing-only
//   node scripts/fixHeadings.js data/mapOverrides/CY.json --missing-only
//   node scripts/fixHeadings.js data/world-main.json --dry --limit 500
//
// world-extra.json.gz is 4.19M rows (~315MB raw), so give node room:
//   node --max-old-space-size=8192 scripts/fixHeadings.js data/world-extra.json.gz --missing-only
//
// Flags:
//   --missing-only   only touch rows with no heading (no request for the rest)
//   --suspect-only   rows with no heading OR a heading of exactly 0 (the two
//                    ways a location ends up facing north). Cheap: the rest of
//                    the pool measures 98-100% road-aligned already.
//   --tol <deg>      keep an existing heading within this many degrees of a
//                    road direction (default 40)
//   --concurrency N  parallel lookups (default 12)
//   --limit N        stop after N lookups (survey/dry-run aid)
//   --dry            report only, write nothing
//
// Resumable: progress is checkpointed to <file>.headings.progress.json every
// 2000 lookups. Re-run the same command to continue; delete that file to start
// over. Both endpoints are keyless and read-only.

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { pathToFileURL } from 'url';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function parseArgs(args) {
  const flag = (name, def) => {
    const i = args.indexOf('--' + name);
    return i < 0 ? def : args[i + 1];
  };
  const has = (name) => args.includes('--' + name);
  const VALUE_FLAGS = new Set(['tol', 'concurrency', 'limit']);
  const files = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      if (VALUE_FLAGS.has(args[i].slice(2))) i++; // skip its value
      continue;
    }
    files.push(args[i]);
  }
  return {
    files,
    tol: parseFloat(flag('tol', String(DEFAULT_TOL))),
    concurrency: parseInt(flag('concurrency', '12'), 10),
    limit: parseInt(flag('limit', '0'), 10) || Infinity,
    dry: has('dry'),
    missingOnly: has('missing-only'),
    suspectOnly: has('suspect-only'),
  };
}

// ---------------------------------------------------------------- endpoints
const metaUrl = (p) =>
  'https://www.google.com/maps/photometa/v1?authuser=0&hl=en&gl=us&pb=!1m4!1smaps_sv.tactile!11m2!2m1!1b1!2m2!1sen!2sus!3m3!1m2!1e2!2s'
  + encodeURIComponent(p)
  + '!4m57!1e1!1e2!1e3!1e4!1e5!1e6!1e8!1e12!2m1!1e1!4m1!1i48!5m1!1e1!5m1!1e2!6m1!1e1!6m1!1e2!9m36!1m3!1e2!2b1!3e2!1m3!1e2!2b0!3e3!1m3!1e3!2b1!3e2!1m3!1e3!2b0!3e3!1m3!1e8!2b0!3e3!1m3!1e1!2b0!3e3!1m3!1e4!2b0!3e3!1m3!1e10!2b1!3e2!1m3!1e10!2b0!3e3';

const searchUrl = (lat, lng, radius) =>
  `https://maps.googleapis.com/maps/api/js/GeoPhotoService.SingleImageSearch?pb=!1m5!1sapiv3!5sUS!11m2!1m1!1b0!2m4!1m2!3d${lat}!4d${lng}!2d${radius}!3m10!2m2!1sen!2sUS!9m1!1e2!11m4!1m3!1e2!2b1!3e2!4m10!1e1!1e2!1e3!1e4!1e8!1e6!5m1!1e2!6m1!1e2&callback=cb`;

async function getText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}

// Both endpoints answer with the same positional-array protobuf dump. The
// paths below are the ones components/streetview/customStreetView.js reads.
async function photometa(pano) {
  const txt = await getText(metaUrl(pano));
  const root = JSON.parse(txt.replace(/^\)\]\}'/, ''));
  const md = root[1] && root[1][0];
  if (!md || !md[1] || md[1][1] !== pano) return null;
  const pos = md[5][0][1];
  const centre = (pos[2] && typeof pos[2][0] === 'number') ? pos[2][0] : null;
  if (centre === null) return null;
  const links = (md[5][0][6] || [])
    .map((l) => (l && l[1] && typeof l[1][3] === 'number') ? l[1][3] : null)
    .filter((v) => v !== null);
  return { centre, links };
}

async function resolvePano(lat, lng, radius) {
  const txt = await getText(searchUrl(lat, lng, radius));
  if (txt.includes('Search returned no images')) return null;
  const m = txt.match(/"([A-Za-z0-9_-]{22})"/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------- geometry
const norm = (a) => ((a % 360) + 360) % 360;
// Angular DISTANCE in [0, 180]: 0 for equal bearings, 180 for opposite ones.
// ((a-b) % 360 + 540) % 360 maps the signed difference onto [0, 360) shifted
// by 180, so subtracting 180 inside the abs recovers |shortest arc|. Do NOT
// wrap this in `180 -`: that inverts it into a similarity score, and the first
// version of this script shipped exactly that bug — every decide() below then
// picked the FARTHEST road direction, kept backwards headings and snapped
// correct ones, and 5,015 backwards headings reached world-extra.json.gz
// before it was caught (restored from git, Aug 13 2026).
export const angDiff = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180);
export { norm };

export const DEFAULT_TOL = 40;

// Which way should this round face? Prefer a road direction; fall back to the
// image centre when the pano has no links (dead ends, some trekker coverage).
export function decide(current, meta, tol = DEFAULT_TOL) {
  const options = meta.links.length ? meta.links : [meta.centre];
  if (current === null) {
    // No aim to preserve: the drive direction is the best single guess, and it
    // is a road direction on car coverage anyway.
    const best = meta.links.length
      ? options.reduce((a, b) => (angDiff(meta.centre, b) < angDiff(meta.centre, a) ? b : a))
      : meta.centre;
    return { heading: norm(best), reason: 'filled' };
  }
  let nearest = options[0];
  for (const o of options) if (angDiff(current, o) < angDiff(current, nearest)) nearest = o;
  if (angDiff(current, nearest) <= tol) return { heading: null, reason: 'kept' };
  return { heading: norm(nearest), reason: 'snapped' };
}

// ---------------------------------------------------------------- file I/O
const isGz = (f) => f.endsWith('.gz');
const readFile = (f) => JSON.parse(isGz(f) ? zlib.gunzipSync(fs.readFileSync(f)).toString() : fs.readFileSync(f, 'utf8'));
function writeFile(f, data) {
  const json = JSON.stringify(data);
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, isGz(f) ? zlib.gzipSync(json, { level: 9 }) : json);
  fs.renameSync(tmp, f);
}

// Two shapes live in data/: a bare array of locations, and the mapOverrides
// wrapper { customCoordinates: [...] }.
function rowsOf(doc) {
  if (Array.isArray(doc)) return doc;
  if (doc && Array.isArray(doc.customCoordinates)) return doc.customCoordinates;
  return null;
}
const latOf = (r) => (typeof r.lat === 'number' ? r.lat : null);
const lngOf = (r) => (typeof r.lng === 'number' ? r.lng : (typeof r.long === 'number' ? r.long : null));

// ---------------------------------------------------------------- worker
async function lookup(row) {
  let meta = null;
  if (row.panoId) meta = await photometa(row.panoId).catch(() => null);
  if (!meta) {
    const lat = latOf(row), lng = lngOf(row);
    if (lat === null || lng === null) return null;
    // Same ladder the renderer uses: nearest within 50m, then a wider net.
    let pano = await resolvePano(lat, lng, 50).catch(() => null);
    if (!pano) pano = await resolvePano(lat, lng, 1000).catch(() => null);
    if (!pano) return null;
    meta = await photometa(pano).catch(() => null);
  }
  return meta;
}

async function run(file, opts) {
  const { tol, concurrency: CONCURRENCY, limit: LIMIT, dry: DRY, missingOnly: MISSING_ONLY, suspectOnly: SUSPECT_ONLY } = opts;
  console.log(`\n=== ${file} ===`);
  const doc = readFile(file);
  const rows = rowsOf(doc);
  if (!rows) { console.error('  unrecognised shape, skipping'); return; }
  const originalCount = rows.length;
  console.log(`  ${originalCount.toLocaleString()} locations`);

  const progressFile = file + '.headings.progress.json';
  let done = {};
  if (fs.existsSync(progressFile)) {
    try {
      done = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
      console.log(`  resuming: ${Object.keys(done).length.toLocaleString()} already looked up`);
    } catch (e) { done = {}; }
  }

  const todo = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const hasHeading = typeof r.heading === 'number' && isFinite(r.heading);
    if (MISSING_ONLY && hasHeading) continue;
    // A literal 0 is the other way a location ends up facing north: pool files
    // carry 2-3x more of them than chance allows (Cyprus 30x), and a sample of
    // them is far worse aimed than the rest of the pool (58% within 10 degrees
    // of a road against 98% for the pool at large). Suspect mode checks the
    // gaps and the zeros and leaves every other row untouched.
    if (SUSPECT_ONLY && hasHeading && r.heading !== 0) continue;
    if (done[i] !== undefined) continue;
    if (latOf(r) === null || lngOf(r) === null) continue;
    todo.push(i);
    if (todo.length >= LIMIT) break;
  }
  const mode = MISSING_ONLY ? ' (missing heading only)' : SUSPECT_ONLY ? ' (missing or exactly 0)' : '';
  console.log(`  ${todo.length.toLocaleString()} to look up${mode}`);
  if (todo.length === 0) { console.log('  nothing to do'); return; }

  const tally = { kept: 0, snapped: 0, filled: 0, failed: 0 };
  let n = 0, consecutiveFailures = 0;
  const started = Date.now();

  const save = () => {
    if (DRY) return;
    fs.writeFileSync(progressFile + '.tmp', JSON.stringify(done));
    fs.renameSync(progressFile + '.tmp', progressFile);
  };

  const worker = async () => {
    while (todo.length) {
      const i = todo.shift();
      const row = rows[i];
      const current = (typeof row.heading === 'number' && isFinite(row.heading)) ? norm(row.heading) : null;
      const meta = await lookup(row);
      n++;
      if (!meta) {
        tally.failed++;
        // NOT recorded in `done`: the row keeps whatever it had, and a re-run
        // retries it (most failures here are throttling, not dead locations).
        consecutiveFailures++;
        // Back off rather than hammering a throttling endpoint.
        if (consecutiveFailures > 0 && consecutiveFailures % 40 === 0) {
          console.warn(`  ${consecutiveFailures} failures in a row, pausing 20s`);
          await new Promise((r) => setTimeout(r, 20000));
        }
      } else {
        consecutiveFailures = 0;
        const d = decide(current, meta, tol);
        tally[d.reason]++;
        done[i] = d.heading === null ? null : Math.round(d.heading);
      }
      if (n % 2000 === 0) {
        const rate = (n / ((Date.now() - started) / 1000)).toFixed(1);
        console.log(`  ${n.toLocaleString()}/${(n + todo.length).toLocaleString()} (${rate}/s) kept ${tally.kept} snapped ${tally.snapped} filled ${tally.filled} failed ${tally.failed}`);
        save();
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  save();

  let changed = 0;
  for (const [k, h] of Object.entries(done)) {
    if (h === null || h === undefined) continue; // kept as-is
    const row = rows[Number(k)];
    if (!row) continue;
    if (row.heading === h) continue;
    row.heading = h;
    changed++;
  }

  console.log(`  looked up ${n.toLocaleString()} in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  console.log(`  kept ${tally.kept.toLocaleString()}  snapped ${tally.snapped.toLocaleString()}  filled ${tally.filled.toLocaleString()}  failed ${tally.failed.toLocaleString()}`);
  console.log(`  rows changed: ${changed.toLocaleString()}`);

  if (DRY) { console.log('  --dry: nothing written'); return; }
  if (rows.length !== originalCount) {
    console.error(`  ABORT: row count changed ${originalCount} -> ${rows.length}, refusing to write`);
    process.exit(1);
  }
  if (changed === 0) { console.log('  no writes needed'); return; }
  writeFile(file, doc);
  console.log(`  wrote ${file}`);
  if (tally.failed > 0) console.log(`  re-run the same command to retry the ${tally.failed} failed lookups`);
  console.log(`  delete ${path.basename(progressFile)} to force a full re-sweep later`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.files.length === 0) {
    console.error('Usage: node scripts/fixHeadings.js <file.json|file.json.gz> [--missing-only] [--tol 40] [--concurrency 12] [--limit N] [--dry]');
    process.exit(1);
  }
  for (const f of opts.files) {
    const full = path.isAbsolute(f) ? f : path.join(process.cwd(), f);
    if (!fs.existsSync(full)) { console.error(`missing file: ${f}`); continue; }
    await run(full, opts);
  }
}

// Importable for tests (test/fixHeadings.test.js pins the geometry); the CLI
// only runs when this file is the entry point.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
