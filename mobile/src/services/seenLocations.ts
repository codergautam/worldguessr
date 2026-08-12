import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_CAP, decodeRing, encodeRing, locKey, pushSeen } from '@shared/locations/repeatGuard';

/**
 * Mobile adapter for the shared repeat guard. Same ring, same key, same
 * encoding as the web client (components/utils/seenLocations.js): the ids a
 * player has already been served on official maps, oldest first.
 *
 * AsyncStorage is async and the picker is not, so the ring is hydrated once and
 * held in memory from then on. Callers await hydrateSeenLocs() before the first
 * read; every read after that is synchronous.
 */
const KEY = 'wg_seen';

let ring: string[] = [];
let hydrating: Promise<void> | null = null;

export function hydrateSeenLocs(): Promise<void> {
  if (!hydrating) {
    hydrating = AsyncStorage.getItem(KEY)
      .then((raw) => { ring = decodeRing(raw); })
      .catch(() => { ring = []; });
  }
  return hydrating;
}

export function seenLocs(): string[] {
  return ring;
}

export function markSeenLoc(loc: { lat: number; long: number } | null | undefined): void {
  const id = locKey(loc);
  if (!id) return;
  // Hydrate first, always. Multiplayer rounds record without ever going through
  // the fetch path, and writing an unhydrated ring would replace the player's
  // whole history with a single entry.
  hydrateSeenLocs()
    .then(() => {
      if (ring[ring.length - 1] === id) return; // same round re-rendered, not a new spot
      pushSeen(ring, id, DEFAULT_CAP);
      // 25KB at most, once per round. A lost write costs one spot of history.
      return AsyncStorage.setItem(KEY, encodeRing(ring));
    })
    .catch(() => {});
}
