// public/modes/countries.json (GeoJSON, scripts/modes/buildGlobeCountries.mjs): the
// globe's polygons. The globe fetches it through MapLibre; this second read
// (same URL, browser cache) gives QuizGame the reveal framing via clusterBounds
// and the same point-in-polygon index the server scores with.

import { asset } from '../../lib/basePath';
import { clusterBounds } from '../../shared/modes/outline.js';
import { buildCountryIndex, pointInCountry } from '../../shared/country/findCountry.js';

let promise = null;
let cache = null;
let index = null;

export function loadCountries() {
  if (cache) return Promise.resolve(cache);
  if (!promise) {
    promise = fetch(asset('/modes/countries.json'))
      .then((res) => {
        if (!res.ok) throw new Error(`countries.json ${res.status}`);
        return res.json();
      })
      .then((data) => { cache = data; return data; })
      .catch((err) => { promise = null; throw err; });
  }
  return promise;
}

// [[west, south], [east, north]] of the country's main landmass, or null when
// unknown / not loaded yet / crossing the antimeridian (the globe then flies
// to the label point instead).
export function countryBounds(code) {
  if (!cache || !code) return null;
  const features = cache.features.filter((f) => f.properties?.code === code);
  if (!features.length) return null;
  const b = clusterBounds(features);
  if (!b || b.crossesAntimeridian) return null;
  return [[b.minLng, b.minLat], [b.maxLng, b.maxLat]];
}

// Every feature of these countries, for the globe's answer wash.
export function countryFeatures(codes) {
  if (!cache || !codes?.length) return [];
  return cache.features.filter((f) => codes.includes(f.properties?.code));
}

// The server's scoring index (ws/classes/Game.js COUNTRY_INDEX), built from
// the same file, so singleplayer scores a click exactly as a party would.
export function countryIndex() {
  if (!index && cache) index = buildCountryIndex(cache);
  return index;
}

// The country under a point by the scoring polygons, holes respected (a click
// in Lesotho is LS, not the ZA ring around it), or null for the ocean / not
// loaded yet.
export function countryAt(lat, lng) {
  const idx = countryIndex();
  if (!idx) return null;
  const tried = new Set();
  for (const e of idx) {
    if (tried.has(e.code) || lng < e.minX || lng > e.maxX || lat < e.minY || lat > e.maxY) continue;
    tried.add(e.code);
    if (pointInCountry(idx, lat, lng, e.code)) return e.code;
  }
  return null;
}
