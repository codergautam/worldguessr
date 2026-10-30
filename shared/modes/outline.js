// Country silhouettes for the Shapes quiz, and the "main landmass" cluster
// that both the silhouette and the reveal camera use.
//
// Pure functions over genBorders.json features. A country can be several
// features (Corsica is its own FR feature, Alaska its own US feature), so every
// entry point takes ALL features that share a code. No platform APIs: the
// borders payload is fetched by each platform and the features passed in, the
// same contract as shared/country/findCountry.js.

const KM_PER_DEG = 111.32;
// Web Mercator clamp. Nothing in the pools reaches it, but a ring vertex at the
// pole would send Math.tan to infinity.
const MAX_LAT = 85;

function ringArea(ring) {
  // Shoelace in degrees, scaled by cos(mean lat) to approximate km^2. Only
  // used for ranking and thresholds, never shown to a player.
  let sum = 0;
  let latSum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    latSum += ring[i][1];
  }
  const meanLat = (latSum / ring.length) * Math.PI / 180;
  return Math.abs(sum / 2) * Math.cos(meanLat) * KM_PER_DEG * KM_PER_DEG;
}

function bboxOf(ring) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

// Flatten features into polygons: { ring, holes, bbox, area }. When the set
// straddles the antimeridian (Russia, Fiji, the US with its Aleutians) the
// negative longitudes are shifted by +360 so a bbox never spans the world.
export function polygonsOf(features) {
  let polys = [];
  for (const feature of features) {
    const g = feature.geometry;
    const list = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const poly of list) polys.push({ ring: poly[0], holes: poly.slice(1) });
  }
  let minX = Infinity, maxX = -Infinity;
  for (const p of polys) {
    for (const [x] of p.ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  const shifted = maxX - minX > 180;
  if (shifted) {
    const shift = (ring) => ring.map(([x, y]) => [x < 0 ? x + 360 : x, y]);
    polys = polys.map((p) => ({ ring: shift(p.ring), holes: p.holes.map(shift) }));
  }
  for (const p of polys) {
    p.bbox = bboxOf(p.ring);
    let area = ringArea(p.ring);
    for (const hole of p.holes) area -= ringArea(hole);
    p.area = Math.max(0, area);
  }
  return { polygons: polys, shifted };
}

function bboxesTouch(a, b, pad) {
  return a.minX - pad <= b.maxX && b.minX - pad <= a.maxX
    && a.minY - pad <= b.maxY && b.minY - pad <= a.maxY;
}

// The main body of a country: grown from the largest polygon, adding any
// polygon whose bbox comes within `padDeg` of the cluster's bbox, until
// nothing more joins. 3 degrees keeps Great Britain's islands and Corsica
// with France, and leaves Alaska, Hawaii, Kerguelen and the Chagos out.
// Polygons under `speck` of the cluster area are dropped afterwards.
export function primaryCluster(polygons, { padDeg = 3, speck = 0.0005 } = {}) {
  if (polygons.length === 0) return [];
  const sorted = [...polygons].sort((a, b) => b.area - a.area);
  const cluster = [sorted[0]];
  const rest = sorted.slice(1);
  let bbox = { ...sorted[0].bbox };
  let grew = true;
  while (grew) {
    grew = false;
    for (let i = rest.length - 1; i >= 0; i--) {
      if (!bboxesTouch(bbox, rest[i].bbox, padDeg)) continue;
      const p = rest.splice(i, 1)[0];
      cluster.push(p);
      bbox = {
        minX: Math.min(bbox.minX, p.bbox.minX),
        maxX: Math.max(bbox.maxX, p.bbox.maxX),
        minY: Math.min(bbox.minY, p.bbox.minY),
        maxY: Math.max(bbox.maxY, p.bbox.maxY),
      };
      grew = true;
    }
  }
  const total = cluster.reduce((s, p) => s + p.area, 0);
  return cluster.filter((p) => p.area >= total * speck);
}

// Share of the country's area that sits in the main cluster. The Shapes pool
// uses it to skip countries whose silhouette would be a lone fragment.
export function clusterShare(features) {
  const { polygons } = polygonsOf(features);
  const total = polygons.reduce((s, p) => s + p.area, 0);
  if (total === 0) return 0;
  const cluster = primaryCluster(polygons);
  return cluster.reduce((s, p) => s + p.area, 0) / total;
}

export function totalArea(features) {
  const { polygons } = polygonsOf(features);
  return polygons.reduce((s, p) => s + p.area, 0);
}

function mercY(lat) {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const rad = clamped * Math.PI / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

// Lat/lng bounds of the main cluster, back in [-180, 180] longitudes, for the
// reveal camera. `crossesAntimeridian` tells the caller the west edge is
// numerically larger than the east edge.
export function clusterBounds(features) {
  const { polygons, shifted } = polygonsOf(features);
  const cluster = primaryCluster(polygons);
  if (cluster.length === 0) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of cluster) {
    minX = Math.min(minX, p.bbox.minX);
    maxX = Math.max(maxX, p.bbox.maxX);
    minY = Math.min(minY, p.bbox.minY);
    maxY = Math.max(maxY, p.bbox.maxY);
  }
  const unshift = (x) => (shifted && x > 180 ? x - 360 : x);
  return {
    minLat: minY,
    maxLat: maxY,
    minLng: unshift(minX),
    maxLng: unshift(maxX),
    crossesAntimeridian: shifted && unshift(minX) > unshift(maxX),
  };
}

// Ramer-Douglas-Peucker on a closed ring already in output pixels. Keeps the
// silhouette's character while cutting Natural Earth's thousand-vertex coasts
// to a few dozen points, which is what keeps public/modes/shapes.json small.
export function simplifyRing(ring, tolerance) {
  if (tolerance <= 0 || ring.length <= 4) return ring;
  const sq = tolerance * tolerance;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = ring[a], [bx, by] = ring[b];
    const dx = bx - ax, dy = by - ay;
    const len = dx * dx + dy * dy;
    let worst = -1, worstD = sq;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = ring[i];
      let d;
      if (len === 0) {
        d = (px - ax) ** 2 + (py - ay) ** 2;
      } else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
        d = (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2;
      }
      if (d > worstD) { worstD = d; worst = i; }
    }
    if (worst !== -1) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  const out = [];
  for (let i = 0; i < ring.length; i++) if (keep[i]) out.push(ring[i]);
  return out.length >= 4 ? out : ring;
}

