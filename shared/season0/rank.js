/**
 * SEASON 0 RANK + OG PREDICATE — the two facts every surface asks about a
 * pre-migration account.
 *
 * Read shared/season0/rankTable.js first: the ranks are a frozen generated
 * table, not a live query.
 */

import { SEASON0_RANK_TABLE } from './rankTable.js';

/**
 * Competition rank on the CLOSING Season 0 ladder for a given `elo_s0`, or null
 * when there is no answer (no snapshot, garbage value, or the table has not been
 * exported yet).
 *
 * TIES SHARE THE BETTER RANK. Two players who finished on the same rating are
 * both #12; the next distinct rating is #14. That is the same rule the Hall of
 * Fame board applies (scripts/exportSeason0HallOfFame.js `assignRanks`), and the
 * table is built in the same pass, so a top-1000 player's profile rank and their
 * row on the board are the same number by construction.
 *
 * Never falls back to the current rating. A fabricated historical rank is worse
 * than no rank at all.
 */
export function season0Rank(eloS0, table = SEASON0_RANK_TABLE) {
  const value = Number(eloS0);
  if (!Number.isFinite(value)) return null;
  const ranks = table?.ranks;
  if (!ranks || typeof ranks !== 'object') return null;
  const key = String(Math.round(value));
  if (!Object.prototype.hasOwnProperty.call(ranks, key)) return null;
  const rank = Number(ranks[key]);
  return Number.isFinite(rank) && rank > 0 ? rank : null;
}

/**
 * The rank to PUBLISH for a user document: their closing Season 0 place, or null.
 *
 * Every payload that carries a Season 0 rank goes through here so the exclusion
 * rule is written once. Banned and pending-rename accounts are not on the
 * closing ladder (scripts/exportSeason0HallOfFame.js drops them from the board
 * and from the rank table), so quoting them a place on it would invent a
 * standing nobody can look up.
 */
export function season0RankOf(user) {
  if (!user || typeof user !== 'object') return null;
  if (user.banned === true || user.pendingNameChange === true) return null;
  return season0Rank(user.elo_s0);
}

/**
 * Was this account created before the ranked update?
 *
 * THIS IS THE OG BADGE, and that sentence is the whole rule: every account that
 * predates the migration gets it, whether or not it ever played a ranked game.
 * It used to be the `ogAccount` flag alone, which
 * scripts/grantSeason1Compensation.js stamps only on accounts created before
 * 2025-08-01 — a narrower and different population.
 *
 * `elo_s0` IS THE CREATION TEST, not a rating test. scripts/migrateRatingV2.js
 * stamps it on every document that existed when it ran and on nothing after, so
 * "has an elo_s0" and "existed before the migration" are the same set. Reading
 * the snapshot beats comparing `created_at` against a hardcoded migration date:
 * the database already records the answer per account, so there is no constant
 * to get wrong and no timezone to argue about.
 *
 * ONE HAZARD, and it is the reason migrateRatingV2.js is a one-time script: its
 * snapshot pass fills `elo_s0` wherever it is null. Re-run it after launch and
 * every account created since would be stamped, silently handing the permanent
 * badge to people who signed up last week. Do not re-run it.
 *
 * `ogAccount` stays in the OR because it is a stamped, permanent grant — an
 * account that has it keeps the badge even if its snapshot fields are ever
 * cleared.
 *
 * SERVER-SIDE ONLY, deliberately. api/publicProfile.js resolves this once and
 * publishes the answer as the `ogAccount` boolean, so web and mobile both keep
 * reading one field and cannot drift apart over who counts as OG.
 */
export function hasSeason0(user) {
  if (!user || typeof user !== 'object') return false;
  if (user.ogAccount === true) return true;
  const snapshot = Number(user.elo_s0);
  return Number.isFinite(snapshot) && snapshot > 0;
}

/**
 * Collapse a rating histogram into the rating -> rank table.
 *
 * `countsByRating` is any iterable of [rating, count] pairs (a Map works
 * directly). Ratings are rounded; counts are the number of ELIGIBLE accounts at
 * that rating. Returns `{ ranks, eligibleAccounts, distinctRatings }`.
 *
 * rank(r) = 1 + (accounts rated strictly above r). That single line is both the
 * competition-ranking rule and the tie rule: everyone on the same rating gets
 * the same, better number.
 */
export function buildRankTable(countsByRating) {
  const rows = [];
  let eligibleAccounts = 0;
  for (const [rating, count] of countsByRating) {
    const r = Math.round(Number(rating));
    const c = Math.round(Number(count));
    if (!Number.isFinite(r) || !Number.isFinite(c) || c <= 0) continue;
    rows.push([r, c]);
    eligibleAccounts += c;
  }
  // Descending: the highest rating is rank 1.
  rows.sort((a, b) => b[0] - a[0]);

  const ranks = {};
  let above = 0;
  for (const [rating, count] of rows) {
    ranks[String(rating)] = above + 1;
    above += count;
  }
  return { ranks, eligibleAccounts, distinctRatings: rows.length };
}
