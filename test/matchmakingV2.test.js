import { describe, it, expect } from 'vitest';
import {
  windowFor,
  ratingRangeFor,
  chooseDuelPairs,
  recordDodge,
  dodgeRemaining,
  sweepDodges,
  decayMultiplier,
  pairKey,
  readPairWins,
  bumpPairWins,
} from '../ws/matchmakingV2.js';

const NOW = 1_770_000_000_000; // fixed clock; every test passes `now` explicitly

// A queue entry as ws.js hands it in. Non-guests MUST carry
// placementPending: false — undefined means "the placement read is still in
// flight" and is deliberately held out of pairing.
const entry = (over = {}) => ({
  id: over.id ?? 'e1',
  accountId: over.accountId ?? over.id ?? 'e1',
  rating: 1000,
  guest: false,
  placementPending: false,
  queueTime: NOW,
  ...over,
});

describe('windowFor', () => {
  it('uses narrow 50/100 half-widths for the first 15s', () => {
    expect(windowFor(0)).toBe(50);
    expect(windowFor(4999)).toBe(50);
    expect(windowFor(5000)).toBe(100);
    expect(windowFor(14999)).toBe(100);
    expect(windowFor(15000)).toBe(150);
  });

  it('then widens one step per 15s up to 400 at 90s', () => {
    expect(windowFor(29999)).toBe(150);
    expect(windowFor(30000)).toBe(200);
    expect(windowFor(89999)).toBe(350);
  });

  it('switches to one step per 30s past 90s, uncapped', () => {
    expect(windowFor(90000)).toBe(400);
    expect(windowFor(119999)).toBe(400);
    expect(windowFor(120000)).toBe(450);
    expect(windowFor(150000)).toBe(500);
  });

  it('treats garbage waits as 0 rather than producing NaN', () => {
    expect(windowFor(undefined)).toBe(50);
    expect(windowFor(NaN)).toBe(50);
    expect(windowFor(-5000)).toBe(50);
    expect(windowFor(Infinity)).toBe(50);
  });

  it('is monotonic — waiting longer never narrows the window', () => {
    let prev = -1;
    for (let t = 0; t <= 600000; t += 1000) {
      const w = windowFor(t);
      expect(w).toBeGreaterThanOrEqual(prev);
      prev = w;
    }
  });
});

describe('ratingRangeFor — opening league clamp', () => {
  it('clips the 50/100 opening windows to the player league borders', () => {
    const bounds = { leagueMin: 800, leagueMax: 999 };
    expect(ratingRangeFor(0, 980, bounds)).toEqual([930, 999]);
    expect(ratingRangeFor(5000, 980, bounds)).toEqual([880, 999]);
    expect(ratingRangeFor(14999, 980, bounds)).toEqual([880, 999]);

    expect(ratingRangeFor(0, 810, bounds)).toEqual([800, 860]);
    expect(ratingRangeFor(5000, 810, bounds)).toEqual([800, 910]);
  });

  it('waives only the upper clamp within 10 ELO of the ceiling', () => {
    const bounds = { leagueMin: 800, leagueMax: 999 };
    expect(ratingRangeFor(0, 989, bounds)).toEqual([939, 1039]);
    expect(ratingRangeFor(5000, 989, bounds)).toEqual([889, 1089]);
    expect(ratingRangeFor(0, 988, bounds)).toEqual([938, 999]);
  });

  it('releases the league clamp exactly at 15s', () => {
    const bounds = { leagueMin: 800, leagueMax: 999 };
    expect(ratingRangeFor(15000, 990, bounds)).toEqual([840, 1140]);
  });

  // The other half of the boundary grace. hasUpperBoundaryGrace waives the lock
  // for BOTH sides of the pair, so the upper player's floor has to drop with it.
  it('drops the floor to the tier below, minus the grace, for the upper player', () => {
    const bounds = { leagueMin: 800, leagueMax: 999, leagueBelowMax: 799 };
    // 805 - 50 = 755 is below the graced floor, so the grace binds: 799 - 10.
    expect(ratingRangeFor(0, 805, bounds)).toEqual([789, 855]);
    // Far enough up that the ordinary window binds first and the grace is moot.
    expect(ratingRangeFor(0, 900, bounds)).toEqual([850, 950]);
  });

  it('leaves the floor at the league min when there is no tier below', () => {
    // Bottom tier: getLeagueBelow returns null, so ws.js passes undefined.
    expect(ratingRangeFor(0, 30, { leagueMin: 0, leagueMax: 799 })).toEqual([0, 80]);
    // Explicit undefined must behave identically to the field being absent.
    expect(ratingRangeFor(0, 805, { leagueMin: 800, leagueMax: 999, leagueBelowMax: undefined }))
      .toEqual([800, 855]);
  });

  it('never lets a malformed tier table RAISE the floor', () => {
    // leagueBelowMax at/above this tier's own floor is a broken table. The
    // clamp must not push the displayed floor upward because of it.
    const broken = { leagueMin: 800, leagueMax: 999, leagueBelowMax: 900 };
    expect(ratingRangeFor(0, 805, broken)).toEqual([800, 855]);
  });

  it('keeps the strict floor ahead of the boundary grace', () => {
    // A strict Voyager may NOT be paired below the Voyager line, so the grace
    // floor must not advertise Explorer opponents this queue cannot produce.
    const opts = { leagueMin: 1000, leagueMax: 1299, leagueBelowMax: 999, strictFloor: 1000 };
    expect(ratingRangeFor(0, 1005, opts)).toEqual([1000, 1055]);
  });

  // THE REGRESSION THIS EXISTS FOR: the band and the matchmaker must agree.
  it('shows a floor that actually covers who chooseDuelPairs will pair down to', () => {
    const bounds = { leagueMin: 800, leagueMax: 999, leagueBelowMax: 799 };
    const upper = entry({ id: 'upper', rating: 805, leagueMin: 800, leagueMax: 999 });
    const lower = entry({ id: 'lower', rating: 795, leagueMin: 0, leagueMax: 799 });

    const pairs = chooseDuelPairs([upper, lower], { now: NOW });
    expect(pairs).toHaveLength(1);

    const [lo, hi] = ratingRangeFor(0, 805, bounds);
    expect(lower.rating).toBeGreaterThanOrEqual(lo);
    expect(lower.rating).toBeLessThanOrEqual(hi);
  });

  it('keeps a strict floor after the opening league clamp releases', () => {
    const opts = { leagueMin: 1000, leagueMax: 1299, strictFloor: 1000 };
    expect(ratingRangeFor(0, 1000, opts)).toEqual([1000, 1050]);
    expect(ratingRangeFor(15000, 1000, opts)).toEqual([1000, 1150]);
  });
});


