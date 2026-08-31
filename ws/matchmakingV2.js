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
//   { id, rating, guest, queueTime, accountId, strict, leagueMin, leagueMax,
//     placementPending, botEligible, lastOpponentId, lastOpponentAt }

import { dayKeyUTC } from '../serverUtils/stamps/periods.js';

// ---------------------------------------------------------------------------
// 1. Rating window
// ---------------------------------------------------------------------------

const BASE_WINDOW = 50;        // half-width for the first 5s of waiting
const WINDOW_STEP = 50;        // every widen step, early or late
const FIRST_WIDEN_AT = 5000;   // 50 -> 100 after 5s
const SLOW_WIDEN_AT = 15000;   // 100 -> 150 after another 10s
const EARLY_INTERVAL = 15000;  // then one step per 15s...
const EARLY_CAP = 400;         // ...until 400
const EARLY_CAP_AT = 90000;    // which lands exactly at 90s
const LATE_INTERVAL = 30000;   // after that, one step per 30s, forever
export const LEAGUE_LOCK_MS = 15000;
export const UPPER_BOUNDARY_GRACE_ELO = 10;

/**
 * Rating window half-width for a player who has waited `waitedMs`.
 *
 * Past 90s the widening is UNCAPPED on purpose: an eventual match with no extra
 * UI beats a "no opponents found" dead end. It is only honest because
 * chooseDuelPairs always takes the CLOSEST compatible opponent, so a wide
 * window is permission to reach far, never an instruction to.
 */
export function windowFor(waitedMs) {
  const waited = Number.isFinite(waitedMs) && waitedMs > 0 ? waitedMs : 0;
  if (waited < FIRST_WIDEN_AT) return BASE_WINDOW;
  if (waited < SLOW_WIDEN_AT) return BASE_WINDOW + WINDOW_STEP;
  if (waited < EARLY_CAP_AT) {
    return BASE_WINDOW + 2 * WINDOW_STEP
      + WINDOW_STEP * Math.floor((waited - SLOW_WIDEN_AT) / EARLY_INTERVAL);
  }
  return EARLY_CAP + WINDOW_STEP * Math.floor((waited - EARLY_CAP_AT) / LATE_INTERVAL);
}

/**
 * The range shown to a queued player. During the opening league lock, the
 * ordinary rating window is clipped to that player's current league borders.
 * At 15s the league clip disappears while strict matchmaking's floor remains.
 *
 * THE BOUNDARY GRACE IS TWO-SIDED, and so is this. hasUpperBoundaryGrace waives
 * the lock for BOTH members of a boundary pair, so the band has to move for both
 * of them or it lies to one:
 *
 *   - the LOWER player, within UPPER_BOUNDARY_GRACE_ELO of their ceiling, has
 *     their upper clip waived — they can search into the tier above;
 *   - the UPPER player is the other half of that same pair, so their floor drops
 *     to `leagueBelowMax - UPPER_BOUNDARY_GRACE_ELO`. Without this their band
 *     was pinned at their own league floor while the matchmaker paired them up
 *     to 11 points beneath it.
 *
 * `leagueBelowMax` is passed in rather than derived as `leagueMin - 1` because a
 * config-installed tier table may leave gaps (see getLeagueBelow in
 * components/utils/leagues.js). Omitted or non-finite means "bottom tier, or the
 * caller does not know", and the floor stays at leagueMin — the conservative
 * direction, since an understated floor is a smaller lie than an overstated one.
 *
 * Only the IMMEDIATELY lower tier is considered. Reaching two tiers down would
 * need a window wider than an entire league, and the lock's half-width never
 * exceeds 100 while the narrowest shipped tier is 200 points wide.
 */
