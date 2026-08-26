// ChinaGuessr (temporary): build the Baidu-panorama pool.
//
// Usage: node scripts/generateChinaLocations.js 3000
//
// Random point inside the CN border polygon -> Baidu qsdata (nearest pano to
// a BD09MC point) -> reject if the snap moved more than ACCEPT_RADIUS_KM (so
// the pool's density follows coverage instead of piling up at its edges) ->
// sdata for type/obsolete/user filters -> country check (CN/HK/MO only; a
// border snap into RU/VN/KZ/TW is dropped) -> datum: mainland rows are stored
// in GCJ-02 because Google's road tiles inside China are GCJ-02 shifted and
// that is what puts the answer pin on the drawn road; HK/MO stay WGS-84.
//
// Sampling: pure uniform-over-China snaps ~2% of probes (Tibet, Xinjiang and
// Inner Mongolia eat most of them), so once a few rows exist, SEED_SHARE of
// the samples jitter 3-25 km around a row already found. Coverage clusters
// along road networks, so this finds neighbours at ~10x the rate while the
// uniform share keeps discovering new regions.
//
// Even spread: the pool is stratified on a 1-degree grid. Each cell holds at
// most CELL_CAP rows, and a seed is picked by choosing an under-cap CELL at
// random and then a row inside it, never a row at random over the whole pool
// (that snowballed: the Yangtze delta had the most rows, so it got the most
// seeds, so it got more rows). Existing rows are thinned to the cap on load.
// Writes every 100 rows.
//
// No heading is stored: the renderer opens on the image centre (the vehicle's
// forward view, see components/china/baidu.js centerBearingDeg), which keeps
// the heading calibration in one place.
//
// Output: data/china-baidu.json, a bare array like the other pool files
// ({lat, lng, panoId, country, street}). server.js loads it at boot.

import fs from 'fs';
import path from 'path';
import gcoord from 'gcoord';
import lookup from 'coordinate_to_country';
import { getRandomPointInCountry } from '../components/randomLoc.server.js';
import { qsdataUrl, sdataUrl, parseSdata } from '../components/china/baidu.js';

const WORKERS = 8;
const ACCEPT_RADIUS_KM = 2.5;
const MAX_CONSECUTIVE_MISSES = 2000;
const SEED_SHARE = 0.5;          // share of samples jittered around a known row
const SEED_MIN_ROWS = 40;        // uniform only until this many rows exist
const SEED_JITTER_KM = [3, 25];
const CELL_CAP = 10;             // max rows per 1-degree cell (~100 x 90 km)
const WRITE_EVERY = 100;
const OUT_FILE = path.join(process.cwd(), 'data', 'china-baidu.json');

const target = parseInt(process.argv[2], 10);
if (!Number.isFinite(target) || target <= 0) {
  console.error('Usage: node scripts/generateChinaLocations.js 3000');
  process.exit(1);
}

const haversineKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371, d = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * d / 2) ** 2
    + Math.cos(lat1 * d) * Math.cos(lat2 * d) * Math.sin((lon2 - lon1) * d / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// null on any failure (socket reset, non-JSON body = Baidu pushing back); the
// caller treats null as a miss and backs off instead of dying mid-run.
async function getJson(url) {
  try {
    const res = await fetch(url);
    return JSON.parse(await res.text());
  } catch {
    return null;
  }
}

const key = (lat, lng) => `${lat.toFixed(3)},${lng.toFixed(3)}`; // ~100 m grid
const cellOf = (lat, lng) => `${Math.floor(lat)},${Math.floor(lng)}`;

// Thin existing rows to CELL_CAP per cell (random keep) so a re-run repairs
// an uneven pool instead of preserving it.
const loaded = fs.existsSync(OUT_FILE) ? JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')) : [];
const cells = new Map(); // cell -> rows (existing + accepted)
const existing = [];
for (const l of loaded.sort(() => Math.random() - 0.5)) {
  const c = cellOf(l.lat, l.lng);
  const rows = cells.get(c) || [];
  if (rows.length >= CELL_CAP) continue;
  rows.push(l); cells.set(c, rows); existing.push(l);
}
const seen = new Set(existing.map((l) => key(l.lat, l.lng)));
const seenIds = new Set(existing.map((l) => l.panoId));
console.log(`Loaded ${loaded.length} rows, kept ${existing.length} after the ${CELL_CAP}/cell cap (${cells.size} cells)`);

const accepted = [];
let probes = 0, misses = 0, hits = 0, seeded = 0, capped = 0, lastWrite = 0;
const started = Date.now();

const writeOut = () => {
  const all = existing.concat(accepted);
  fs.writeFileSync(OUT_FILE, JSON.stringify(all));
  return all;
};

// Uniform over the border polygon, or a jitter around a known row picked
// cell-first (every under-cap cell is equally likely to seed, however many
// rows it holds). The datum mix-up of a few hundred metres is irrelevant at
// this radius.
const sample = () => {
  const known = existing.length + accepted.length;
  if (known >= SEED_MIN_ROWS && Math.random() < SEED_SHARE) {
    const open = [...cells.values()].filter((rows) => rows.length < CELL_CAP);
    if (!open.length) return getRandomPointInCountry('CN');
    const rows = open[Math.floor(Math.random() * open.length)];
    const seed = rows[Math.floor(Math.random() * rows.length)];
    const km = SEED_JITTER_KM[0] + Math.random() * (SEED_JITTER_KM[1] - SEED_JITTER_KM[0]);
    const brg = Math.random() * 2 * Math.PI;
    const dLat = (km * Math.cos(brg)) / 111.32;
    const dLng = (km * Math.sin(brg)) / (111.32 * Math.cos(seed.lat * Math.PI / 180));
    seeded++;
    return [seed.lat + dLat, seed.lng + dLng];
  }
  return getRandomPointInCountry('CN');
};

const worker = async () => {
  while (accepted.length < target && misses < MAX_CONSECUTIVE_MISSES) {
    const point = sample();
    if (!point) { misses++; continue; }
    const [lat, lng] = point;
    probes++;

    const [x, y] = gcoord.transform([lng, lat], gcoord.WGS84, gcoord.BD09MC);
    const q = await getJson(qsdataUrl(x, y));
    if (!q) { await sleep(5000); misses++; continue; }
    const hit = q.content && q.content.id ? q.content : null;
    if (!hit) { misses++; await sleep(200); continue; }
    hits++;

    const [snapLng, snapLat] = gcoord.transform([hit.x / 100, hit.y / 100], gcoord.BD09MC, gcoord.WGS84);
    if (haversineKm(lat, lng, snapLat, snapLng) > ACCEPT_RADIUS_KM) { misses++; continue; }
    if (seenIds.has(hit.id)) { misses++; continue; }

    const meta = parseSdata(await getJson(sdataUrl(hit.id)));
    if (!meta || meta.type !== 'street' || meta.obsolete || meta.userUploaded || meta.maxZ < 3) { misses++; continue; }

    const [wgsLng, wgsLat] = gcoord.transform([meta.x, meta.y], gcoord.BD09MC, gcoord.WGS84);
    const resolved = lookup(wgsLat, wgsLng, true);
    const country = resolved && resolved[0];
    if (!['CN', 'HK', 'MO'].includes(country)) { misses++; continue; }

    const [outLng, outLat] = country === 'CN'
      ? gcoord.transform([wgsLng, wgsLat], gcoord.WGS84, gcoord.GCJ02)
      : [wgsLng, wgsLat];
    const k = key(outLat, outLng);
    if (seen.has(k)) { misses++; continue; }
    const cell = cellOf(outLat, outLng);
    const cellRows = cells.get(cell) || [];
    if (cellRows.length >= CELL_CAP) { capped++; continue; } // full cell: not a miss, the endpoint is fine

    misses = 0;
    seen.add(k);
    seenIds.add(meta.id);
    const row = { lat: +outLat.toFixed(6), lng: +outLng.toFixed(6), panoId: meta.id, country };
    if (meta.street) row.street = meta.street;
    accepted.push(row);
    cellRows.push(row); cells.set(cell, cellRows);
    if (accepted.length % 25 === 0 || accepted.length === target) {
      const mins = (Date.now() - started) / 60000;
      console.log(`${accepted.length}/${target} (${probes} probes, ${seeded} seeded, ${hits} snaps, ${capped} capped, ${cells.size} cells, ${(100 * accepted.length / probes).toFixed(1)}% accepted, ~${(accepted.length / mins).toFixed(0)}/min)`);
    }
    if (accepted.length - lastWrite >= WRITE_EVERY) { lastWrite = accepted.length; writeOut(); }
    await sleep(150);
  }
};

await Promise.all(Array.from({ length: WORKERS }, worker));

if (misses >= MAX_CONSECUTIVE_MISSES) {
  console.warn(`Stopped after ${MAX_CONSECUTIVE_MISSES} consecutive misses (endpoint down or throttling?)`);
}

const all = writeOut();
const byCountry = all.reduce((m, l) => { m[l.country] = (m[l.country] || 0) + 1; return m; }, {});
const sizes = [...cells.values()].map((r) => r.length).sort((a, b) => b - a);
console.log(`Wrote ${all.length} rows to ${OUT_FILE}`, byCountry, `${cells.size} cells, max/cell ${sizes[0]}, median ${sizes[Math.floor(sizes.length / 2)]}`);