describe('chooseDuelPairs — closest-rating selection', () => {
  it('takes the CLOSEST compatible opponent, not the first in array order', () => {
    const anchor = entry({ id: 'anchor', rating: 1000 });
    const far = entry({ id: 'far', rating: 1040 });
    const near = entry({ id: 'near', rating: 1010 });
    const mid = entry({ id: 'mid', rating: 980 });

    // `far` deliberately sits first: first-fit would have picked it (40 <= 50).
    const pairs = chooseDuelPairs([anchor, far, near, mid], { now: NOW });

    expect(pairs).toHaveLength(1);
    expect(pairs[0].a.id).toBe('anchor');
    expect(pairs[0].b.id).toBe('near');
  });

  it('pairs the longest waiter first', () => {
    const old = entry({ id: 'old', rating: 1000, queueTime: NOW - 40000 });
    const fresh = entry({ id: 'fresh', rating: 1000 });
    const pairs = chooseDuelPairs([fresh, old], { now: NOW });

    expect(pairs).toHaveLength(1);
    expect(pairs[0].a.id).toBe('old');
  });
});

describe('chooseDuelPairs — mutual window uses min(), not max()', () => {
  it('refuses a lopsided match a long waiter would otherwise drag someone into', () => {
    // Anchor 120s deep has a 450 window; the fresh joiner has 50. The gap is
    // 300: inside the anchor's window, outside the joiner's. The starvation
    // valve does NOT rescue this pair — the joiner is still inside their
    // protected first 10s — so the min() veto stands.
    const anchor = entry({ id: 'anchor', rating: 1000, queueTime: NOW - 120000 });
    const fresh = entry({ id: 'fresh', rating: 1300 });

    expect(windowFor(120000)).toBe(450);
    expect(windowFor(0)).toBe(50);
    expect(chooseDuelPairs([anchor, fresh], { now: NOW })).toEqual([]);
  });

  it('allows the same gap once BOTH sides have waited long enough', () => {
    const a = entry({ id: 'a', rating: 1000, queueTime: NOW - 120000 });
    const b = entry({ id: 'b', rating: 1300, queueTime: NOW - 120000 });
    const pairs = chooseDuelPairs([a, b], { now: NOW });

    expect(pairs).toHaveLength(1);
  });
});

