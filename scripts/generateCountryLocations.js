// Batch-generate validated Street View locations for official country maps.
//
// Usage: node scripts/generateCountryLocations.js US=5000 EG=500
//
// For each country: random point inside the border polygon -> probe Google's
// SingleImageSearch for a pano within 1km (same endpoint the live fallback
// uses; a no-description pano is rejected there as trekker coverage) ->
// verify the snapped pano didn't land across a border -> dedupe against every
// existing pool file and this run -> append to data/world-extra.json.
//
// cron.js imports world-extra.json into the country pools, so new locations
// go live on the next cron.js restart. Countries with a data/mapOverrides
// file are served from that file instead and are skipped here.

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { getRandomPointInCountry } from '../components/randomLoc.server.js';
import { hasStreetViewImage } from '../components/findLatLongServer.js';
import lookup from 'coordinate_to_country';

const WORKERS = 15;
const PROBE_RADIUS_M = 1000;
// If this many probes in a row find nothing, the endpoint is down or
// throttling us — bail instead of spinning forever.
const MAX_CONSECUTIVE_MISSES = 500;

// Gzipped: the merged pool is far past GitHub's 100MB single-file cap raw.
const OUT_FILE = path.join(process.cwd(), 'data', 'world-extra.json.gz');
const readGz = (f) => JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString());
const POOL_FILES = ['world-main.json', 'world-arbitrary.json', 'world-pinpointable.json', 'diverse-locations.json'];

const targets = process.argv.slice(2).map((arg) => {
  const [country, count] = arg.split('=');
  return { country: country.toUpperCase(), count: parseInt(count, 10) };
});
if (targets.length === 0 || targets.some((t) => !t.country || !Number.isFinite(t.count) || t.count <= 0)) {
  console.error('Usage: node scripts/generateCountryLocations.js US=5000 EG=500');
  process.exit(1);
}

const overrideCountries = fs.readdirSync(path.join(process.cwd(), 'data', 'mapOverrides'))
  .filter((f) => f.endsWith('.json')).map((f) => f.split('.')[0]);

const key = (lat, lng) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

// Existing coords per country, so reruns and overlapping pools never dupe.
const seen = new Set();
const existing = fs.existsSync(OUT_FILE) ? readGz(OUT_FILE) : [];
for (const file of POOL_FILES) {
  const full = path.join(process.cwd(), 'data', file);
  if (!fs.existsSync(full)) continue;
  for (const loc of JSON.parse(fs.readFileSync(full, 'utf8'))) {
    if (loc.lat != null && loc.lng != null) seen.add(key(loc.lat, loc.lng));
  }
}
for (const loc of existing) {
  if (loc.lat != null && loc.lng != null) seen.add(key(loc.lat, loc.lng));
}
console.log(`Loaded ${seen.size.toLocaleString()} existing coords for dedupe`);
const generated = [];
let probes = 0;

for (const { country, count } of targets) {
  if (overrideCountries.includes(country)) {
    console.warn(`${country}: served from data/mapOverrides/${country}.json — add coords there instead, skipping`);
    continue;
  }
  if (!getRandomPointInCountry(country)) {
    console.warn(`${country}: no border polygon found, skipping`);
    continue;
  }

  const accepted = [];
  let misses = 0;
  const started = Date.now();

  const worker = async () => {
    while (accepted.length < count && misses < MAX_CONSECUTIVE_MISSES) {
      const point = getRandomPointInCountry(country);
      probes++;
      const hit = await hasStreetViewImage(point[0], point[1], PROBE_RADIUS_M);
      if (!hit) { misses++; continue; }

      const resolved = lookup(hit.lat, hit.long, true);
      if (!resolved || resolved[0] !== country) { misses++; continue; }

      const k = key(hit.lat, hit.long);
      if (seen.has(k)) { misses++; continue; }

      misses = 0;
      seen.add(k);
      accepted.push({ lat: hit.lat, lng: hit.long, country });
      if (accepted.length % 25 === 0 || accepted.length === count) {
        const rate = (accepted.length / ((Date.now() - started) / 60000)).toFixed(0);
        console.log(`${country}: ${accepted.length}/${count} (${probes} probes, ~${rate}/min)`);
      }
    }
  };

  await Promise.all(Array.from({ length: WORKERS }, worker));

  if (misses >= MAX_CONSECUTIVE_MISSES) {
    console.error(`${country}: aborted after ${MAX_CONSECUTIVE_MISSES} consecutive misses (endpoint down/throttled or coverage exhausted) — keeping the ${accepted.length} found so far`);
  }
  generated.push(...accepted.slice(0, count));
}

fs.writeFileSync(OUT_FILE, zlib.gzipSync(JSON.stringify([...existing, ...generated]), { level: 9 }));
console.log(`\nWrote ${generated.length} new locations (${existing.length} already in file) -> ${OUT_FILE}`);
console.log('Restart cron.js to serve them.');
