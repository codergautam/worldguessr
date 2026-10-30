// Regenerates public/modes/shapes.json: one SVG path per quiz country for the
// Shapes mode, Web Mercator so it matches the Leaflet map, simplified so the
// whole file stays small enough to fetch at game start.
// Run: node scripts/modes/buildShapes.mjs   (after buildQuizCountries.mjs)
//
// Only the client reads this file; the server never needs a silhouette, it
// only needs the country code in the round.

import fs from 'node:fs';
import path from 'node:path';
import { outlinePath } from '../../shared/modes/outline.js';
import { QUIZ_COUNTRIES } from '../../shared/modes/data/countries.js';
import { loadNaturalEarth, neFeaturesByCode } from './naturalEarth.mjs';

const SIZE = 100;
// Output pixels. 0.4 keeps bays and peninsulas at a 160px render and cuts
// Natural Earth's coastlines by roughly 20x.
const TOLERANCE = 0.4;
const out = path.resolve('public/modes/shapes.json');

const ne = neFeaturesByCode(await loadNaturalEarth());
const shapes = {};
const missing = [];
for (const c of QUIZ_COUNTRIES) {
  const features = ne.get(c.code);
  if (!features) { missing.push(c.code); continue; }
  const { d, viewBox } = outlinePath(features, { size: SIZE, tolerance: TOLERANCE });
  shapes[c.code] = { d, viewBox };
}

fs.mkdirSync(path.dirname(out), { recursive: true });
const body = JSON.stringify({ schemaVersion: 1, size: SIZE, shapes });
fs.writeFileSync(out, body);
console.log(`[shapes] wrote ${Object.keys(shapes).length} silhouettes (${(body.length / 1024).toFixed(0)} KB) to ${out}`);
if (missing.length) console.log(`[shapes] no Natural Earth feature for: ${missing.join(', ')}`);
