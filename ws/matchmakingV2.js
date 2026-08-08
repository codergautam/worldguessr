// Ranked 1v1 matchmaking v2. PURE — plain data in, plain data out.
//
// IMPORT SAFETY IS THE POINT OF THIS FILE. It must stay importable from a unit
// test with zero side effects, so it may never import ws/ws.js (binds a port,
// opens Redis and calls config() at module scope) or ws/classes/Game.js (pulls
// mongoose models). The only import here is serverUtils/stamps/periods.js,
// which is itself pure and import-free.
//
// Persistence is INJECTED, not imported: the anti-farm helpers take a `store`
// adapter with findOne/findOneAndUpdate. Production passes models/PairWins.js,
// tests pass a fake. Nothing in this file touches mongoose.
//
// Callers hand in plain queue entries, shaped:
//   { id, rating, guest, queueTime, accountId,
//     placementPending, botEligible, lastOpponentId, lastOpponentAt }

import { dayKeyUTC } from '../serverUtils/stamps/periods.js';

// ---------------------------------------------------------------------------
// 1. Rating window
// ---------------------------------------------------------------------------

const BASE_WINDOW = 150;      // half-width for the first 15s of waiting
const WINDOW_STEP = 50;       // every widen step, early or late
const EARLY_INTERVAL = 15000; // one step per 15s...
const EARLY_CAP = 400;        // ...until 400
const EARLY_CAP_AT = 75000;   // which lands exactly at 75s
const LATE_INTERVAL = 30000;  // after that, one step per 30s, forever

/**
 * Rating window half-width for a player who has waited `waitedMs`.
 *
 * Past 75s the widening is UNCAPPED on purpose: an eventual match with no extra
 * UI beats a "no opponents found" dead end. It is only honest because
 * chooseDuelPairs always takes the CLOSEST compatible opponent, so a wide
 * window is permission to reach far, never an instruction to.
 */
export function windowFor(waitedMs) {
  const waited = Number.isFinite(waitedMs) && waitedMs > 0 ? waitedMs : 0;
  if (waited < EARLY_CAP_AT) {
    return BASE_WINDOW + WINDOW_STEP * Math.floor(waited / EARLY_INTERVAL);
  }
  return EARLY_CAP + WINDOW_STEP * Math.floor((waited - EARLY_CAP_AT) / LATE_INTERVAL);
}

// ---------------------------------------------------------------------------
// 2. Pair selection
// ---------------------------------------------------------------------------

const DEFAULT_REMATCH_WAIVER_MS = 60000;

function ratingOf(entry) {
  return Number.isFinite(entry?.rating) ? entry.rating : 0;
}

function waitedOf(entry, now) {
  const queued = Number.isFinite(entry?.queueTime) ? entry.queueTime : now;
  return Math.max(0, now - queued);
}

// True when `candidate` is the player `entry` last faced, recently enough to
// still be blocked. The stored id may be an accountId (that is what ws.js's
// lastDuelOpponent map holds) or a socket id, so accept either.
//
// A MISSING lastOpponentAt counts as recent, not as stale: today's ws.js blocks
// on identity alone with no timestamp at all, so failing open here would
// silently delete rematch prevention if the caller ever forgets the field. The
// wait waiver below is the escape hatch either way.
function wasRecentOpponent(entry, candidate, now, waiverMs) {
  const last = entry?.lastOpponentId;
  if (!last) return false;
  if (last !== candidate?.accountId && last !== candidate?.id) return false;
  const at = entry?.lastOpponentAt;
  if (!Number.isFinite(at)) return true;
  return now - at < waiverMs;
}

/**
 * Pick ranked 1v1 pairs by CLOSEST rating instead of first fit.
 *
 * Anchors are taken oldest-wait-first, and each anchor takes the compatible
 * candidate with the smallest absolute rating gap (ties → longest wait).
 *
 * Compatibility is MUTUAL and uses min(), not max(), of the two windows: a
 * player 3 minutes deep cannot drag someone who just joined into a lopsided
 * match. TRADE-OFF, stated plainly: in a queue with steady fresh arrivals that
 * min() can starve the longest waiter, because every new joiner arrives with a
 * 150 window and vetoes them. The uncapped widening in windowFor() is the
 * escape hatch — the fresh joiner's own window grows while they sit there, so
 * the starved anchor is reachable within a bounded number of ticks rather than
 * never.
 */
