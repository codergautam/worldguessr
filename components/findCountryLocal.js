// Offline country lookup using the GeoJSON in public/genBorders.json. The
// borders payload is fetched lazily on first call (see loadBorders) so the
// ~450 KB JSON stays out of the initial bundle. Used as a fallback when the
// /api/country endpoint is unreachable.
import { loadBorders, getBordersIfLoaded } from './utils/loadBorders';

// [{ code, ring, minX, maxX, minY, maxY }, ...]
// `ring` is the outer ring of a single polygon in [lon, lat] pairs.
let indexed = null;

function buildIndex(borders) {
  const out = [];
  for (const feature of borders.features) {
    const code = feature.properties?.code;
    if (!code) continue;
    const g = feature.geometry;
    const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const poly of polygons) {
      const ring = poly[0];
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      out.push({ code, ring, minX, maxX, minY, maxY });
    }
  }
  return out;
}

// Standard ray-casting. `ring` is [lon, lat][] of the outer ring.
function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function lookup(lat, lon) {
  if (!indexed) return "Unknown";
  const x = lon, y = lat;
  for (const entry of indexed) {
    if (x < entry.minX || x > entry.maxX || y < entry.minY || y > entry.maxY) continue;
    if (pointInRing(x, y, entry.ring)) return entry.code;
  }
  return "Unknown";
}

/**
 * Resolve a country code for a lat/lon using the lazily-loaded border data.
 * Returns the ISO-alpha-2 code ("US", "FR", ...), or "Unknown" if the point
 * doesn't fall inside any country polygon (ocean, Antarctica edge cases, etc.).
 */
export default async function findCountryLocal({ lat, lon }) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return "Unknown";
  if (!indexed) {
    const borders = await loadBorders();
    indexed = buildIndex(borders);
  }
  return lookup(lat, lon);
}

// Synchronous variant for render-path callers. Returns null if the borders
// haven't been loaded yet — callers should treat that as "not enough data,
// skip the enhancement" and trigger loadBorders() out-of-band so a later
// render can succeed.
export function findCountryLocalSync({ lat, lon }) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return "Unknown";
  if (!indexed) {
    const borders = getBordersIfLoaded();
    if (!borders) return null;
    indexed = buildIndex(borders);
  }
  return lookup(lat, lon);
}
