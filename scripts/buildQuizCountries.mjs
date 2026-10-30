// Regenerates shared/modes/data/countries.js: the country pool for the Flags
// and Shapes quizzes. Run: node scripts/buildQuizCountries.mjs
//
// Why a generated module and not the JSONs it is built from: shared/ cannot
// import public/*.json (Metro only watches /shared and /public/locales, and
// plain Node ESM needs import attributes for JSON), and the pool needs facts
// none of the JSONs hold: a label point that is INSIDE the polygon (seven
// countryCoordinates centroids are not), a difficulty tier, and whether the
// silhouette is recognisable. test/modesCatalog.test.js checks every entry
// against modes/countries.json, so a stale file fails the suite.
//
// Pool = UN members plus VA, PS, TW, XK, intersected with the shapes in
// public/modes/countries.json. Not public/countries.json (93 codes: that is the
// Street View coverage list and lacks CN, EG, SA, IR, PK, CU, VE, KP), not
// serverUtils/timezoneToCountry.js (249 codes, includes Antarctica and
// uninhabited islands).

import fs from 'node:fs';
import path from 'node:path';
import { buildCountryIndex, pointInCountry } from '../shared/country/findCountry.js';
import { polygonsOf, primaryCluster, clusterShare, totalArea } from '../shared/modes/outline.js';
import { loadNaturalEarth, neFeaturesByCode } from './modes/naturalEarth.mjs';

// The globe's own polygons (scripts/modes/buildGlobeCountries.mjs): label
// points must sit inside the shape that gets clicked and scored.
const borders = JSON.parse(fs.readFileSync(path.resolve('public/modes/countries.json'), 'utf8'));
const centroids = JSON.parse(fs.readFileSync(path.resolve('public/countryCoordinates.json'), 'utf8'));
// Areas and landmass shares from the unsimplified Natural Earth source.
const ne = neFeaturesByCode(await loadNaturalEarth());
const out = path.resolve('shared/modes/data/countries.js');

// Geographic continent per code. continentMapping.json covers only 98 codes,
// so this table is the source of truth for the pool.
const CONTINENT = {
  Africa: 'DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW',
  Asia: 'AF AM AZ BH BD BT BN KH CN CY GE IN ID IR IQ IL JP JO KZ KW KG LA LB MY MV MN MM NP KP OM PK PH QA SA SG KR LK SY TJ TH TL TR TM AE UZ VN YE TW PS',
  Europe: 'AL AD AT BY BE BA BG HR CZ DK EE FI FR DE GR HU IS IE IT LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB VA XK',
  'North America': 'AG BS BB BZ CA CR CU DM DO SV GD GT HT HN JM MX NI PA KN LC VC TT US',
  'South America': 'AR BO BR CL CO EC GY PY PE SR UY VE',
  Oceania: 'AU FJ KI MH FM NR NZ PW PG WS SB TO TV VU',
};

// Area thresholds in km^2 for the difficulty tier. Tier 1 is big enough to
// find at world zoom, tier 3 needs zooming in (micro-states, small islands).
const TIER1_KM2 = 100_000;
const TIER2_KM2 = 10_000;
// A silhouette is only a fair clue when most of the country is in one piece.
const SHAPE_MIN_SHARE = 0.5;

const index = buildCountryIndex(borders);
const featuresByCode = new Map();
for (const f of borders.features) {
  const code = f.properties?.code;
  if (!code) continue;
  if (!featuresByCode.has(code)) featuresByCode.set(code, []);
  featuresByCode.get(code).push(f);
}

function ringCentroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += cross;
    cx += (ring[j][0] + ring[i][0]) * cross;
    cy += (ring[j][1] + ring[i][1]) * cross;
  }
  if (a === 0) return [ring[0][0], ring[0][1]];
  a /= 2;
  return [cx / (6 * a), cy / (6 * a)];
}