// The min() trade-off's failure mode, observed live Aug 16: a liquid low pool
// pairs its fresh joiners in seconds, so their windows never widen and a
// high-rated waiter starves without bound. Past STARVED_WAIT_MS the longer
// waiter's window judges the pair alone; the shorter waiter keeps their
// protected first 10s, which for a starved pair also stands in for the
// opening league lock.
describe('chooseDuelPairs — starvation valve', () => {
  it('lets a 2-minute waiter reach a candidate whose own window is too narrow', () => {
    // Gap 300. Starved anchor's window is 450; the candidate at 15s has only
    // 150, so min() alone would veto. The valve pairs them.
    const starved = entry({ id: 'starved', rating: 1400, queueTime: NOW - 120000 });
    const candidate = entry({ id: 'candidate', rating: 1100, queueTime: NOW - 15000 });

    const pairs = chooseDuelPairs([starved, candidate], { now: NOW });
    expect(pairs).toHaveLength(1);
    expect(pairs[0].a.id).toBe('starved');
  });

  it('does not open one tick before the threshold', () => {
    const almost = entry({ id: 'almost', rating: 1400, queueTime: NOW - 119999 });
    const candidate = entry({ id: 'candidate', rating: 1100, queueTime: NOW - 15000 });
    expect(chooseDuelPairs([almost, candidate], { now: NOW })).toEqual([]);
  });

  it('never reaches a candidate still inside their protected first 10s', () => {
    const starved = entry({ id: 'starved', rating: 1400, queueTime: NOW - 300000 });
    const fresh = entry({ id: 'fresh', rating: 1100, queueTime: NOW - 9999 });
    expect(chooseDuelPairs([starved, fresh], { now: NOW })).toEqual([]);
  });

  it('opens exactly at the partner 10s floor, replacing the 15s league lock', () => {
    // Cross-league pair with the candidate in the 10-15s sliver: the opening
    // league lock would veto until 15s, but for a starved pair the valve's own
    // 10s floor is the whole protection.
    const starved = entry({
      id: 'starved', rating: 1400, queueTime: NOW - 300000,
      leagueMin: 1300, leagueMax: 1599,
    });
    const candidate = entry({
      id: 'candidate', rating: 1100, queueTime: NOW - 10000,
      leagueMin: 1000, leagueMax: 1299,
    });
    expect(chooseDuelPairs([starved, candidate], { now: NOW })).toHaveLength(1);
  });

  it('is order-independent — the starved player may sit anywhere in the input', () => {
    const starved = entry({ id: 'starved', rating: 1400, queueTime: NOW - 120000 });
    const candidate = entry({ id: 'candidate', rating: 1100, queueTime: NOW - 15000 });
    expect(chooseDuelPairs([candidate, starved], { now: NOW })).toHaveLength(1);
    expect(chooseDuelPairs([starved, candidate], { now: NOW })).toHaveLength(1);
  });

  it('still takes the CLOSEST candidate, not the freshest or first', () => {
    const starved = entry({ id: 'starved', rating: 1400, queueTime: NOW - 120000 });
    const far = entry({ id: 'far', rating: 1000, queueTime: NOW - 20000 });
    const near = entry({ id: 'near', rating: 1150, queueTime: NOW - 16000 });

    const pairs = chooseDuelPairs([starved, far, near], { now: NOW });
    expect(pairs).toHaveLength(1);
    expect(pairs[0].b.id).toBe('near');
  });

  it('does not waive strict matchmaking', () => {
    // Strict is an explicit opt-in; starving is the price the player accepted.
    const starved = entry({ id: 'starved', rating: 1400, queueTime: NOW - 300000, strict: true });
    const below = entry({ id: 'below', rating: 1100, queueTime: NOW - 20000 });
    expect(chooseDuelPairs([starved, below], { now: NOW, strictFloor: 1300 })).toEqual([]);
  });
});

