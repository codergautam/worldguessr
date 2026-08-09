// Repeat guard: the one place that answers "has this player seen this spot
// already, and which spot should they get next".
//
// Shared by all three pickers so they cannot drift apart:
//   web    -> components/utils/seenLocations.js  (localStorage)
//   mobile -> mobile/src/services/seenLocations.ts (AsyncStorage)
//   server -> ws/classes/Game.js (per-player in-memory ring)
//
// Pure functions only. No storage, no globals, no platform APIs: the adapters
// own persistence, this file stays unit-testable, and Metro/webpack/Node all
// take it as plain ESM.
//
// Why a ring of hashed ids and not the raw coordinates: a player's history has
// to live in localStorage indefinitely, and "12.345678,-98.765432" costs ~24
// characters per spot. A 5-char id costs 5, so the same storage budget buys
// roughly five times the history.

export const ID_LEN = 5;
// 36^5 = 60,466,176 buckets. With a 5,000-entry ring a false positive hits
// 0.008% of candidates, and the only cost of one is skipping a location that
// was actually fine.
const ID_SPACE = Math.pow(36, ID_LEN);

// 5,000 ids = 25,000 characters under one key, which is 1,000 games of history
// at five rounds a game. This is the knob: raise it to trade storage for a
// longer no-repeat horizon.
export const DEFAULT_CAP = 5000;

// Server-side rings are per connected player and live in RAM, so they are sized
// for "don't repeat across my recent matches", not for history. 50 ids is 10
// matches, measured at ~1.1KB per player (~5MB at 5,000 concurrent). The window
// that actually needs covering is much shorter: the ws pool rotates every 60s
// and a duel runs for minutes, so consecutive matches nearly always draw from
// different slices anyway.
export const SERVER_CAP = 50;

// Which maps the guard covers: the World map and the official country maps.
// Both are identified by their slug, "all" or a two-letter country code, and
// api/map/action.js reserves exactly those from community slugs.
//
// Community maps are out on purpose. A map with fewer locations than rounds
// duplicates by design and already toasts notEnoughLocationsInMap.
export function isOfficialMapSlug(slug) {
  if (typeof slug !== 'string') return false;
  return slug === 'all' || (slug.length === 2 && slug === slug.toUpperCase());
}

// Local Fisher-Yates instead of utils/shuffle.js: Metro only watches /shared
// and /public/locales, so anything in this file that reaches outside /shared
// breaks the mobile bundle.
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// FNV-1a over the rounded coordinate pair. 5 decimals is about 1 metre: finer
// than any two distinct panos in the pools, coarse enough that float noise from
// the lng -> long rename cannot split one spot into two ids.
export function locId(lat, long) {
  const key = `${Number(lat).toFixed(5)},${Number(long).toFixed(5)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h % ID_SPACE).toString(36).padStart(ID_LEN, '0');
}

// Locations arrive as {lat, long} from the API and {lat, lng} straight out of
// the JSON pools, so accept both rather than making every caller normalize.
export function locKey(loc) {
  if (!loc) return null;
  const long = loc.long != null ? loc.long : loc.lng;
  if (loc.lat == null || long == null) return null;
  return locId(loc.lat, long);
}

export function decodeRing(raw) {
  if (typeof raw !== 'string') return [];
  const ids = [];
  for (let i = 0; i + ID_LEN <= raw.length; i += ID_LEN) ids.push(raw.slice(i, i + ID_LEN));
  return ids;
}

export function encodeRing(ids) {
  return ids.join('');
}

// Mutates and returns `ids` on purpose: every adapter holds one long-lived ring
// array, and rebuilding a 5,000-entry array on every round is pure waste.
// Re-seeing a spot moves it to the end, so recency stays honest.
export function pushSeen(ids, id, cap = DEFAULT_CAP) {
  if (!id) return ids;
  const at = ids.indexOf(id);
  if (at !== -1) ids.splice(at, 1);
  ids.push(id);
  if (ids.length > cap) ids.splice(0, ids.length - cap);
  return ids;
}

export function pushSeenLoc(ids, loc, cap = DEFAULT_CAP) {
  return pushSeen(ids, locKey(loc), cap);
}

// Order a fetched pool best-first for this player: never-seen spots (shuffled)
// come first, then seen ones oldest-first.
//
// This replaces filter-then-wipe. Filtering has to decide what to do when it
// starves the pool, and the old answer was to delete the player's history at
// exactly the moment it mattered most (a small country map). Ordering cannot
// starve: when every candidate has been seen, the player gets the one they saw
// longest ago, which is the best result physically available.
//
// One pass plus one sort over the pool, roughly 1ms for 2,000 rows, once per
// fetch. Callers then walk the result from index 0.
export function orderByFreshness(locs, ids) {
  const recency = new Map();
  for (let i = 0; i < ids.length; i++) recency.set(ids[i], i); // higher index = more recent

  const ordered = [];
  const seen = [];
  for (const loc of locs) {
    const at = recency.get(locKey(loc));
    if (at === undefined) ordered.push(loc);
    else seen.push({ loc, at });
  }

  shuffleInPlace(ordered);
  seen.sort((a, b) => a.at - b.at);
  for (const entry of seen) ordered.push(entry.loc);
  return ordered;
}

// Server-side picker: `count` distinct locations, preferring ones nobody in the
// match has seen recently.
//
// O(count) rather than O(pool). The ws public-game branch calls this up to 50
// times per match hunting for continent spread, and the old implementation
// shuffled a full copy of the 2,000-entry pool every single attempt, so picking
// 5 spots cost 100,000 swaps.
//
// Dedupe is by location id, not array index, which also closes the 2v2 gap
// where the world pool and the arbitrary pool share 510 coordinates as
// different objects and could both land in one match.
export function sampleDistinct(pool, count, seenIds) {
  const picks = [];
  if (!pool || pool.length === 0) return picks;

  const seen = seenIds instanceof Set ? seenIds : new Set(seenIds || []);
  const taken = new Set();
  const maxTries = Math.min(pool.length * 4, 400);

  // Pass 0 skips anything in the players' rings, pass 1 accepts anything. Two
  // passes rather than a filtered copy of the pool: allocating a 2,000-entry
  // array per attempt is the cost this function exists to avoid.
  for (let pass = 0; pass < 2 && picks.length < count; pass++) {
    const skipSeen = pass === 0 && seen.size > 0;
    let tries = 0;
    while (picks.length < count && tries++ < maxTries) {
      const loc = pool[Math.floor(Math.random() * pool.length)];
      const key = locKey(loc);
      if (taken.has(key)) continue;
      if (skipSeen && seen.has(key)) continue;
      taken.add(key);
      picks.push(loc);
    }
  }

  // Pool smaller than the round count (the ws boot fallback is 6 spots): top up
  // with duplicates, same as the old pickDistinctLocations did.
  while (picks.length < count) picks.push(pool[Math.floor(Math.random() * pool.length)]);
  return picks;
}
