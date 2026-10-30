// Natural Earth 1:50m admin-0 countries (public domain), used by the quiz
// generators for accurate areas and silhouettes. public/genBorders.json cannot
// do that job: 54 of the pool's countries are 5 to 30 vertex blobs there
// (Australia has 14, Iceland and New Zealand 5), fine for random-location
// sampling and for generous polygon scoring, useless as a shape to recognise.
//
// The file (3 MB) is cached in the OS temp dir, never committed.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';
const CACHE = path.join(os.tmpdir(), 'worldguessr-ne', 'ne_50m_admin_0_countries.geojson');

export async function loadNaturalEarth() {
  if (!fs.existsSync(CACHE)) {
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    console.log(`[naturalEarth] downloading ${URL}`);
    const res = await fetch(URL);
    if (!res.ok) throw new Error(`Natural Earth download failed: ${res.status}`);
    fs.writeFileSync(CACHE, Buffer.from(await res.arrayBuffer()));
  }
  return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
}

// code -> [feature]. ISO_A2_EH is the corrected code (ISO_A2 is "-99" for
// France, Norway and Kosovo in this dataset).
export function neFeaturesByCode(geojson) {
  const by = new Map();
  for (const f of geojson.features) {
    const code = f.properties?.ISO_A2_EH;
    if (!code || code === '-99') continue;
    if (!by.has(code)) by.set(code, []);
    by.get(code).push(f);
  }
  return by;
}
