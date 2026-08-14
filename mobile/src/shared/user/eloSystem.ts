// Constants
const K = 50; // Scaling factor for Elo rating changes
const c = 500; // Factor for expected outcome calculation
export const INITIAL_ELO = 1000; // Initial Elo rating for new players
export const Ra0 = INITIAL_ELO; // Alias for backwards compatibility

const exponentBase = 1.7;

// Hard floor for ratings — mirrors components/utils/eloSystem.js. 0 is falsy
// in JS and voids the server's ranked elo/save gates, so it is unreachable.
export const MIN_ELO = 1;

/**
 * Calculate expected outcome based on player ratings
 */
function expectedOutcome(Ra: number, Rb: number): number {
  const Qa = Math.pow(exponentBase, Ra / c);
  const Qb = Math.pow(exponentBase, Rb / c);
  return Qa / (Qa + Qb);
}

/**
 * Update ELO rating for a player
 */
function updateElo(Ra: number, Rb: number, Pa: number, Pb: number): number {
  const Ea = expectedOutcome(Ra, Rb);

  // https://www.desmos.com/calculator/mwnadmf8e0
  let gainedElo = K * (Pa - Ea - 0.5) + 34 - 3 * Pa;
  if (Pa === 0) {
    gainedElo = Math.min(0, gainedElo); // Curve pokes above 0 at the left side
  }

  // Quadruple the gained Elo if the player wins and their rating is below 2000
  if (Pa === 1 && Ra < 2000) {
    gainedElo *= 4;
  }

  const newRa = Ra + gainedElo;
  return Math.max(MIN_ELO, Math.round(newRa));
}

export interface EloOutcome {
  newRating1: number;
  newRating2: number;
}

/**
 * Calculate new ELO ratings for both players after a match
 * @param player1Rating - Current ELO of player 1
 * @param player2Rating - Current ELO of player 2
 * @param winner - 1 if player1 wins, 0 if player2 wins, 0.5 for draw
 * @returns New ratings for both players
 */
export function calculateOutcomes(
  player1Rating: number,
  player2Rating: number,
  winner: 0 | 0.5 | 1
): EloOutcome {
  const player1Outcome = winner === 1 ? 1 : winner === 0.5 ? 0.5 : 0;
  const player2Outcome = 1 - player1Outcome;

  const newRating1 = updateElo(player1Rating, player2Rating, player1Outcome, player2Outcome);
  const newRating2 = updateElo(player2Rating, player1Rating, player2Outcome, player1Outcome);

  return { newRating1, newRating2 };
}

export default calculateOutcomes;

// ===========================================================================
// RATING V2 — zero-sum Elo
// ===========================================================================
// Hand-maintained mirror of the v2 half of components/utils/eloSystem.js.
// THESE CONSTANTS HAVE DRIFTED BEFORE — when the web file changes, change this
// one in the same commit. Everything above is v1 and stays byte-for-byte until
// the rollout finishes.
//
// v1's bug was that the two sides were computed INDEPENDENTLY (updateElo called
// twice), so the winner's gain and the loser's loss did not match and the ladder
// minted rating out of nothing. v2 computes ONE integer `transfer` and hands it
// to both players with opposite signs.

export const RATING_SCALE = 400;

// K schedule by rated-game count. New accounts converge fast, veterans crawl.
export const K_NEW = 40, K_MID = 20, K_VET = 10;
export const K_NEW_UNTIL = 30, K_MID_UNTIL = 100;

// League cutoffs on the v2 scale — the single definition on THIS platform;
// ./leagues.ts builds its tier table from these. Mirrors the same constants
// in components/utils/eloSystem.js.
export const EXPLORER_MIN = 800, VOYAGER_MIN = 1000, NOMAD_MIN = 1300, LEGEND_MIN = 1800;

// Rating-based K caps, a two-step TAPER: K_MID from mid-Explorer, K_VET from
// the VOYAGER entry (final ruling Aug 13: everything Voyager and up locks to
// K_VET). A cap only ever LOWERS the schedule K. Mirrors the web module —
// see components/utils/eloSystem.js for the full rationale.
export const K_VET_RATING_FLOOR = VOYAGER_MIN;
export const K_MID_RATING_FLOOR = (EXPLORER_MIN + VOYAGER_MIN) / 2; // 900, moves with the bands

// Hard floor for a v2 rating. Unlike v1's MIN_ELO = 1 this is well clear of 0,
// so no falsy-rating gate downstream can ever see a 0 (see MIN_ELO above).
export const RATING_FLOOR = 100;

// Where a brand-new account starts before placements have run.
export const ENTRY_RATING = 500;

// The value every "this rating is missing, use the default" fallback must
// resolve to. Mirrors STARTING_ELO in components/utils/ratingFlags.js.
//
// It exists because `?? 1000` was typed by hand across both platforms. That was
// correct on the Season 0 scale and badly wrong on v2, where 1000 sits inside
// VOYAGER (1000-1299) — above the median of 800 and above roughly 85% of the
// ladder. So an account whose rating failed to load was silently painted as a
// gold-badge Voyager. The server is on v2 unconditionally, so this is a plain
// constant here rather than a flag read.
export const STARTING_ELO = ENTRY_RATING;

