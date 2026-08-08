// Placement gates. Pure — no imports, no env, no I/O. The caller passes the
// migration timestamp in (components/utils/ratingFlags.js MIGRATION_AT).
//
// WHY TWO GATES EXIST, AND WHY BOTH FAIL CLOSED
// ---------------------------------------------
// Placements overwrite a rating outright: finish your placement games and the
// system stamps you at placementSeed(), somewhere in 500..800.
//
// The trigger for "this account still needs placements" is ratedGames === 0.
// Every account that existed before the v2 migration has ratedGames 0 by
// default, because the field did not exist when those docs were written. So on
// the day v2 ships, without gates, EVERY veteran on the ladder is placement
// eligible, plays a handful of games, and has its carefully migrated rating
// bulldozed by a 500-800 seed. A 2400-rated account becomes 640. There is no
// undo: the pre-migration value only survives in elo_s0.
//
//  Gate 1 (isPlacementEligible): only accounts CREATED AT OR AFTER the
//  migration instant may ever be placed. Age is the one signal that cannot be
//  faked by a missing field.
//
//  Gate 2 (backfillRatedGames): the migration seeds ratedGames for existing
//  docs from their historical duel counters, so they are not sitting at 0 in
//  the first place, and so their K-factor reflects their real experience
//  instead of treating a 5000-game veteran as a rookie at K 40.
//
// Both gates FAIL CLOSED. No migration timestamp, no created_at, an
// unparseable date: not eligible. We never place an account we cannot verify,
// because the cost of a wrong "yes" is a destroyed rating and the cost of a
// wrong "no" is that one player keeps their entry rating a while longer.

/** Coerce to a valid Date, or null. Anything unparseable is a verification failure. */
function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * True only when this account has played zero rated games, has never completed
 * a placement, AND was created at or after the v2 migration instant.
 *
 * GATE 3 (lastRankedAt) EXISTS BECAUSE THE OTHER TWO NEVER CLOSE.
 * A placement win seeds the rating but deliberately does NOT increment
 * ratedGames (the K schedule is meant to start at game 2), and the counters are
 * booked rated:false. So ratedGames stays 0 after a successful placement and
 * gates 1 and 2 would re-place that player against a throwing bot on every
 * single queue join, forever, re-rolling their seed each time.
 *
 * lastRankedAt is the termination signal: applyPlacementSeed stamps it only
 * when the seed write actually lands. That gives exactly the intended
 * behaviour with no extra field. A win seeds and closes the gate; a loss,
 * draw, abandon or disconnect grants nothing, leaves lastRankedAt unset, and
 * re-gates into another placement. Abandoning therefore cannot be used to
 * reroll a seed that already landed.
 */
export function isPlacementEligible(user, migrationAt) {
  if ((user?.ratedGames ?? 0) !== 0) return false;
  if (user?.lastRankedAt) return false; // placement already completed

  const migration = toDate(migrationAt);
  if (!migration) return false; // no migration instant => nobody is verifiable

  if (!user?.created_at) return false;
  const created = toDate(user.created_at);
  if (!created) return false;

  return created.getTime() >= migration.getTime();
}

/**
 * Historical rated-game count for a pre-migration account, from its duel
 * counters. Capped at 70 so a legacy veteran lands in the K_VET bucket without
 * claiming a game count the v2 season never actually saw. Missing counters
 * count as 0.
 */
export function backfillRatedGames(user) {
  const wins = user?.duels_wins | 0;
  const losses = user?.duels_losses | 0;
  const tied = user?.duels_tied | 0;
  return Math.min(wins + losses + tied, 70);
}
