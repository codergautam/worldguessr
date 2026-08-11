// Placement gates. Pure — no imports, no env, no I/O. The caller passes the
// migration timestamp in (components/utils/ratingFlags.js MIGRATION_AT).
//
// WHY TWO GATES EXIST, AND WHY BOTH FAIL CLOSED
// ---------------------------------------------
// Placements overwrite a rating outright: finish your placement games and the
// system stamps you at placementSeed(), somewhere in 500..900.
//
// The trigger for "this account still needs placements" is ratedGames === 0.
// Every account that existed before the v2 migration has ratedGames 0 by
// default, because the field did not exist when those docs were written. So on
// the day v2 ships, without gates, EVERY veteran on the ladder is placement
// eligible, plays a handful of games, and has its carefully migrated rating
// bulldozed by a 500-900 seed. A 2400-rated account becomes 640. There is no
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
 * counters. Missing counters count as 0.
 *
 * THE CAP IS A K-FACTOR DIAL, NOT A GAME COUNT. It decides how fast the
 * migrated ladder is allowed to re-sort itself, and it is the only knob that
 * does.
 *
 * Migrated ratings are ORDER-PRESERVING, not honest. The analysis behind the
 * migration is explicit that Season 0 elo ranked play TIME, not skill
 * (Spearman rho 0.897 against career duel count), so day one is a faithful copy
 * of a ladder that does not rank players. Zero-sum play is what sorts it, and
 * how fast it sorts is exactly K.
 *
 * The cap was 70, which put every veteran in K_MID (20) for 30 games and then
 * K_VET (10) forever. Measured against a player parked 400 points below their
 * true level, that takes 32 games to correct half the error and over 120 to
 * correct 90% of it. The median player plays about 33 ranked duels A YEAR, so
 * the median player never finished settling at all — and low-volume players are
 * precisely the ones whose migrated rating carries the least information.
 *
 * At 15 the same player gets ~15 games at K_NEW (40), then ~70 at K_MID, then
 * settles at K_VET. Half the error is gone in 16 games instead of 32, and 90%
 * in 76 instead of never, which lands the bulk of the re-sort inside the 14-day
 * post-migration monitoring window where it can actually be watched.
 *
 * WHY NOT HIGHER STILL: K is bought with noise. Measured steady-state rating
 * noise is sd 30 at K=10, 43 at K=20 and 60 at K=40. The Explorer band is only
 * 130 points wide, so a PERMANENT K=40 would have players flickering across
 * tier lines forever. This is a settling window, not a new baseline, and
 * K_VET stays where it is.
 *
 * WHY NOT ZERO: the cap must stay >= 1. Any account with at least one career
 * game must backfill to a non-zero `ratedGames`, because that is gate 2 of the
 * placement guard above — a 0 here plus a bad `created_at` read is how a
 * veteran's migrated rating gets bulldozed by a 500-900 placement seed.
 *
 * scripts/verifyMigration.js has its own RATED_GAMES_CAP that MUST match this.
 */
export const RATED_GAMES_BACKFILL_CAP = 15;

export function backfillRatedGames(user) {
  const wins = user?.duels_wins | 0;
  const losses = user?.duels_losses | 0;
  const tied = user?.duels_tied | 0;
  return Math.min(wins + losses + tied, RATED_GAMES_BACKFILL_CAP);
}