export function ratingRangeFor(waitedMs, rating, opts = {}) {
  const waited = Number.isFinite(waitedMs) && waitedMs > 0 ? waitedMs : 0;
  const r = Number.isFinite(rating) ? rating : 0;
  const half = windowFor(waited);
  const leagueMin = opts.leagueMin;
  const leagueMax = opts.leagueMax;
  const validLeagueBounds = Number.isFinite(leagueMin)
    && typeof leagueMax === 'number'
    && !Number.isNaN(leagueMax)
    && leagueMax >= leagueMin;
  const leagueLocked = waited < LEAGUE_LOCK_MS && validLeagueBounds;
  const upperGrace = leagueLocked
    && r <= leagueMax
    && leagueMax - r <= UPPER_BOUNDARY_GRACE_ELO;
  const strictFloor = Number.isFinite(opts.strictFloor) ? opts.strictFloor : 0;

  // Math.min against leagueMin, not a bare assignment: a caller handing in a
  // leagueBelowMax at or above this tier's floor is a malformed table, and the
  // floor must never RISE because of it.
  const lockedFloor = !leagueLocked
    ? 0
    : (Number.isFinite(opts.leagueBelowMax)
      ? Math.min(leagueMin, opts.leagueBelowMax - UPPER_BOUNDARY_GRACE_ELO)
      : leagueMin);

  return [
    Math.max(0, strictFloor, lockedFloor, Math.round(r - half)),
    Math.min(leagueLocked && !upperGrace ? leagueMax : Infinity, Math.round(r + half)),
  ];
}

// ---------------------------------------------------------------------------
// 2. Pair selection
// ---------------------------------------------------------------------------

/**
 * What a rematch costs, in QUEUE TIME. Not wall-clock: a player's clock only
 * runs while they sit in the queue, and stops the moment they are matched.
 *
 * THIS MUST OUTLAST A GAME, and that is why it is 300s and not the 60s it was
 * for seven months. The old value looked reasonable and did nothing:
 *
 *   A duel runs about five minutes. Two players who just fought leave together,
 *   requeue together, and are then the ONLY two people in the queue for the four
 *   to seven minutes their peers are still playing. Sixty seconds of queue time
 *   expires long before anyone else becomes available, so the pair was handed
 *   back to each other, re-stamped, and did it again. The pool never mixed.
 *
 * The number is not measured against your own game. It is measured against how
 * long OTHER players take to finish theirs and rejoin the queue.
 *
 * Measured over 120 seeds of a jittered model (4-7min games, 0-45s on the
 * results screen), four-player pool: 74% of games against the person you just
 * beat, dropping to 0%. The mean wait does not rise, because a mixed pool pairs
 * on rating immediately instead of everyone idling out a waiver.
 */
const DEFAULT_REMATCH_WAIVER_MS = 300000; // 5m, above a duel's ~4-7m span

/**
 * The cost when there is demonstrably nobody else to wait for.
 *
 * A long wait only buys variety if a different opponent might turn up. When the
 * entire ranked population is the two people in front of us, waiting five
 * minutes buys nothing: they will play each other either way, and the wait is
 * pure punishment. Nomad is the SECOND-HIGHEST tier (1300-1799) so its pool is
 * thin by construction, and this project has already been burnt once by Nomads
 * sitting in 6-10 minute queues.
 *
 * `expectedReturns` is how ws.js reports the players currently in a ranked game
 * who will requeue: peers this queue cannot see but who are genuinely coming
 * back. It is the difference between a thin queue and an empty world.
 */
export const REMATCH_WAIVER_ISOLATED_MS = 60000;

/**
 * Starvation valve threshold. min()-of-windows compatibility (see
 * chooseDuelPairs) protects fresh joiners from lopsided grabs, but its escape
 * hatch — "the fresh joiner's window grows while they sit there" — assumes
 * they sit. In a liquid low-rating pool fresh peers pair each other within
 * seconds and never widen, so a high-rated waiter starves FOREVER: reported
 * live Aug 16 (Nomads waiting 6-10 min while 1.1k accounts matched in 20s).
 * Once the pair's LONGER waiter passes this threshold, the pair is judged by
 * that player's window alone. The shorter waiter must still have had their
 * first STARVED_MIN_PARTNER_WAIT_MS in queue — their chance to find a
 * same-strength peer before a starved anchor may reach them. For a starved
 * pair that floor REPLACES the opening league lock: the two gates only differ
 * in the 10-15s sliver, and keeping the lock there would silently push the
 * real protection back to 15s for the cross-league grabs the valve exists for
 * (user ruling Aug 16: 10s is the protection, full stop).
 */
