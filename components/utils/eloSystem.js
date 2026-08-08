// Constants
const K = 50; // Scaling factor for Elo rating changes
const c = 500; // Factor for expected outcome calculation
export const Ra0 = 1000; // Initial Elo rating for new players

const exponentBase = 1.7;

// Hard floor for ratings. 0 is falsy in JS and slips through the truthy elo
// gates in matchmaking (ws.js) and the ranked save path (Game.js), silently
// voiding every game the account plays — so a rating may never reach it.
export const MIN_ELO = 1;

// Function to calculate expected outcome
function expectedOutcome(Ra, Rb) {
  const Qa = Math.pow(exponentBase, Ra / c);
  const Qb = Math.pow(exponentBase, Rb / c);
  return Qa / (Qa + Qb);
}

// Function to update Elo rating
function updateElo(Ra, Rb, Pa, Pb) {
  const Ea = expectedOutcome(Ra, Rb);

  //https://www.desmos.com/calculator/mwnadmf8e0 
  let gainedElo = K * (Pa - Ea - 0.5) + 34 - 3 * Pa;
  if(Pa === 0)
    gainedElo = Math.min(0, gainedElo); //curve pokes above 0 at the left side

  // Quadruple the gained Elo if the player wins and their rating is below 2000
  if (Pa === 1 && Ra < 2000) {
    gainedElo *= 4;
  }

  const newRa = Ra + gainedElo;
  return Math.max(MIN_ELO, Math.round(newRa));
}

export default function calculateOutcomes(player1Rating, player2Rating, winner) {
  const player1Outcome = winner === 1 ? 1 : winner === 0.5 ? 0.5 : 0; //1 if player1 wins
  const player2Outcome = 1 - player1Outcome;

  const newRating1 = updateElo(player1Rating, player2Rating, player1Outcome, player2Outcome);
  const newRating2 = updateElo(player2Rating, player1Rating, player2Outcome, player1Outcome);

  return { newRating1, newRating2 };
}

// ===========================================================================
// RATING V2 — zero-sum Elo
// ===========================================================================
// Everything above is v1 and stays byte-for-byte where it is until the rollout
// finishes. Everything below is the replacement.
//
// This module has NO imports, reads NO process.env and touches NO I/O, and it
// must stay that way: the flags live in ./ratingFlags.js precisely so this file
// can be imported by a test, the ws server, an API route and a migration script
// with identical behaviour. v1's bug was that the two sides were computed
// INDEPENDENTLY (updateElo called twice), so the winner's gain and the loser's
// loss did not match and the ladder minted rating out of nothing. v2 computes
// ONE integer `transfer` and hands it to both players with opposite signs.

export const RATING_SCALE = 400;

// K schedule by rated-game count. New accounts converge fast, veterans crawl.
export const K_NEW = 40, K_MID = 20, K_VET = 10;
export const K_NEW_UNTIL = 30, K_MID_UNTIL = 100;

// Hard floor for a v2 rating. Unlike v1's MIN_ELO = 1 this is well clear of 0,
// so no falsy-rating gate downstream can ever see a 0 (see MIN_ELO above).
export const RATING_FLOOR = 100;

// Where a brand-new account starts before placements have run.
export const ENTRY_RATING = 500;

// Placement seeding from single-player skill: base + slope * avg round points,
// capped so a perfect scorer still enters below the real ladder's top.
export const SEED_BASE = 500, SEED_SLOPE = 0.06, SEED_MAX = 800;

// A decided game must move the ladder by at least this much, otherwise a huge
// rating gap rounds the transfer to 0 and beating a much weaker opponent (or
// upsetting a much stronger one) feels like it never happened.
export const WIN_FLOOR = 1;

/** Standard logistic expectation: A's expected score against B, in [0, 1]. */
export function expectedScore(ra, rb) {
  return 1 / (1 + Math.pow(10, (rb - ra) / RATING_SCALE));
}

/** K-factor for one player, from their count of RATED games (not duels_played). */
export function kFactor(ratedGames) {
  const n = Number(ratedGames) || 0;
  if (n < K_NEW_UNTIL) return K_NEW;
  if (n < K_MID_UNTIL) return K_MID;
  return K_VET;
}

/**
 * The single K used for BOTH sides of a game: the mean of the two players'
 * K-factors. A shared K is what makes the game zero-sum — per-player Ks would
 * hand a rookie 40 points and take 10 from the veteran they beat.
 */
export function pairK(rgA, rgB) {
  return (kFactor(rgA) + kFactor(rgB)) / 2;
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
 * k:       optional override; defaults to the shared pairK.
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
export function calculateTransfer({ ratingA, ratingB, ratedGamesA, ratedGamesB, outcome, decay = 1, k }) {
  const kUsed = k ?? pairK(ratedGamesA, ratedGamesB);
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

