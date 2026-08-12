import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CAP,
  ID_LEN,
  decodeRing,
  encodeRing,
  isOfficialMapSlug,
  locId,
  locKey,
  orderByFreshness,
  pushSeen,
  pushSeenLoc,
  sampleDistinct,
} from '../shared/locations/repeatGuard.js';

// 1,200 x 123 distinct coordinate pairs, which covers the real world pool
// (data/world-main.json holds 147,542 locations, zero duplicate coordinates).
// Built on demand so a 1,000-game simulation never materializes all of them.
const POOL_SIZE = 147542;
const locFor = (i) => ({ lat: (i % 1200) / 10 - 60, long: Math.floor(i / 1200) / 10 - 180 });

// One /allCountries.json response: cron samples 2,000 of the pool every 60s.
function slice(size = 2000, poolSize = POOL_SIZE) {
  const idx = new Set();
  while (idx.size < size) idx.add(Math.floor(Math.random() * poolSize));
  return [...idx].map(locFor);
}

describe('locId', () => {
  it('is a fixed-width base36 id', () => {
    const id = locId(51.5074, -0.1278);
    expect(id).toHaveLength(ID_LEN);
    expect(id).toMatch(/^[0-9a-z]{5}$/);
  });

  it('is stable and coordinate-specific', () => {
    expect(locId(51.5074, -0.1278)).toBe(locId(51.5074, -0.1278));
    expect(locId(51.5074, -0.1278)).not.toBe(locId(51.5075, -0.1278));
  });

  it('rounds to 5 decimals so float noise cannot split one spot in two', () => {
    expect(locId(51.50740000001, -0.1278)).toBe(locId(51.5074, -0.1278));
  });

  it('reads lng and long alike, because the pools use both', () => {
    expect(locKey({ lat: 10, lng: 20 })).toBe(locKey({ lat: 10, long: 20 }));
    expect(locKey(null)).toBeNull();
    expect(locKey({ lat: 10 })).toBeNull();
  });

  it('collides rarely enough to be irrelevant at ring scale', () => {
    const ids = new Set();
    for (let i = 0; i < 20000; i++) ids.add(locKey(locFor(i)));
    // A handful of collisions in 20,000 ids costs a skipped location, nothing more.
    expect(ids.size).toBeGreaterThan(19990);
  });
});

describe('ring encoding', () => {
  it('round-trips without delimiters', () => {
    const ids = [locId(1, 2), locId(3, 4), locId(5, 6)];
    expect(encodeRing(ids)).toHaveLength(3 * ID_LEN);
    expect(decodeRing(encodeRing(ids))).toEqual(ids);
  });

  it('survives junk in storage', () => {
    expect(decodeRing(null)).toEqual([]);
    expect(decodeRing('')).toEqual([]);
    expect(decodeRing('abc')).toEqual([]); // shorter than one id
  });

  it('costs 5 characters per remembered spot', () => {
    const ids = Array.from({ length: DEFAULT_CAP }, (_, i) => locKey(locFor(i)));
    expect(encodeRing(ids).length).toBe(DEFAULT_CAP * ID_LEN);
  });
});

describe('pushSeen', () => {
  it('caps the ring and drops the oldest', () => {
    const ids = [];
    for (let i = 0; i < 10; i++) pushSeen(ids, locKey(locFor(i)), 4);
    expect(ids).toHaveLength(4);
    expect(ids).toEqual([6, 7, 8, 9].map((i) => locKey(locFor(i))));
  });

  it('moves a re-seen spot to the end instead of duplicating it', () => {
    const ids = [];
    for (let i = 0; i < 3; i++) pushSeen(ids, locKey(locFor(i)), 10);
    pushSeen(ids, locKey(locFor(0)), 10);
    expect(ids).toEqual([1, 2, 0].map((i) => locKey(locFor(i))));
  });

  it('ignores a location it cannot identify', () => {
    const ids = [];
    pushSeenLoc(ids, null, 10);
    pushSeenLoc(ids, { lat: 1 }, 10);
    expect(ids).toEqual([]);
  });
});