export function chooseDuelPairs(entries, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const waiverMs = Number.isFinite(opts.rematchWaiverMs) ? opts.rematchWaiverMs : DEFAULT_REMATCH_WAIVER_MS;
  const allowRematch = opts.allowRematch === true;

  // Carve-outs, mirroring ws.js:2237-2244:
  //  - botEligible === true → newbies always get a bot, never a human.
  //  - placementPending !== false → held out of pairing for a tick. undefined
  //    means the placement read is still IN FLIGHT and must NOT be read as
  //    "not pending"; an unplaced rating in the pool is a garbage match.
  // The placement gate is account-only: guests have no rating account, so no
  // placement read can be pending for them, and gating them on a field the
  // caller has no value for would kill guest-vs-guest pairing outright.
  const pool = (Array.isArray(entries) ? entries : []).filter((e) => {
    if (!e) return false;
    if (e.botEligible === true) return false;
    if (!e.guest && e.placementPending !== false) return false;
    return true;
  });

  // Oldest wait first. Array.prototype.sort is stable, so equal waits keep
  // caller order — the whole function is deterministic for a given input.
  const ordered = pool.slice().sort((x, y) => waitedOf(y, now) - waitedOf(x, now));

  const used = new Set();
  const pairs = [];

  for (const anchor of ordered) {
    if (used.has(anchor)) continue;

    const anchorWaited = waitedOf(anchor, now);
    const anchorWindow = windowFor(anchorWaited);
    const anchorRating = ratingOf(anchor);
    const anchorWaived = anchorWaited > waiverMs;

    let best = null;
    let bestDiff = Infinity;

    for (const candidate of ordered) {
      if (candidate === anchor || used.has(candidate)) continue;
      if (!!anchor.guest !== !!candidate.guest) continue; // guests pair only with guests

      const candidateWaited = waitedOf(candidate, now);

      // Guests are unrated — the window is meaningless for them, exactly as in
      // the pre-v2 guest branch, which paired any two guests.
      const diff = Math.abs(anchorRating - ratingOf(candidate));
      if (!anchor.guest) {
        const window = Math.min(anchorWindow, windowFor(candidateWaited));
        if (diff > window) continue;
      }

      if (!allowRematch && !anchorWaived && candidateWaited <= waiverMs) {
        // Checked both ways: ws.js stamps lastDuelOpponent on both sides, and
        // pairing is symmetric, so which one happens to be the anchor this tick
        // must not change the answer.
        if (wasRecentOpponent(anchor, candidate, now, waiverMs)) continue;
        if (wasRecentOpponent(candidate, anchor, now, waiverMs)) continue;
      }

      // Strictly-smaller only: `ordered` is longest-wait-first, so an equal gap
      // keeps the earlier (longer-waiting) candidate.
      if (diff < bestDiff) {
        best = candidate;
        bestDiff = diff;
      }
    }

    if (best) {
      used.add(anchor);
      used.add(best);
      pairs.push({ a: anchor, b: best });
    }
  }

  return pairs;
}

// ---------------------------------------------------------------------------
// 3. Dodge cooldown
// ---------------------------------------------------------------------------
//
// Deliberately IN-MEMORY and restart-tolerant: a cooldown lost to a deploy
// costs one skipped punishment, which is nothing. Persisting it would buy
// accuracy nobody can perceive.

const DODGE_FIRST_MS = 30000;   // first offense
const DODGE_REPEAT_MS = 120000; // repeat inside the memory window
const DODGE_MEMORY_MS = 3600000; // 1h — how long a dodge counts as "recent"

/**
 * Stamp a dodge and return the cooldown length applied.
 * `map` is any Map of playerId -> { until, lastAt, count }.
 */