describe('chooseDuelPairs — first-15s league lock', () => {
  const explorer = { leagueMin: 800, leagueMax: 999 };
  const voyager = { leagueMin: 1000, leagueMax: 1299 };

  it('still pairs nearby players inside the same league', () => {
    const a = entry({ id: 'a', rating: 980, ...explorer });
    const b = entry({ id: 'b', rating: 995, ...explorer });
    expect(chooseDuelPairs([a, b], { now: NOW })).toHaveLength(1);
  });

  it('blocks a cross-league pair through the end of the first 15s', () => {
    for (const waited of [0, 5000, 14999]) {
      const a = entry({ id: 'a', rating: 988, queueTime: NOW - waited, ...explorer });
      const b = entry({ id: 'b', rating: 1005, queueTime: NOW - waited, ...voyager });
      expect(chooseDuelPairs([a, b], { now: NOW })).toEqual([]);
    }
  });

  it('does not let an unlocked waiter pull a fresh player across leagues', () => {
    const old = entry({ id: 'old', rating: 988, queueTime: NOW - 15000, ...explorer });
    const fresh = entry({ id: 'fresh', rating: 1005, ...voyager });
    expect(chooseDuelPairs([old, fresh], { now: NOW })).toEqual([]);
  });

  it('lets a ceiling-adjacent player cross upward immediately', () => {
    const lower = entry({ id: 'lower', rating: 989, ...explorer });
    const higher = entry({ id: 'higher', rating: 1005, ...voyager });
    expect(chooseDuelPairs([lower, higher], { now: NOW })).toHaveLength(1);
  });

  it('also overrides a fresh higher-league lower clamp for an older qualifying player', () => {
    const lower = entry({ id: 'lower', rating: 995, queueTime: NOW - 15000, ...explorer });
    const higher = entry({ id: 'higher', rating: 1005, ...voyager });
    expect(chooseDuelPairs([lower, higher], { now: NOW })).toHaveLength(1);
  });

  it('allows cross-league matching once both players reach 15s', () => {
    const a = entry({ id: 'a', rating: 995, queueTime: NOW - 15000, ...explorer });
    const b = entry({ id: 'b', rating: 1005, queueTime: NOW - 15000, ...voyager });
    expect(chooseDuelPairs([a, b], { now: NOW })).toHaveLength(1);
  });
});

describe('chooseDuelPairs — carve-outs', () => {
  it('excludes placementPending === true', () => {
    const a = entry({ id: 'a', placementPending: true });
    const b = entry({ id: 'b', placementPending: true });
    expect(chooseDuelPairs([a, b], { now: NOW })).toEqual([]);
  });

  it('excludes placementPending === undefined (read still in flight)', () => {
    // undefined must NOT be read as "not pending": an unplaced rating in the
    // pool produces a garbage match.
    const a = entry({ id: 'a', placementPending: undefined });
    const b = entry({ id: 'b', placementPending: undefined });
    expect(chooseDuelPairs([a, b], { now: NOW })).toEqual([]);
  });

  it('excludes a pending player while leaving the rest of the queue alone', () => {
    const pending = entry({ id: 'pending', placementPending: true });
    const ready = entry({ id: 'ready' });
    expect(chooseDuelPairs([pending, ready], { now: NOW })).toEqual([]);
  });

  it('excludes botEligible players — newbies always get a bot', () => {
    const bot = entry({ id: 'bot', botEligible: true });
    const human = entry({ id: 'human' });
    expect(chooseDuelPairs([bot, human], { now: NOW })).toEqual([]);

    const bot2 = entry({ id: 'bot2', botEligible: true });
    expect(chooseDuelPairs([bot, bot2], { now: NOW })).toEqual([]);
  });

  it('ignores null/garbage entries instead of throwing', () => {
    expect(chooseDuelPairs([null, undefined], { now: NOW })).toEqual([]);
    expect(chooseDuelPairs(null, { now: NOW })).toEqual([]);
    expect(chooseDuelPairs(undefined, { now: NOW })).toEqual([]);
  });
});

describe('chooseDuelPairs — guests', () => {
  it('pairs guests only with guests', () => {
    const guest = entry({ id: 'g1', guest: true, rating: 0, placementPending: undefined });
    const account = entry({ id: 'a1', rating: 0 });
    expect(chooseDuelPairs([guest, account], { now: NOW })).toEqual([]);
  });

  it('pairs two guests regardless of rating, and without a placement read', () => {
    const g1 = entry({ id: 'g1', guest: true, rating: 0, placementPending: undefined });
    const g2 = entry({ id: 'g2', guest: true, rating: 9999, placementPending: undefined });
    const pairs = chooseDuelPairs([g1, g2], { now: NOW });

    expect(pairs).toHaveLength(1);
    expect([pairs[0].a.id, pairs[0].b.id].sort()).toEqual(['g1', 'g2']);
  });
});

describe('chooseDuelPairs — disjointness', () => {
  it('never puts one entry in two pairs', () => {
    const entries = [
      entry({ id: 'a', rating: 1000 }),
      entry({ id: 'b', rating: 1010 }),
      entry({ id: 'c', rating: 1500 }),
      entry({ id: 'd', rating: 1510 }),
    ];
    const pairs = chooseDuelPairs(entries, { now: NOW });

    expect(pairs).toHaveLength(2);
    const ids = pairs.flatMap((p) => [p.a.id, p.b.id]);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
  });

  it('leaves the odd one out unpaired', () => {
    const entries = [
      entry({ id: 'a', rating: 1000 }),
      entry({ id: 'b', rating: 1005 }),
      entry({ id: 'c', rating: 1010 }),
    ];
    const pairs = chooseDuelPairs(entries, { now: NOW });

    expect(pairs).toHaveLength(1);
    const ids = new Set(pairs.flatMap((p) => [p.a.id, p.b.id]));
    expect(ids.size).toBe(2);
  });

  it('is deterministic for a given input', () => {
    const build = () => [
      entry({ id: 'a', rating: 1000 }),
      entry({ id: 'b', rating: 1010 }),
      entry({ id: 'c', rating: 1020 }),
      entry({ id: 'd', rating: 1030 }),
    ];
    const first = chooseDuelPairs(build(), { now: NOW }).map((p) => [p.a.id, p.b.id]);
    const second = chooseDuelPairs(build(), { now: NOW }).map((p) => [p.a.id, p.b.id]);
    expect(second).toEqual(first);
  });
});