describe('orderByFreshness', () => {
  it('puts never-seen spots first', () => {
    const locs = Array.from({ length: 10 }, (_, i) => locFor(i));
    const ring = [0, 1, 2].map((i) => locKey(locFor(i)));
    const ordered = orderByFreshness(locs, ring);
    const firstSeven = ordered.slice(0, 7).map(locKey);
    expect(firstSeven.some((id) => ring.includes(id))).toBe(false);
  });

  it('falls back to least-recently-seen instead of starving', () => {
    const locs = Array.from({ length: 5 }, (_, i) => locFor(i));
    // Seen in order 4,3,2,1,0 — so 4 is the oldest and must come back first.
    const ring = [];
    for (const i of [4, 3, 2, 1, 0]) pushSeen(ring, locKey(locFor(i)), 100);
    const ordered = orderByFreshness(locs, ring);
    expect(ordered).toHaveLength(5);
    expect(ordered.map(locKey)).toEqual([4, 3, 2, 1, 0].map((i) => locKey(locFor(i))));
  });

  it('keeps every location, never filters any away', () => {
    const locs = Array.from({ length: 50 }, (_, i) => locFor(i));
    const ring = locs.slice(0, 30).map(locKey);
    expect(orderByFreshness(locs, ring)).toHaveLength(50);
  });

  it('shuffles the unseen head (not a stable slice of the response)', () => {
    const locs = Array.from({ length: 200 }, (_, i) => locFor(i));
    const a = orderByFreshness(locs, []).slice(0, 5).map(locKey).join();
    const b = orderByFreshness(locs, []).slice(0, 5).map(locKey).join();
    expect(a).not.toBe(b);
  });
});

describe('sampleDistinct', () => {
  it('returns distinct locations', () => {
    const pool = Array.from({ length: 500 }, (_, i) => locFor(i));
    const picks = sampleDistinct(pool, 5);
    expect(new Set(picks.map(locKey)).size).toBe(5);
  });

  it('avoids the seen set when it can', () => {
    const pool = Array.from({ length: 500 }, (_, i) => locFor(i));
    const seen = new Set(pool.slice(0, 400).map(locKey));
    for (let run = 0; run < 50; run++) {
      for (const loc of sampleDistinct(pool, 5, seen)) {
        expect(seen.has(locKey(loc))).toBe(false);
      }
    }
  });

  it('still fills the round list when everything has been seen', () => {
    const pool = Array.from({ length: 8 }, (_, i) => locFor(i));
    const seen = new Set(pool.map(locKey));
    const picks = sampleDistinct(pool, 5, seen);
    expect(picks).toHaveLength(5);
    expect(new Set(picks.map(locKey)).size).toBe(5);
  });

  it('tops up when the pool is smaller than the round count (ws boot fallback)', () => {
    const pool = Array.from({ length: 3 }, (_, i) => locFor(i));
    expect(sampleDistinct(pool, 5)).toHaveLength(5);
  });

  it('dedupes across pools by coordinate, not object identity', () => {
    // world-main and world-arbitrary share 510 coordinates as separate objects.
    const shared = { lat: 1.5, long: 2.5 };
    const pool = [shared, { ...shared }, { ...shared }, { lat: 3, long: 4 }, { lat: 5, long: 6 }];
    const picks = sampleDistinct(pool, 3);
    expect(new Set(picks.map(locKey)).size).toBe(3);
  });
});

