// ===========================================================================
// RATING V2 — per-player K Elo
// ===========================================================================
// The Season 0 (v1) engine that used to sit above this header was deleted
// after the Aug 12 2026 migration made it unreachable (see ratingFlags.js).
// Recover it from git history if a Season 0 number ever needs recomputing.
//
// This module has NO imports, reads NO process.env and touches NO I/O, and it
// must stay that way: the flags live in ./ratingFlags.js precisely so this file
// can be imported by a test, the ws server, an API route and a migration script
// with identical behaviour. Both sides share the same logistic expectation,
// but each applies its own K-factor and rounds independently. Rating may be
// minted or burned when those Ks differ; that is deliberate so new players
// settle quickly without making established players equally volatile.

// 340, not the classical 400: calibrated against the first 26k post-migration
// ranked duels (Aug 14 2026). Observed favourite win rates implied a scale of
// ~350 in 800-1000 and ~310 above 1000; 340 matches where the ladder actually
// competes. The migration compressed veteran gaps, so re-measure once the
// ladder has re-spread before touching this again.
export const RATING_SCALE = 340;

// K schedule by rated-game count. New accounts converge fast, veterans crawl.
export const K_NEW = 40, K_MID = 20, K_VET = 10;
export const K_NEW_UNTIL = 30, K_MID_UNTIL = 100;

// League cutoffs on the v2 scale — THE single definition. This is the one
// import-free module in the rating system, so the cutoffs live here and
// components/utils/leagues.js builds its tier table FROM these. Nothing else
// may retype them. (A RatingConfig doc can still re-anchor the DISPLAY table
// at runtime; the K lock below deliberately follows these constants, not the
// override.)
export const EXPLORER_MIN = 800, VOYAGER_MIN = 1000, NOMAD_MIN = 1300, LEGEND_MIN = 1800;

// Rating-based K caps, a two-step TAPER. High ratings are where a hot K
// hurts most — the bands are narrow relative to the swing, and K-noise there
// flickers players across tier lines — but a single hard lock is a K cliff
// that pins sub-30-game accounts just under the line: they fall fast and
// climb slow. So the cap steps down: K_MID from mid-Explorer, K_VET from the
// VOYAGER entry (final ruling Aug 13, after a brief move to Nomad was
// reverted the same day: everything Voyager and up locks to K_VET). A cap
// only ever LOWERS the schedule K — a 150-game veteran at 950 keeps K_VET.
export const K_VET_RATING_FLOOR = VOYAGER_MIN;
export const K_MID_RATING_FLOOR = (EXPLORER_MIN + VOYAGER_MIN) / 2; // 900, moves with the bands

// Hard floor for a v2 rating, well clear of 0 on purpose: 0 is falsy in JS and
// slips through the truthy elo gates in matchmaking (ws.js) and the ranked
// save path (Game.js), silently voiding every game the account plays — so no
// falsy-rating gate downstream can ever see a 0.
export const RATING_FLOOR = 100;

// Where a brand-new account starts before placements have run.
export const ENTRY_RATING = 500;

// The migrated old-default mass: Season 0's default rating (1000) as the
// Aug 12 2026 migration converted it. VERIFIED, NOT ASSUMED — it is a
// declared knot in data/elo-conversion-map.json ({"old":1000,"new":670}) and
// table[1000] === 670, so the mass lands on this exact integer.
// ~3.7M never-played accounts sit at EXACTLY this value, so every rank query
// floors the compared rating here:
// one lost first game must not rank a real player below millions of ghost
// accounts (measured as a ~4M rank cliff at 670 -> 660). RATINGS ARE NEVER
// FLOORED BY THIS — it exists only for rank comparisons; RATING_FLOOR (100)
// remains the only floor a stored rating has.
export const RANK_BASELINE_RATING = 670;

// The rating a rank query compares against: the player's own rating, floored
// at the baseline. EVERY count(elo > X) + 1 rank site must produce X through
// this — a raw comparison reintroduces the cliff at that one site.
export function rankQueryRating(elo) {
  return Math.max(Number(elo) || 0, RANK_BASELINE_RATING);
}

// Placement seeding from single-player skill: base + slope * avg round points,
// capped so a perfect scorer still enters below the real ladder's top.
// Slope+cap raised Aug 2026 (user ruling): a strong placement should reach
// low Explorer (800+) rather than every possible seed landing in Trekker.
// Perfect 5000 avg => 900; Explorer entry at avg 3750; avg 2500 => 700.
export const SEED_BASE = 500, SEED_SLOPE = 0.08, SEED_MAX = 900;