describe('chooseDuelPairs — rematch prevention', () => {
  const rematchPair = (lastOpponentAt, queueTime = NOW) => [
    entry({ id: 'a', accountId: 'A', queueTime, lastOpponentId: 'B', lastOpponentAt }),
    entry({ id: 'b', accountId: 'B', queueTime, lastOpponentId: 'A', lastOpponentAt }),
  ];

  it('blocks a rematch inside the 60s waiver window', () => {
    expect(chooseDuelPairs(rematchPair(NOW - 1000), { now: NOW })).toEqual([]);
    expect(chooseDuelPairs(rematchPair(NOW - 59999), { now: NOW })).toEqual([]);
  });

  it('allows the rematch once the waiver window has elapsed', () => {
    expect(chooseDuelPairs(rematchPair(NOW - 60000), { now: NOW })).toHaveLength(1);
    expect(chooseDuelPairs(rematchPair(NOW - 120000), { now: NOW })).toHaveLength(1);
  });

  it('allows the rematch once a player has waited past the waiver', () => {
    // Waiting longer than the waiver is the escape hatch from an empty queue.
    const pairs = chooseDuelPairs(rematchPair(NOW - 1000, NOW - 61000), { now: NOW });
    expect(pairs).toHaveLength(1);
  });

  it('blocks symmetrically — only ONE side needs the stamp', () => {
    const a = entry({ id: 'a', accountId: 'A', lastOpponentId: 'B', lastOpponentAt: NOW - 1000 });
    const b = entry({ id: 'b', accountId: 'B' }); // no stamp of its own
    expect(chooseDuelPairs([a, b], { now: NOW })).toEqual([]);
    expect(chooseDuelPairs([b, a], { now: NOW })).toEqual([]);
  });

  it('treats a MISSING lastOpponentAt as recent (fails closed)', () => {
    const a = entry({ id: 'a', accountId: 'A', lastOpponentId: 'B' });
    const b = entry({ id: 'b', accountId: 'B' });
    expect(chooseDuelPairs([a, b], { now: NOW })).toEqual([]);
  });

  it('matches the stamp against a socket id as well as an accountId', () => {
    const a = entry({ id: 'a', accountId: 'A', lastOpponentId: 'b', lastOpponentAt: NOW - 1000 });
    const b = entry({ id: 'b', accountId: 'B' });
    expect(chooseDuelPairs([a, b], { now: NOW })).toEqual([]);
  });

  it('does not block a DIFFERENT opponent', () => {
    const a = entry({ id: 'a', accountId: 'A', lastOpponentId: 'ZZZ', lastOpponentAt: NOW - 1000 });
    const b = entry({ id: 'b', accountId: 'B' });
    expect(chooseDuelPairs([a, b], { now: NOW })).toHaveLength(1);
  });

  it('honours an explicit rematchWaiverMs and allowRematch override', () => {
    expect(chooseDuelPairs(rematchPair(NOW - 5000), { now: NOW, rematchWaiverMs: 1000 })).toHaveLength(1);
    expect(chooseDuelPairs(rematchPair(NOW - 1000), { now: NOW, allowRematch: true })).toHaveLength(1);
  });
});

