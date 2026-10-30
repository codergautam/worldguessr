// Regenerates public/modes/countries.json (GeoJSON): every country polygon the quiz
// globe draws AND the polygon index both sides score country targets with
// (ws/classes/Game.js COUNTRY_INDEX, the client scorer), so a click on the
// globe is scored against exactly the shape that was clicked.
// Run: node scripts/modes/buildGlobeCountries.mjs   (then buildQuizCountries)
//
// Source: Natural Earth 1:50m admin-0 (public domain), simplified in degrees
// so the file stays small enough to fetch at game start. Every feature keeps
// just { code } (ISO_A2_EH, null for the few disputed areas), including the
// non-pool territories, so the globe has no holes in its land.

import fs from 'node:fs';
import path from 'node:path';
import { simplifyRing } from '../../shared/modes/outline.js';
import { loadNaturalEarth } from './naturalEarth.mjs';

// Degrees. 0.02 keeps coastlines readable at the zooms the quiz uses and
// cuts the 3 MB source to roughly a fifth.
const TOLERANCE = 0.02;
// .json, not .geojson: ws/classes/Game.js imports it with `with {type:"json"}`,
// which Node only honours for the .json extension.
const out = path.resolve('public/modes/countries.json');

const ne = await loadNaturalEarth();
const round = (n) => Math.round(n * 1000) / 1000;
const simp = (ring) => {
  const s = simplifyRing(ring, TOLERANCE).map(([x, y]) => [round(x), round(y)]);
  // A ring must stay closed and keep at least a triangle.
  if (s.length < 4) return null;
  const [fx, fy] = s[0], [lx, ly] = s[s.length - 1];
  if (fx !== lx || fy !== ly) s.push([fx, fy]);
  return s;
};

const features = [];
for (const f of ne.features) {
  const codeRaw = f.properties?.ISO_A2_EH;
  const code = codeRaw && codeRaw !== '-99' ? codeRaw : null;
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const kept = [];
  for (const poly of polys) {
    const rings = poly.map(simp).filter(Boolean);
    if (rings.length) kept.push(rings);
  }
  if (!kept.length) continue;
  features.push({
    type: 'Feature',
    properties: { code, name: f.properties?.NAME ?? null },
    geometry: kept.length === 1 ? { type: 'Polygon', coordinates: kept[0] } : { type: 'MultiPolygon', coordinates: kept },
  });
}

const body = JSON.stringify({ type: 'FeatureCollection', features });
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, body);
console.log(`[globeCountries] wrote ${features.length} features (${(body.length / 1024).toFixed(0)} KB) to ${out}`);