export const STARVED_WAIT_MS = 120000;
export const STARVED_MIN_PARTNER_WAIT_MS = 10000;

function ratingOf(entry) {
  return Number.isFinite(entry?.rating) ? entry.rating : 0;
}

function waitedOf(entry, now) {
  const queued = Number.isFinite(entry?.queueTime) ? entry.queueTime : now;
  return Math.max(0, now - queued);
}

// A player's first 15 seconds are confined to their own league apart from the
// explicit upper-boundary grace below. The ordinary clamp is checked in both
// directions so an older waiter cannot otherwise pull a fresh player across.
function openingLeagueAllows(entry, candidateRating, waitedMs) {
  if (waitedMs >= LEAGUE_LOCK_MS) return true;
  const min = entry?.leagueMin;
  const max = entry?.leagueMax;
  const valid = Number.isFinite(min)
    && typeof max === 'number'
    && !Number.isNaN(max)
    && max >= min;
  if (!valid) return true;
  return candidateRating >= min && candidateRating <= max;
}

// Crossing upward is the one opening-lock exception. If the lower player is
// within 10 ELO of their ceiling, their upper clamp is waived and the matched
// higher-league player's lower clamp is waived for this pair too. The rating
// window, rematch prevention, and strict matchmaking still run independently.
function hasUpperBoundaryGrace(lower, higher) {
  const min = lower?.leagueMin;
  const max = lower?.leagueMax;
  const higherMin = higher?.leagueMin;
  const lowerRating = ratingOf(lower);
  const higherRating = ratingOf(higher);
  const valid = Number.isFinite(min)
    && typeof max === 'number'
    && !Number.isNaN(max)
    && max >= min
    && Number.isFinite(higherMin);
  if (!valid) return false;
  return lowerRating >= max - UPPER_BOUNDARY_GRACE_ELO
    && lowerRating <= max
    && higherRating > max
    && higherMin > max;
}