export function recordDodge(map, playerId, now = Date.now()) {
  if (!map || !playerId) return 0;

  const prev = map.get(playerId);
  const repeat = !!prev && Number.isFinite(prev.lastAt) && now - prev.lastAt < DODGE_MEMORY_MS;
  const penalty = repeat ? DODGE_REPEAT_MS : DODGE_FIRST_MS;

  map.set(playerId, {
    until: now + penalty,
    lastAt: now,
    // A dodge outside the memory window is a fresh first offense, not a
    // continuation — the count restarts with it.
    count: repeat ? (prev.count || 0) + 1 : 1,
  });

  return penalty;
}

/** Milliseconds of cooldown left, 0 when clear. */
export function dodgeRemaining(map, playerId, now = Date.now()) {
  const entry = map?.get?.(playerId);
  if (!entry || !Number.isFinite(entry.until)) return 0;
  return Math.max(0, entry.until - now);
}

/**
 * Drop dodges older than the memory window. Safe to run on any tick: the
 * longest cooldown (2m) is far shorter than the memory window (1h), so this can
 * never evict a player who is still serving one.
 */
export function sweepDodges(map, now = Date.now()) {
  if (!map) return 0;
  let removed = 0;
  for (const [playerId, entry] of map) {
    const lastAt = Number.isFinite(entry?.lastAt) ? entry.lastAt : 0;
    if (now - lastAt >= DODGE_MEMORY_MS) {
      map.delete(playerId);
      removed++;
    }
  }
  return removed;
}

// ---------------------------------------------------------------------------
// 4. Anti-farm pair decay
// ---------------------------------------------------------------------------
//
// PERSISTED, unlike the dodge cooldown, and that asymmetry is deliberate: ws
// restarts often enough that a whole gamestate-restore layer exists for it, and
// an in-memory farm counter would hand a farming pair a full reset on every
// deploy — precisely the thing this control exists to stop.
//
// The counter is READ at match start and INCREMENTED at match end. That
// read-then-write gap is only safe because a player can be in exactly one
// ranked game at a time, so no two increments for the same pair can interleave
// with a read that matters.
//
// The pair is directional: A farming B is the abuse, and B's occasional win
// back must not erase A's counter.

const PAIR_WINS_TTL_MS = 48 * 60 * 60 * 1000; // ~48h, generous slack for the TTL index

/** ELO/stamp multiplier for the Nth win over the same opponent today. */
export function decayMultiplier(winsToday) {
  const wins = Number.isFinite(winsToday) && winsToday > 0 ? Math.floor(winsToday) : 0;
  if (wins <= 3) return 1;
  if (wins === 4) return 0.75;
  if (wins === 5) return 0.5;
  if (wins === 6) return 0.25;
  return 0;
}

/** Stable directional key for one (day, winner, loser) counter. */
export function pairKey(utcDay = dayKeyUTC(), winnerAccountId, loserAccountId) {
  return `${utcDay}:${winnerAccountId}:${loserAccountId}`;
}

/**
 * Wins this winner already has over this loser today. Missing row → 0.
 * `store` is any adapter with findOne (production: models/PairWins.js).
 */
export async function readPairWins(store, utcDay = dayKeyUTC(), winner, loser) {
  if (!store || !winner || !loser) return 0;
  const row = await store.findOne({ utcDay, winner, loser });
  return Number.isFinite(row?.wins) ? row.wins : 0;
}

/**
 * Atomic upsert + $inc, returning the NEW count. One round trip, so two ws
 * instances writing the same pair cannot lose a win to a read-modify-write
 * race. expiresAt is refreshed on every bump so the TTL index reaps the row.
 */
export async function bumpPairWins(store, utcDay = dayKeyUTC(), winner, loser, now = Date.now()) {
  if (!store || !winner || !loser) return 0;
  const row = await store.findOneAndUpdate(
    { utcDay, winner, loser },
    { $inc: { wins: 1 }, $set: { expiresAt: new Date(now + PAIR_WINS_TTL_MS) } },
    { upsert: true, new: true }
  );
  return Number.isFinite(row?.wins) ? row.wins : 0;
}