describe('dodge cooldown', () => {
  it('charges 30s for a first offense', () => {
    const map = new Map();
    expect(recordDodge(map, 'p1', NOW)).toBe(30000);
    expect(dodgeRemaining(map, 'p1', NOW)).toBe(30000);
  });

  it('escalates to 120s for a repeat inside the 1h memory window', () => {
    const map = new Map();
    recordDodge(map, 'p1', NOW);
    expect(recordDodge(map, 'p1', NOW + 600000)).toBe(120000); // +10 min
    expect(map.get('p1').count).toBe(2);
  });

  it('resets to 30s once the memory window has passed', () => {
    const map = new Map();
    recordDodge(map, 'p1', NOW);
    recordDodge(map, 'p1', NOW + 600000);
    // +2h from the last dodge is outside the 1h memory: a fresh first offense.
    expect(recordDodge(map, 'p1', NOW + 600000 + 7200000)).toBe(30000);
    expect(map.get('p1').count).toBe(1);
  });

  it('counts down and clears', () => {
    const map = new Map();
    recordDodge(map, 'p1', NOW);
    expect(dodgeRemaining(map, 'p1', NOW + 29999)).toBe(1);
    expect(dodgeRemaining(map, 'p1', NOW + 30000)).toBe(0);
    expect(dodgeRemaining(map, 'p1', NOW + 999999)).toBe(0);
  });

  it('reports 0 for unknown players and missing maps', () => {
    expect(dodgeRemaining(new Map(), 'nobody', NOW)).toBe(0);
    expect(dodgeRemaining(null, 'p1', NOW)).toBe(0);
    expect(dodgeRemaining(undefined, 'p1', NOW)).toBe(0);
    expect(recordDodge(null, 'p1', NOW)).toBe(0);
    expect(recordDodge(new Map(), null, NOW)).toBe(0);
  });

  it('sweeps entries older than the 1h memory window and keeps the rest', () => {
    const map = new Map();
    recordDodge(map, 'old', NOW);
    recordDodge(map, 'recent', NOW + 3599999);

    expect(sweepDodges(map, NOW + 3600000)).toBe(1);
    expect(map.has('old')).toBe(false);
    expect(map.has('recent')).toBe(true);
  });

  it('never evicts a player still serving a cooldown', () => {
    const map = new Map();
    recordDodge(map, 'p1', NOW);
    recordDodge(map, 'p1', NOW + 1000); // 120s cooldown, lastAt NOW+1000

    expect(sweepDodges(map, NOW + 1000 + 119999)).toBe(0);
    expect(dodgeRemaining(map, 'p1', NOW + 1000 + 119999)).toBe(1);
  });

  it('is safe on a null map', () => {
    expect(sweepDodges(null, NOW)).toBe(0);
  });
});

