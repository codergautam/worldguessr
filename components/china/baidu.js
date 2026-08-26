// ChinaGuessr (temporary): Baidu panorama endpoints. These are the keyless
// endpoints Baidu's own web map uses (mapsv0 = metadata, mapsv1 = tiles);
// both serve Access-Control-Allow-Origin: * so plain fetch/<img> work.
//
// Imported by the browser renderer, the esbuild mobile embed AND a plain node
// script, so: no npm imports, no @/ aliases, no React.

export const sdataUrl = (id) =>
  `https://mapsv0.bdimg.com/?qt=sdata&pc=1&sid=${encodeURIComponent(id)}`;

// Nearest pano to a BD09MC (Baidu Mercator, metres) point. Compact response:
// {content:{id,x,y,RoadName}, result:{error:0}}; a miss is result.error 404.
export const qsdataUrl = (x, y) => `https://mapsv0.bdimg.com/?qt=qsdata&x=${x}&y=${y}`;

// Tile grid (measured): Baidu z=1 is one 512x256 image, z=2 is 1x2 tiles of
// 512x512, then exact doubling up to z=5 (8192x4096). That is the renderer's
// 512x256-base layout with Baidu's z one above the renderer's. pos is row_col.
export const tileUrl = (id, z, x, y) =>
  `https://mapsv1.bdimg.com/?qt=pdata&sid=${encodeURIComponent(id)}&pos=${y}_${x}&z=${z + 1}`;

// Compass bearing of the image's centre column, from sdata's Heading. THE
// calibration constant. Settled on three Tsim Sha Tsui panos (Headings 218,
// 262, 197) that all see the Clock Tower at a known bearing: only
// Heading - 90 puts the tower where each image shows it (the other candidates,
// 360 - Heading and 90 - Heading, miss by 40 to 90 degrees on at least one).
// Bearing increases to the right across the image, as in Google's equirects.
// NorthDir (== 270 - Heading) and MoveDir (== Heading) carry nothing extra.
// Heading itself is the vehicle's travel direction, i.e. the road: the
// renderer opens the view on it, not on the image centre.
export const centerBearingDeg = (heading) => (((heading - 90) % 360) + 360) % 360;

export const BAIDU_NAV_CANDIDATE_CAP = 40;

// sdata carries no Cache-Control, so a second fetch of the same id is a second
// round trip. One in-flight/settled promise per id, shared by the warm-up
// below and the renderer's metadata fetch. Bounded: the renderer keeps what it
// needs on its own pano record, this only has to bridge warm-up to load.
const SDATA_CACHE_CAP = 32;
const sdataCache = new Map();
export function fetchSdata(id) {
  const cached = sdataCache.get(id);
  if (cached) return cached;
  const promise = fetch(sdataUrl(id)).then((res) => res.json());
  promise.catch(() => { if (sdataCache.get(id) === promise) sdataCache.delete(id); });
  sdataCache.set(id, promise);
  if (sdataCache.size > SDATA_CACHE_CAP) sdataCache.delete(sdataCache.keys().next().value);
  return promise;
}

// Everything the first paint needs, started as early as the caller can: the
// metadata and the z0-z2 base tiles (1 + 2 + 8 images, the renderer's reveal
// waits for z0 + z1). Tiles carry max-age=43200 and the renderer requests
// them with the same anonymous CORS mode, so these land in the HTTP cache
// (or dedupe in flight) for its own Image() loads. Browser only.
//
// Resolves true once the reveal set (sdata + z0 + the z1 pair) has landed,
// false if any of it failed: the landing page reads it as "first location
// ready". z2 is fire-and-forget.
export function warmPano(id) {
  if (!id || typeof Image === 'undefined') return Promise.resolve(false);
  const waits = [fetchSdata(id)];
  for (let z = 0; z <= 2; z++) {
    const cols = z === 0 ? 1 : 2 << (z - 1);
    const rows = z === 0 ? 1 : 1 << (z - 1);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      if (z <= 1) waits.push(new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; }));
      img.src = tileUrl(id, z, x, y);
    }
  }
  return Promise.all(waits).then(() => true, () => false);
}

// DNS + TCP + TLS to Baidu measured ~1.4 s from outside China, paid once per
// host. Both hosts are cold on the first round; opening them while the bundle
// loads takes that off the round-1 critical path. Idempotent.
export const BAIDU_HOSTS = ['https://mapsv0.bdimg.com', 'https://mapsv1.bdimg.com'];
export function preconnectBaidu() {
  if (typeof document === 'undefined') return;
  for (const href of BAIDU_HOSTS) {
    if (document.head.querySelector(`link[rel="preconnect"][href="${href}"]`)) continue;
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = href;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }
}

const panoPoint = (point) => {
  if (!point || !point.PID || point.X === null || point.X === undefined || point.Y === null || point.Y === undefined
    || !Number.isFinite(Number(point.X)) || !Number.isFinite(Number(point.Y))) return null;
  return { id: point.PID, x: Number(point.X) / 100, y: Number(point.Y) / 100 };
};

