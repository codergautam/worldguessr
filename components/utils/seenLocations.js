import gameStorage from "@/components/utils/localStorage";
import { DEFAULT_CAP, decodeRing, encodeRing, locId, locKey, pushSeen } from "@/shared/locations/repeatGuard.js";

// Web adapter for the shared repeat guard: one ring of location ids covering
// every official map (World and official country maps), held in memory and
// mirrored to localStorage.
//
// One key, not one per country. The July 31 design wrote seenLocs_US,
// seenLocs_FR and so on, capped each at 300 spots of raw "lat,long" text, and
// deleted a country's history whenever filtering starved its pool. This holds
// 5,000 hashed ids in a single key: more history, less storage, no wipes.
const KEY = 'wg_seen';
const LEGACY_PREFIX = 'seenLocs_';

let ring = null;

function migrateLegacyKeys(into) {
  // CrazyGames' storage SDK has no key enumeration, so this only sweeps real
  // localStorage. Nothing breaks there, the old keys simply stay put unread.
  try {
    const ls = window.localStorage;
    for (let i = ls.length - 1; i >= 0; i--) {
      const key = ls.key(i);
      if (!key || !key.startsWith(LEGACY_PREFIX)) continue;
      try {
        for (const entry of JSON.parse(ls.getItem(key)) || []) {
          const [lat, long] = String(entry).split(',');
          if (lat && long) pushSeen(into, locId(lat, long));
        }
      } catch (e) { /* unparseable legacy key, drop it */ }
      ls.removeItem(key);
    }
  } catch (e) { /* no localStorage (SSR, blocked cookies) */ }
}

function load() {
  if (ring) return ring;
  ring = decodeRing(gameStorage.getItem(KEY));
  const before = ring.length;
  migrateLegacyKeys(ring);
  if (ring.length !== before) gameStorage.setItem(KEY, encodeRing(ring));
  return ring;
}

// The ids a player has seen, oldest first. Feed straight to orderByFreshness.
export function seenLocs() {
  return load();
}

// Called once per location the player actually receives, from the single
// latLong choke-point in home.js.
export function markSeenLoc(loc) {
  const id = locKey(loc);
  if (!id) return;
  const ids = load();
  if (ids[ids.length - 1] === id) return; // same spot re-rendered, not a new round
  pushSeen(ids, id, DEFAULT_CAP);
  gameStorage.setItem(KEY, encodeRing(ids));
}