describe('decayMultiplier', () => {
  it('pays full value for the first three wins over the same opponent', () => {
    expect(decayMultiplier(0)).toBe(1);
    expect(decayMultiplier(1)).toBe(1);
    expect(decayMultiplier(2)).toBe(1);
    expect(decayMultiplier(3)).toBe(1);
  });

  it('steps down to nothing by the eighth win', () => {
    expect(decayMultiplier(4)).toBe(0.75);
    expect(decayMultiplier(5)).toBe(0.5);
    expect(decayMultiplier(6)).toBe(0.25);
    expect(decayMultiplier(7)).toBe(0);
    expect(decayMultiplier(8)).toBe(0);
    expect(decayMultiplier(9999)).toBe(0);
  });

  it('treats garbage counts as 0 wins', () => {
    expect(decayMultiplier(undefined)).toBe(1);
    expect(decayMultiplier(NaN)).toBe(1);
    expect(decayMultiplier(-3)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Anti-farm pair counters. Persistence is INJECTED, so this exercises the real
// functions against an in-memory fake. No mongoose is imported anywhere here.
// ---------------------------------------------------------------------------
function makeFakeStore(seed = []) {
  const rows = seed.map((r) => ({ ...r }));
  const find = (q) => rows.find((r) => r.utcDay === q.utcDay && r.winner === q.winner && r.loser === q.loser);

  return {
    rows,
    calls: { findOne: 0, findOneAndUpdate: 0 },
    lastUpdate: null,
    async findOne(query) {
      this.calls.findOne++;
      return find(query) || null;
    },
    async findOneAndUpdate(query, update, options) {
      this.calls.findOneAndUpdate++;
      this.lastUpdate = { query, update, options };

      let row = find(query);
      if (!row) {
        if (!options?.upsert) return null;
        row = { ...query, wins: 0 };
        rows.push(row);
      }
      for (const [field, by] of Object.entries(update?.$inc || {})) {
        row[field] = (row[field] || 0) + by;
      }
      Object.assign(row, update?.$set || {});
      return options?.new ? row : null;
    },
  };
}

describe('pairKey', () => {
  it('is a stable, directional (day, winner, loser) key', () => {
    expect(pairKey('2026-08-06', 'A', 'B')).toBe('2026-08-06:A:B');
    expect(pairKey('2026-08-06', 'B', 'A')).toBe('2026-08-06:B:A');
    expect(pairKey('2026-08-06', 'A', 'B')).not.toBe(pairKey('2026-08-07', 'A', 'B'));
  });
});

describe('readPairWins / bumpPairWins (fake store)', () => {
  const DAY = '2026-08-06';

  it('reads 0 for a pair with no row today', async () => {
    const store = makeFakeStore();
    expect(await readPairWins(store, DAY, 'A', 'B')).toBe(0);
    expect(store.calls.findOne).toBe(1);
  });

  it('reads an existing count', async () => {
    const store = makeFakeStore([{ utcDay: DAY, winner: 'A', loser: 'B', wins: 3 }]);
    expect(await readPairWins(store, DAY, 'A', 'B')).toBe(3);
  });

  it('is directional — B beating A does not read A\'s counter', async () => {
    const store = makeFakeStore([{ utcDay: DAY, winner: 'A', loser: 'B', wins: 3 }]);
    expect(await readPairWins(store, DAY, 'B', 'A')).toBe(0);
  });

  it('is day-scoped', async () => {
    const store = makeFakeStore([{ utcDay: DAY, winner: 'A', loser: 'B', wins: 3 }]);
    expect(await readPairWins(store, '2026-08-07', 'A', 'B')).toBe(0);
  });

  it('upserts and increments in ONE round trip, returning the new count', async () => {
    const store = makeFakeStore();

    expect(await bumpPairWins(store, DAY, 'A', 'B', Date.now())).toBe(1);
    expect(await bumpPairWins(store, DAY, 'A', 'B', Date.now())).toBe(2);
    expect(await bumpPairWins(store, DAY, 'A', 'B', Date.now())).toBe(3);

    expect(store.calls.findOneAndUpdate).toBe(3);
    expect(store.lastUpdate.update.$inc).toEqual({ wins: 1 });
    expect(store.lastUpdate.options).toMatchObject({ upsert: true, new: true });
  });

  it('refreshes expiresAt on every bump so the TTL index reaps the row', async () => {
    const store = makeFakeStore();
    const now = 1_770_000_000_000;
    await bumpPairWins(store, DAY, 'A', 'B', now);

    const expiresAt = store.rows[0].expiresAt;
    expect(expiresAt).toBeInstanceOf(Date);
    expect(expiresAt.getTime()).toBe(now + 48 * 60 * 60 * 1000);

    await bumpPairWins(store, DAY, 'A', 'B', now + 60000);
    expect(store.rows[0].expiresAt.getTime()).toBe(now + 60000 + 48 * 60 * 60 * 1000);
  });

  it('read-then-bump-then-read is the production sequence', async () => {
    const store = makeFakeStore();
    expect(await readPairWins(store, DAY, 'A', 'B')).toBe(0);
    expect(decayMultiplier(0)).toBe(1);

    for (let i = 0; i < 7; i++) await bumpPairWins(store, DAY, 'A', 'B', Date.now());

    const wins = await readPairWins(store, DAY, 'A', 'B');
    expect(wins).toBe(7);
    expect(decayMultiplier(wins)).toBe(0); // farming is worth nothing by now
  });

  it('returns 0 rather than throwing when the store or ids are missing', async () => {
    expect(await readPairWins(null, DAY, 'A', 'B')).toBe(0);
    expect(await readPairWins(makeFakeStore(), DAY, null, 'B')).toBe(0);
    expect(await readPairWins(makeFakeStore(), DAY, 'A', null)).toBe(0);
    expect(await bumpPairWins(null, DAY, 'A', 'B')).toBe(0);
    expect(await bumpPairWins(makeFakeStore(), DAY, null, 'B')).toBe(0);
  });
});

// ===========================================================================
// STRICT MATCHMAKING
// ===========================================================================
// "Avoid lower skill duels": a Voyager+ player opts out of ever being matched
// below the Voyager line. On by default.
//
// It shipped DEAD. Every gate compared a v2 rating (ceiling ~1600) against
// `leagues.voyager.min`, which is 5,000 on the retired Season 0 scale, so the
// condition was false for every account alive: the toggle was hidden on both
// clients, the queue entry was never stamped, the server would have refused it
// anyway, and chooseDuelPairs did not read the flag at all. The User field, the
// wire message and the "5000+ ELO" copy all kept shipping.
//
// The floor is INJECTED (opts.strictFloor) rather than imported, so this module
// stays pure and a seasonal re-anchor moves the floor with the tier table.
const FLOOR = 1000; // leaguesV2.voyagerV2.min

describe('chooseDuelPairs — strict matchmaking', () => {
  it('refuses a sub-floor candidate for a strict anchor', () => {
    const strict = entry({ id: 'strict', rating: 1000, strict: true, queueTime: NOW - 15000 });
    const low = entry({ id: 'low', rating: 900, queueTime: NOW - 15000 }); // inside the 150 window, below the floor

    const pairs = chooseDuelPairs([strict, low], { now: NOW, strictFloor: FLOOR });
    expect(pairs).toEqual([]);
  });

  it('is symmetric: the answer cannot depend on who is the anchor this tick', () => {
    // Anchors are taken longest-wait-first, so swap the waits to swap the roles.
    const a = chooseDuelPairs(
      [entry({ id: 'strict', rating: 1000, strict: true, queueTime: NOW - 30000 }),
       entry({ id: 'low', rating: 900, queueTime: NOW - 15000 })],
      { now: NOW, strictFloor: FLOOR });
    const b = chooseDuelPairs(
      [entry({ id: 'strict', rating: 1000, strict: true, queueTime: NOW - 15000 }),
       entry({ id: 'low', rating: 900, queueTime: NOW - 30000 })],
      { now: NOW, strictFloor: FLOOR });

    expect(a).toEqual([]);
    expect(b).toEqual([]);
  });

  it('still pairs a strict player with someone at or above the floor', () => {
    const strict = entry({ id: 'strict', rating: 1000, strict: true });
    const ok = entry({ id: 'ok', rating: FLOOR });

    const pairs = chooseDuelPairs([strict, ok], { now: NOW, strictFloor: FLOOR });
    expect(pairs).toHaveLength(1);
    expect(new Set([pairs[0].a.id, pairs[0].b.id])).toEqual(new Set(['strict', 'ok']));
  });

  it('pairs two strict players with each other normally', () => {
    const a = entry({ id: 'a', rating: 1200, strict: true });
    const b = entry({ id: 'b', rating: 1180, strict: true });

    const pairs = chooseDuelPairs([a, b], { now: NOW, strictFloor: FLOOR });
    expect(pairs).toHaveLength(1);
  });

  it('leaves non-strict players free to meet anyone', () => {
    const high = entry({ id: 'high', rating: 1000, queueTime: NOW - 15000 });
    const low = entry({ id: 'low', rating: 900, queueTime: NOW - 15000 });

    const pairs = chooseDuelPairs([high, low], { now: NOW, strictFloor: FLOOR });
    expect(pairs).toHaveLength(1);
  });

  it('does NOT let a blocked candidate steal the closest-rating slot', () => {
    // This is why the strict check sits BEFORE the bestDiff comparison. `near`
    // is the closest by rating but is below the floor; `far` is legal. A check
    // placed after the comparison would pick `near`, fail, and pair nobody.
    const strict = entry({ id: 'strict', rating: 1000, strict: true, queueTime: NOW - 15000 });
    const near = entry({ id: 'near', rating: 999, queueTime: NOW - 15000 });  // 1 away, one under the floor
    const far = entry({ id: 'far', rating: 1100, queueTime: NOW - 15000 });   // 100 away, legal

    const pairs = chooseDuelPairs([strict, near, far], { now: NOW, strictFloor: FLOOR });
    expect(pairs).toHaveLength(1);
    expect(new Set([pairs[0].a.id, pairs[0].b.id])).toEqual(new Set(['strict', 'far']));
  });

  it('is NOT waived by a long wait, unlike the rematch rule', () => {
    // Rematch prevention has a 60s escape hatch because it is a system-imposed
    // restriction. Strict is an explicit opt-in, so quietly overriding it after
    // a minute would be the opposite of what the player asked for. The uncapped
    // widening is what eventually finds them someone above the floor.
    const strict = entry({ id: 'strict', rating: 1000, strict: true, queueTime: NOW - 600000 });
    const low = entry({ id: 'low', rating: 500, queueTime: NOW - 600000 });

    const pairs = chooseDuelPairs([strict, low], { now: NOW, strictFloor: FLOOR });
    expect(pairs).toEqual([]);
  });

  it('is inert when no floor is supplied, so a caller that knows nothing about it is unaffected', () => {
    const strict = entry({ id: 'strict', rating: 1000, strict: true, queueTime: NOW - 15000 });
    const low = entry({ id: 'low', rating: 900, queueTime: NOW - 15000 });

    expect(chooseDuelPairs([strict, low], { now: NOW })).toHaveLength(1);
    expect(chooseDuelPairs([strict, low], { now: NOW, strictFloor: 0 })).toHaveLength(1);
    expect(chooseDuelPairs([strict, low], { now: NOW, strictFloor: NaN })).toHaveLength(1);
  });

  it('a strict player at the very bottom of the pool still matches upward', () => {
    // Someone sitting exactly ON the floor is not blocked by their own setting.
    const strict = entry({ id: 'strict', rating: FLOOR, strict: true, queueTime: NOW - 15000 });
    const above = entry({ id: 'above', rating: FLOOR + 60, queueTime: NOW - 15000 });

    expect(chooseDuelPairs([strict, above], { now: NOW, strictFloor: FLOOR })).toHaveLength(1);
  });
});