function openingLeaguePairAllows(a, b, waitedA, waitedB) {
  const ordinary = openingLeagueAllows(a, ratingOf(b), waitedA)
    && openingLeagueAllows(b, ratingOf(a), waitedB);
  if (ordinary) return true;
  return hasUpperBoundaryGrace(a, b) || hasUpperBoundaryGrace(b, a);
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
 * Would pairing these two violate either side's strict-matchmaking opt-in?
 *
 * Strict means "never match me below the Voyager line". Checked BOTH ways for
 * the same reason the rematch block is: pairing is symmetric, so which player
 * happens to be the anchor on a given tick must not change the answer.
 *
 * In practice only one direction can fire, because a queue entry is only ever
 * stamped strict when the player is themselves at or above the floor — but
 * relying on the caller to have got that right is exactly how this feature broke
 * the first time.
 *
 * `strictFloor` is INJECTED rather than imported: this module stays pure (one
 * import, no league table, no config) so it can be unit tested, and the floor is
 * a seasonal value the server resolves from the active tier table.
 */
function strictBlocks(a, b, strictFloor) {
  if (!Number.isFinite(strictFloor) || strictFloor <= 0) return false;
  if (a?.strict && ratingOf(b) < strictFloor) return true;
  if (b?.strict && ratingOf(a) < strictFloor) return true;
  return false;
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
 * 50 window and vetoes them. The original escape hatch — the fresh joiner's
 * own window grows while they sit there — turned out to assume they SIT: a
 * liquid low pool pairs its joiners within seconds, they never widen, and the
 * top of the ladder starved without bound. Hence the starvation valve: once
 * the pair's longer waiter passes STARVED_WAIT_MS, compatibility is judged by
 * that player's window alone, provided the shorter waiter is past their
 * protected first STARVED_MIN_PARTNER_WAIT_MS — a floor that also stands in
 * for the opening league lock on that pair (see the constant's comment).
 * Closest-rating selection still applies, so a starved player takes the
 * SMALLEST reach the pool offers, and strict matchmaking is never waived.
 */
export function chooseDuelPairs(entries, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const allowRematch = opts.allowRematch === true;
  // 0 (the default) disables strict entirely, which is what a caller that does
  // not know about the setting should get.
  const strictFloor = Number.isFinite(opts.strictFloor) ? opts.strictFloor : 0;

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

  // Resolved AFTER the pool is known, because the rematch cost depends on
  // whether anyone else could plausibly turn up.
  //
  // A POOL OF THREE OR MORE IS NEVER ISOLATED, whatever the caller says. That
  // is the half that matters: the count flickers downward for a moment every
  // time a pair sits on the results screen, and a cheap rematch handed out in
  // that window is exactly the bug being fixed. ws.js counts ENDED-but-not-torn-
  // down games for the same reason.
  //
  // An ABSENT expectedReturns is read as zero, i.e. an empty world, so a
  // two-entry pool from a caller that passes nothing gets the isolated cost.
  // That is deliberate and it is what the unit tests are written against. It is
  // safe because production always supplies the real count whenever the pool is
  // small enough for the flag to bite; see the call site in ws.js.
  const expectedReturns = Number.isFinite(opts.expectedReturns) ? opts.expectedReturns : 0;
  const isolated = pool.length <= 2 && expectedReturns <= 0;
  const waiverMs = Number.isFinite(opts.rematchWaiverMs)
    ? opts.rematchWaiverMs // explicit override always wins: tests and operators
    : (isolated ? REMATCH_WAIVER_ISOLATED_MS : DEFAULT_REMATCH_WAIVER_MS);

  const used = new Set();
  const pairs = [];

  for (const anchor of ordered) {
    if (used.has(anchor)) continue;

    const anchorWaited = waitedOf(anchor, now);
    const anchorWindow = windowFor(anchorWaited);
    const anchorRating = ratingOf(anchor);

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
        // max/min of the two waits, not anchor/candidate roles: an unmatched
        // starved player stays in the candidate pool for later anchors, and
        // which side of the pair they land on must not change the answer.
        const longerWaited = Math.max(anchorWaited, candidateWaited);
        const shorterWaited = Math.min(anchorWaited, candidateWaited);
        const starved = longerWaited >= STARVED_WAIT_MS
          && shorterWaited >= STARVED_MIN_PARTNER_WAIT_MS;
        if (starved) {
          // The valve's own 10s floor is the WHOLE protection here — the
          // opening league lock is deliberately not consulted, or it would
          // quietly re-raise the floor to 15s for cross-league grabs.
          if (diff > windowFor(longerWaited)) continue;
        } else {
          const window = Math.min(anchorWindow, windowFor(candidateWaited));
          if (diff > window) continue;
          if (!openingLeaguePairAllows(anchor, candidate, anchorWaited, candidateWaited)) continue;
        }
      }

      // THE COST IS MUTUAL: both players must have queued it out.
      //
      // It used to be one-sided — `!anchorWaived && candidateWaited <= waiver`
      // — so EITHER player passing the waiver unlocked the rematch for BOTH.
      // That is the bug players actually reported. You finish a duel, spend a
      // minute on the results screen, click Play Again, and are handed the same
      // opponent THE INSTANT you click, having queued for zero seconds: their
      // wait paid your toll. From your side there was no rule at all.
      //
      // Verified against the old code: parked 70s vs freshly requeued, it
      // paired them. Two players who both requeued instantly were correctly
      // blocked, which is why the fault only showed when the two requeued at
      // different times — the normal case.
      //
      // Checked both ways because the memory is stamped on both sides and
      // pairing is symmetric, so which one is the anchor this tick must not
      // change the answer.
      if (!allowRematch && !(anchorWaited > waiverMs && candidateWaited > waiverMs)) {
        if (wasRecentOpponent(anchor, candidate, now, waiverMs)) continue;
        if (wasRecentOpponent(candidate, anchor, now, waiverMs)) continue;
      }

      // Strict matchmaking. DELIBERATELY BEFORE the closest-rating comparison
      // below: a rejected candidate must never be able to win the bestDiff slot
      // and knock out a legal opponent. Also NOT waived by wait time — unlike
      // the rematch rule, this is an explicit opt-in and quietly overriding it
      // after a minute would be the opposite of what the player asked for. The
      // uncapped widening in windowFor() is what eventually finds them someone
      // ABOVE the floor.
      if (strictBlocks(anchor, candidate, strictFloor)) continue;

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