// The model behind the odds table: a player grinding the World map, served a
// fresh 2,000-row slice of the 147,542-location pool each game (60s TTL), with
// the ring ordering every response. The claim is zero repeats, structurally,
// for as many games as the ring has room for.
describe('no repeats for a grinding player', () => {
  const ROUNDS = 5;

  it('serves 1,000 games with no repeated location', () => {
    const ring = [];
    const served = new Set();
    let repeats = 0;

    for (let game = 0; game < DEFAULT_CAP / ROUNDS; game++) {
      const ordered = orderByFreshness(slice(), ring);
      for (const loc of ordered.slice(0, ROUNDS)) {
        const id = locKey(loc);
        if (served.has(id)) repeats++;
        served.add(id);
        pushSeen(ring, id, DEFAULT_CAP);
      }
    }

    expect(repeats).toBe(0);
    expect(served.size).toBe(DEFAULT_CAP);
    expect(ring).toHaveLength(DEFAULT_CAP);
  }, 120000);

  it('exhausts a tiny pool before repeating, and keeps working after', () => {
    // Cyprus serves 796 locations, the smallest official pool. The old code
    // deleted the player's history when filtering starved; ordering cannot.
    const CY = 796;
    const pool = Array.from({ length: CY }, (_, i) => locFor(i));
    const ring = [];
    const served = new Set();
    let repeats = 0;

    const games = Math.floor(CY / ROUNDS); // 159 games x 5 = 795 of the 796 spots
    for (let game = 0; game < games; game++) {
      for (const loc of orderByFreshness(pool, ring).slice(0, ROUNDS)) {
        const id = locKey(loc);
        if (served.has(id)) repeats++;
        served.add(id);
        pushSeen(ring, id, DEFAULT_CAP);
      }
    }
    expect(repeats).toBe(0);
    expect(served.size).toBe(games * ROUNDS);

    // Pool now down to its last unseen spot. The next game still gets a full
    // round list: the one spot never served, then the four seen longest ago.
    const next = orderByFreshness(pool, ring).slice(0, ROUNDS).map(locKey);
    expect(next).toHaveLength(ROUNDS);
    expect(served.has(next[0])).toBe(false);
    expect(next.slice(1)).toEqual(ring.slice(0, ROUNDS - 1));
  });
});

// Nothing in here should ever be able to hang a round, empty a round list, or
// throw on the way to a location. The picker sits directly in front of the
// player: a crash here is a black screen.
describe('hostile inputs', () => {
  it('survives malformed pool entries', () => {
    const junk = [{ lat: 1, long: 2 }, { lat: null, long: 5 }, {}, { lat: 3, lng: 4 }];
    expect(() => orderByFreshness(junk, [])).not.toThrow();
    expect(orderByFreshness(junk, [])).toHaveLength(4);
    expect(() => sampleDistinct(junk, 3, null)).not.toThrow();
  });

  it('fills a round list from a single-location pool without hanging', () => {
    const one = [{ lat: 9, long: 9 }];
    expect(sampleDistinct(one, 5, null)).toHaveLength(5);
    expect(orderByFreshness(one, [locKey(one[0])])).toHaveLength(1);
  });

  it('ignores a truncated ring instead of poisoning the order', () => {
    const ring = decodeRing('abcdefghijklmn'); // two ids plus four junk characters
    expect(ring).toHaveLength(2);
    const pool = Array.from({ length: 10 }, (_, i) => locFor(i));
    expect(orderByFreshness(pool, ring)).toHaveLength(10);
  });

  it('never grows past the cap, however long the player plays', () => {
    const ring = [];
    for (let i = 0; i < 20000; i++) pushSeen(ring, locKey(locFor(i)), DEFAULT_CAP);
    expect(ring).toHaveLength(DEFAULT_CAP);
    expect(encodeRing(ring)).toHaveLength(DEFAULT_CAP * ID_LEN);
  });

  it('does not mutate the array it is handed', () => {
    // home.js computes a community map's extent from the same array afterwards.
    const src = Array.from({ length: 5 }, (_, i) => locFor(i));
    const copy = [...src];
    orderByFreshness(src, []);
    expect(src).toEqual(copy);
  });

  it('migrates a legacy "lat,long" key to the same id as the live location', () => {
    const [lat, long] = '-33.86785200000001,151.20732799999998'.split(',');
    expect(locId(lat, long)).toBe(locKey({ lat: Number(lat), long: Number(long) }));
  });
});

describe('isOfficialMapSlug', () => {
  it('covers the World map and country codes only', () => {
    expect(isOfficialMapSlug('all')).toBe(true);
    expect(isOfficialMapSlug('US')).toBe(true);
    expect(isOfficialMapSlug('my-cool-map')).toBe(false);
    expect(isOfficialMapSlug('us')).toBe(false);
    expect(isOfficialMapSlug(undefined)).toBe(false);
  });
});