// Distance from (x, y) to the nearest vertex of the ring: a cheap stand-in for
// "how far inside am I" when choosing among candidate label points.
function clearance(x, y, ring) {
  let best = Infinity;
  for (const [vx, vy] of ring) {
    const d = (vx - x) ** 2 + (vy - y) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

// The stored centroid when it is inside the country, otherwise the best inside
// point of the largest polygon: its own centroid, its bbox centre, or the
// grid sample with the most clearance from the border.
function labelPoint(code) {
  const c = centroids[code];
  if (c && pointInCountry(index, c.lat, c.lng, code)) return { lat: c.lat, long: c.lng, fromCentroid: true };
  const { polygons, shifted } = polygonsOf(featuresByCode.get(code));
  const main = primaryCluster(polygons).sort((a, b) => b.area - a.area)[0];
  const unshift = (x) => (shifted && x > 180 ? x - 360 : x);
  const candidates = [ringCentroid(main.ring), [
    (main.bbox.minX + main.bbox.maxX) / 2,
    (main.bbox.minY + main.bbox.maxY) / 2,
  ]];
  const N = 12;
  for (let i = 1; i < N; i++) {
    for (let j = 1; j < N; j++) {
      candidates.push([
        main.bbox.minX + (main.bbox.maxX - main.bbox.minX) * (i / N),
        main.bbox.minY + (main.bbox.maxY - main.bbox.minY) * (j / N),
      ]);
    }
  }
  let best = null;
  for (const [x, y] of candidates) {
    if (!pointInCountry(index, y, unshift(x), code)) continue;
    const score = clearance(x, y, main.ring);
    if (!best || score > best.score) best = { x, y, score };
  }
  if (!best) throw new Error(`${code}: no inside label point found`);
  return { lat: round(best.y), long: round(unshift(best.x)), fromCentroid: false };
}

const round = (n) => Math.round(n * 1000) / 1000;

const rows = [];
const skipped = [];
for (const [continent, list] of Object.entries(CONTINENT)) {
  for (const code of list.split(/\s+/)) {
    const features = featuresByCode.get(code);
    if (!features) { skipped.push(`${code} (no polygon)`); continue; }
    const neFeatures = ne.get(code);
    if (!neFeatures) { skipped.push(`${code} (no Natural Earth feature)`); continue; }
    const area = totalArea(neFeatures);
    const tier = area >= TIER1_KM2 ? 1 : area >= TIER2_KM2 ? 2 : 3;
    const share = clusterShare(neFeatures);
    const point = labelPoint(code);
    if (!centroids[code]) skipped.push(`${code} (no centroid, derived)`);
    rows.push({
      code,
      lat: point.lat,
      long: point.long,
      continent,
      tier,
      shapeOk: tier <= 2 && share >= SHAPE_MIN_SHARE,
    });
    if (!point.fromCentroid) console.log(`[quizCountries] ${code}: centroid outside polygon, label point derived`);
  }
}
rows.sort((a, b) => a.code.localeCompare(b.code));

const body = `// GENERATED by scripts/buildQuizCountries.mjs from
// public/modes/countries.json, public/countryCoordinates.json and Natural
// Earth 1:50m. Do not edit by hand; rerun the script.
//
// lat/long is a LABEL POINT inside the globe polygon (not always the centroid:
// see the script), tier is by area (1 >= 100k km^2, 2 >= 10k, 3 smaller),
// shapeOk means the main landmass holds at least half the area so a
// silhouette is a fair clue. Every row has a polygon in modes/countries.json
// (globe + scoring) and a Natural Earth feature (shapes).
export const QUIZ_COUNTRIES = ${JSON.stringify(rows, null, 2)};

export const QUIZ_COUNTRY_BY_CODE = Object.fromEntries(QUIZ_COUNTRIES.map((c) => [c.code, c]));
`;
fs.writeFileSync(out, body);
const tiers = [1, 2, 3].map((t) => rows.filter((r) => r.tier === t).length);
console.log(`[quizCountries] wrote ${rows.length} countries (tiers ${tiers.join('/')}, shapeOk ${rows.filter((r) => r.shapeOk).length}) to ${out}`);
if (skipped.length) console.log(`[quizCountries] skipped: ${skipped.join(', ')}`);
