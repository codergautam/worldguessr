// Offline country lookup using the bundled GeoJSON in public/genBorders.json.
// Used as a fallback when /api/country is unreachable (and, long-term, could
// serve as the primary lookup — it's fast enough and has no network dependency).
//
// genBorders.json is already a static import in randomLoc.js, so this adds no
// extra network weight; we just reuse the parsed data and build a bbox index
// once on first call.
import borders from '../public/genBorders.json';

// [{ code, ring, minX, maxX, minY, maxY }, ...]
// `ring` is the outer ring of a single polygon in [lon, lat] pairs.
let indexed = null;

function buildIndex() {
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

/**
 * Resolve a country code for a lat/lon using bundled border data.
 * Returns the ISO-alpha-2 code ("US", "FR", ...), or "Unknown" if the point
 * doesn't fall inside any country polygon (ocean, Antarctica edge cases, etc.).
 */
export default function findCountryLocal({ lat, lon }) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return "Unknown";
  if (!indexed) indexed = buildIndex();
  // GeoJSON coords are [lon, lat]; the ray-cast uses x=lon, y=lat.
  const x = lon, y = lat;
  for (const entry of indexed) {
    if (x < entry.minX || x > entry.maxX || y < entry.minY || y > entry.maxY) continue;
    if (pointInRing(x, y, entry.ring)) return entry.code;
  }
  return "Unknown";
}