// A decided game must move the ladder by at least this much, otherwise a huge
// rating gap rounds the transfer to 0 and beating a much weaker opponent (or
// upsetting a much stronger one) feels like it never happened.
export const WIN_FLOOR = 1;

/** Standard logistic expectation: A's expected score against B, in [0, 1]. */
export function expectedScore(ra, rb) {
  return 1 / (1 + Math.pow(10, (rb - ra) / RATING_SCALE));
}

/**
 * K-factor for one player, from their count of RATED games (not duels_played),
 * CAPPED by rating: at or above K_MID_RATING_FLOOR the K is at most K_MID, at
 * or above K_VET_RATING_FLOOR (Voyager+) at most K_VET. The cap only ever
 * lowers the schedule K, never raises it. Missing/NaN rating falls back to
 * the schedule alone, so old call sites keep their exact previous behaviour.
 */
export function kFactor(ratedGames, rating) {
  const n = Number(ratedGames) || 0;
  let k = K_VET;
  if (n < K_NEW_UNTIL) k = K_NEW;
  else if (n < K_MID_UNTIL) k = K_MID;

  const r = Number(rating);
  if (Number.isFinite(r)) {
    if (r >= K_VET_RATING_FLOOR) k = Math.min(k, K_VET);
    else if (r >= K_MID_RATING_FLOOR) k = Math.min(k, K_MID);
  }
  return k;
}

/** Ratings are stored as integers and may never sink below the floor. */
export function clampRating(x) {
  return Math.max(RATING_FLOOR, Math.round(x));
}

/**
 * Placement seed from a player's average single-player round points (0..5000).
 * Garbage in (NaN, negative, missing) seeds at SEED_BASE rather than throwing:
 * a placement must never be able to hard-fail a game save.
 */
export function placementSeed(avgRoundPoints) {
  const avg = Number(avgRoundPoints);
  if (!Number.isFinite(avg) || avg < 0) return SEED_BASE;
  return Math.round(Math.min(SEED_MAX, Math.max(SEED_BASE, SEED_BASE + SEED_SLOPE * avg)));
}

/**
 * The one and only rating calculation for a v2 game, from A's perspective.
 *
 * outcome: 1 = A won, 0 = A lost, 0.5 = draw.
 * decay:   anti-farm multiplier in [0, 1] (repeat opponents, bot games).
 * kA/kB:   optional per-player overrides; each defaults to that player's own K.
 *
 * THE OPERATION ORDER IS LOAD-BEARING. Do not "simplify" it:
 *   1. floor is applied BEFORE decay, so anti-farm decay always wins. Farming
 *      the same opponent at decay 0 must yield exactly 0, not WIN_FLOOR.
 *   2. each negative delta is capped by THAT player's room above RATING_FLOOR.
 *      The other player's gain is independent and is never clipped to match.
 *   3. each side is rounded independently after applying its own K-factor.
 *
 * This is intentionally NOT zero-sum when the players have different Ks or a
 * floor cap binds. A settling rookie can move quickly without forcing the
 * veteran on the other side to absorb the same volatility.
 */
export function calculateTransfer({
  ratingA, ratingB, ratedGamesA, ratedGamesB, outcome, decay = 1, kA, kB
}) {
  const kUsedA = kA ?? kFactor(ratedGamesA, ratingA);
  const kUsedB = kB ?? kFactor(ratedGamesB, ratingB);
  const eA = expectedScore(ratingA, ratingB);
  const eB = 1 - eA;
  const rawA = kUsedA * (outcome - eA);
  const rawB = kUsedB * ((1 - outcome) - eB);

  const finishDelta = (raw, rating) => {
    let mag = Math.abs(raw);
    if (outcome !== 0.5) mag = Math.max(mag, WIN_FLOOR); // draws are NEVER floored
    mag *= decay;
    if (raw < 0) mag = Math.min(mag, Math.max(0, rating - RATING_FLOOR));

    const rounded = Math.round(mag);
    // Normalise -0 away: Object.is(-0, 0) is false and would break strict
    // assertions and can leak ugly values into persisted delta fields.
    return raw === 0 || rounded === 0 ? 0 : Math.sign(raw) * rounded;
  };

  return {
    deltaA: finishDelta(rawA, ratingA),
    deltaB: finishDelta(rawB, ratingB),
    kA: kUsedA,
    kB: kUsedB,
    expectedA: eA,
    expectedB: eB,
  };
}