// sdata → the few fields the game needs. null when the pano does not exist.
// X/Y arrive as BD09MC * 100 integers.
export function parseSdata(json) {
  const c = json && json.content && json.content[0];
  if (!c || !c.ID || !c.LayerCount) return null;
  const links = (Array.isArray(c.Links) ? c.Links : []).map((link) => {
    const point = panoPoint(link);
    return point ? { ...point, roadId: link.RID || '' } : null;
  }).filter(Boolean);
  const roads = (Array.isArray(c.Roads) ? c.Roads : []).map((road) => ({
    id: road.ID || '',
    name: road.Name || '',
    panos: (Array.isArray(road.Panos) ? road.Panos : []).map(panoPoint).filter(Boolean),
  }));
  return {
    id: c.ID,
    x: c.X / 100,
    y: c.Y / 100,
    heading: c.Heading,
    maxZ: c.LayerCount,
    street: c.Rname || '',
    date: c.Date || '',
    type: c.Type || '',
    obsolete: c.Obsolete === 1,
    userUploaded: !!c.UserID,
    height: Number(c.DeviceHeight) > 0 ? Number(c.DeviceHeight) : 2.3,
    links,
    roads,
  };
}

// Navigation is stored relative to the current pano. X points east and Y
// points north. The renderer converts north to its negative-Z world axis.
//
// Arrows come from two places. sdata's Links[] only lists junctions onto
// OTHER roads and is empty for most panos (21 of 25 sampled pool panos). The
// along-road neighbours live in Roads[].Panos: an ordered chain, 10 to 30 m
// apart, that contains the current pano. Both feed one deduplicated link list
// that the chevrons, W/S keys and forward prewarm all read.
const MIN_LINK_DIST = 0.5;   // metres; a chain duplicate at the same spot is not a move
const LINK_MERGE_DEG = 12;   // two arrows this close in bearing collapse into the nearer one

const bearingDeg = (dx, dy) => ((Math.atan2(dx, dy) * 180 / Math.PI) + 360) % 360;
const bearingGap = (a, b) => {
  const gap = Math.abs(a - b) % 360;
  return gap > 180 ? 360 - gap : gap;
};

export function buildBaiduNav(meta) {
  const roadNames = new Map(meta.roads.map((road) => [road.id, road.name]));
  const relative = (point) => ({ id: point.id, x: point.x - meta.x, y: point.y - meta.y });

  const rawLinks = meta.links.map((link) => ({ ...relative(link), road: roadNames.get(link.roadId) || '' }));
  for (const road of meta.roads) {
    const index = road.panos.findIndex((pano) => pano.id === meta.id);
    if (index >= 0) {
      for (const neighbour of [road.panos[index - 1], road.panos[index + 1]]) {
        if (neighbour) rawLinks.push({ ...relative(neighbour), road: road.name });
      }
      continue;
    }
    // Current pano missing from its own chain: use the nearest chain pano and
    // the nearest one on the opposite side of the camera.
    const ordered = road.panos.map(relative)
      .filter((pano) => pano.id !== meta.id)
      .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
    const first = ordered[0];
    if (!first) continue;
    rawLinks.push({ ...first, road: road.name });
    const back = ordered.find((pano) => bearingGap(bearingDeg(pano.x, pano.y), bearingDeg(first.x, first.y)) > 90);
    if (back) rawLinks.push({ ...back, road: road.name });
  }

  const links = [];
  for (const raw of rawLinks) {
    if (raw.id === meta.id) continue;
    const dist = Math.hypot(raw.x, raw.y);
    if (dist < MIN_LINK_DIST) continue;
    const link = { id: raw.id, bearing: bearingDeg(raw.x, raw.y), dist, road: raw.road };
    const clash = links.findIndex((other) => other.id === link.id || bearingGap(other.bearing, link.bearing) < LINK_MERGE_DEG);
    if (clash < 0) links.push(link);
    else if (link.dist < links[clash].dist) links[clash] = link;
  }
  links.sort((a, b) => a.bearing - b.bearing);

  const candidatesById = new Map();
  const addCandidate = (point) => {
    if (!point || point.id === meta.id) return;
    const candidate = relative(point);
    const previous = candidatesById.get(candidate.id);
    if (!previous || Math.hypot(candidate.x, candidate.y) < Math.hypot(previous.x, previous.y)) {
      candidatesById.set(candidate.id, candidate);
    }
  };
  meta.links.forEach(addCandidate);
  meta.roads.forEach((road) => road.panos.forEach(addCandidate));

  const candidates = [...candidatesById.values()]
    .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))
    .slice(0, BAIDU_NAV_CANDIDATE_CAP);

  return { height: meta.height, links, candidates };
}

// Baidu ids are 27 chars of digits ending in 1-2 uppercase letters
// (09024200121707301421572809B); Google ids are base64url with lowercase,
// '-' and '_'. Lets one URL builder serve both providers with no extra field
// threaded through the results screens or stored game history.
export const isBaiduPanoId = (id) =>
  typeof id === 'string' && id.length === 27 && /^\d{22,26}[A-Z]{1,4}$/.test(id);

// No heading/pitch: Baidu's viewer angle convention is its own, and a link
// that is definitely right beats one that is approximately oriented.
export const permalink = (id) =>
  `https://map.baidu.com/#panoid=${id}&panotype=street&l=21&tn=B_NORMAL_MAP&sc=0&newmap=1&shareurl=1&pid=${id}`;
