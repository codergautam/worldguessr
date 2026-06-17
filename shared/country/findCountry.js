// Pure country point-in-polygon lookup over the genBorders.json GeoJSON.
// Ported from the web's components/findCountryLocal.js so web + mobile share
// the exact same logic. No platform APIs — the borders payload is fetched by
// each platform and passed into buildCountryIndex().

// borders.features → [{ code, ring, minX, maxX, minY, maxY }, ...]
export function buildCountryIndex(borders) {
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

// Returns the ISO-alpha-2 code ("US", "FR", …) or "Unknown".
export function lookupCountry(indexed, lat, lon) {
  if (!indexed) return 'Unknown';
  const x = lon, y = lat;
  for (const entry of indexed) {
    if (x < entry.minX || x > entry.maxX || y < entry.minY || y > entry.maxY) continue;
    if (pointInRing(x, y, entry.ring)) return entry.code;
  }
  return 'Unknown';
}