// SVG path of the main cluster in a Web Mercator projection, so the silhouette
// matches the shape the player sees on the Leaflet map. `d` uses one subpath
// per ring (outer rings and holes alike) and expects fill-rule="evenodd".
// `tolerance` is in output pixels (0 = keep every vertex).
export function outlinePath(features, { size = 100, tolerance = 0 } = {}) {
  const { polygons } = polygonsOf(features);
  const cluster = primaryCluster(polygons);
  if (cluster.length === 0) return { d: '', viewBox: `0 0 ${size} ${size}`, width: size, height: size };

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  // Both axes in radians: mercY is unitless (ln tan), so x must be too or the
  // silhouette is stretched 57x sideways.
  const project = (ring) => ring.map(([x, y]) => [x * Math.PI / 180, mercY(y)]);
  const projected = cluster.map((p) => ({ ring: project(p.ring), holes: p.holes.map(project) }));
  for (const p of projected) {
    for (const [x, y] of p.ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = size / Math.max(spanX, spanY);
  const width = Math.round(spanX * scale * 100) / 100;
  const height = Math.round(spanY * scale * 100) / 100;
  const fmt = (n) => Math.round(n * 100) / 100;
  const ringToPath = (ring) => {
    const px = ring.map(([x, y]) => [(x - minX) * scale, (maxY - y) * scale]); // SVG y grows downward
    const pts = simplifyRing(px, tolerance);
    let d = '';
    for (let i = 0; i < pts.length; i++) {
      d += (i === 0 ? 'M' : 'L') + fmt(pts[i][0]) + ' ' + fmt(pts[i][1]);
    }
    return d + 'Z';
  };
  let d = '';
  for (const p of projected) {
    d += ringToPath(p.ring);
    for (const hole of p.holes) d += ringToPath(hole);
  }
  return { d, viewBox: `0 0 ${width} ${height}`, width, height };
}