// Placement seeding from single-player skill: base + slope * avg round points,
// capped so a perfect scorer still enters below the real ladder's top.
// Slope+cap raised Aug 2026 (user ruling), mirroring the web module: a strong
// placement should reach low Explorer rather than every seed landing in
// Trekker. Perfect 5000 avg => 900; Explorer entry at avg 3750.
export const SEED_BASE = 500, SEED_SLOPE = 0.08, SEED_MAX = 900;

// A decided game must move the ladder by at least this much, otherwise a huge
// rating gap rounds the transfer to 0 and beating a much weaker opponent (or
// upsetting a much stronger one) feels like it never happened.
export const WIN_FLOOR = 1;

/** Standard logistic expectation: A's expected score against B, in [0, 1]. */
export function expectedScore(ra: number, rb: number): number {
  return 1 / (1 + Math.pow(10, (rb - ra) / RATING_SCALE));
}

/**
 * K-factor for one player, from their count of RATED games (not duels_played),
 * CAPPED by rating: at or above K_MID_RATING_FLOOR the K is at most K_MID, at
 * or above K_VET_RATING_FLOOR (Voyager+) at most K_VET. The cap only ever
 * lowers the schedule K, never raises it. Missing/NaN rating falls back to
 * the schedule alone, so old call sites keep their exact previous behaviour.
 */
export function kFactor(ratedGames: number | null | undefined, rating?: number | null): number {
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

/**
 * The single K used for BOTH sides of a game: the mean of the two players'
 * K-factors. A shared K is what makes the game zero-sum — per-player Ks would
 * hand a rookie 40 points and take 10 from the veteran they beat.
 */
export function pairK(
  rgA: number | null | undefined,
  rgB: number | null | undefined,
  ratingA?: number | null,
  ratingB?: number | null
): number {
  return (kFactor(rgA, ratingA) + kFactor(rgB, ratingB)) / 2;
}

/** Ratings are stored as integers and may never sink below the floor. */
export function clampRating(x: number): number {
  return Math.max(RATING_FLOOR, Math.round(x));
}

/**
 * Placement seed from a player's average single-player round points (0..5000).
 * Garbage in (NaN, negative, missing) seeds at SEED_BASE rather than throwing:
 * a placement must never be able to hard-fail a game save.
 */
export function placementSeed(avgRoundPoints: number | null | undefined): number {
  const avg = Number(avgRoundPoints);
  if (!Number.isFinite(avg) || avg < 0) return SEED_BASE;
  return Math.round(Math.min(SEED_MAX, Math.max(SEED_BASE, SEED_BASE + SEED_SLOPE * avg)));
}

export interface TransferInput {
  ratingA: number;
  ratingB: number;
  ratedGamesA?: number | null;
  ratedGamesB?: number | null;
  /** 1 = A won, 0 = A lost, 0.5 = draw. */
  outcome: 0 | 0.5 | 1;
  /** Anti-farm multiplier in [0, 1] (repeat opponents, bot games). */
  decay?: number;
  /** Optional K override; defaults to the shared pairK. */
  k?: number;
}

export interface TransferResult {
  transfer: number;
  deltaA: number;
  deltaB: number;
  k: number;
  expectedA: number;
}

/**
 * The one and only rating calculation for a v2 game, from A's perspective.
 *
 * THE OPERATION ORDER IS LOAD-BEARING. Do not "simplify" it:
 *   1. floor is applied BEFORE decay, so anti-farm decay always wins. Farming
 *      the same opponent at decay 0 must yield exactly 0, not WIN_FLOOR.
 *   2. the rating-floor cap is applied AFTER both, so it BEATS WIN_FLOOR: a
 *      loser already sitting at RATING_FLOOR transfers 0 and the winner gains
 *      nothing, because the alternative is either a sub-floor rating or a
 *      non-zero-sum game.
 *   3. the magnitude is rounded exactly ONCE, into a shared integer. Rounding
 *      per side is how a zero-sum system silently stops being zero-sum.
 *
 * INVARIANT, unconditional: deltaA + deltaB === 0.
 */
export function calculateTransfer({
  ratingA,
  ratingB,
  ratedGamesA,
  ratedGamesB,
  outcome,
  decay = 1,
  k,
}: TransferInput): TransferResult {
  const kUsed = k ?? pairK(ratedGamesA, ratedGamesB, ratingA, ratingB);
  const eA = expectedScore(ratingA, ratingB);
  const raw = kUsed * (outcome - eA); // signed, A's perspective

  let mag = Math.abs(raw);
  if (outcome !== 0.5) mag = Math.max(mag, WIN_FLOOR); // draws are NEVER floored
  mag = mag * decay;

  const loserRating = raw >= 0 ? ratingB : ratingA;
  mag = Math.min(mag, Math.max(0, loserRating - RATING_FLOOR));

  const transfer = Math.round(mag);
  // Normalise -0 away: Object.is(-0, 0) is false and would break both strict
  // test assertions and any Math.sign read further down the line.
  const deltaA = raw === 0 || transfer === 0 ? 0 : Math.sign(raw) * transfer;
  const deltaB = deltaA === 0 ? 0 : -deltaA;

  return { transfer, deltaA, deltaB, k: kUsed, expectedA: eA };
}
