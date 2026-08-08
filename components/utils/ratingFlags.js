// Rating v2 rollout flags. Every env read for the rating system lives HERE and
// nowhere else: components/utils/eloSystem.js must stay a pure math module with
// no imports and no process, because that purity is the only reason its
// transfer arithmetic can be unit tested (and diffed against v1) at all.
//
// RATING_V2            switches ranked writes onto the v2 transfer model.
//                      ON UNCONDITIONALLY as of the Aug 7 2026 migration — the
//                      rollout flag is spent. It is no longer read from the env,
//                      so nothing has to be set to run the game: a dev box, a
//                      fresh clone and the browser bundle all agree by default,
//                      which is exactly what the old env read could not do
//                      (Next only inlines NEXT_PUBLIC_*, so the client silently
//                      saw `undefined` and fell back to the Season 0 league
//                      table unless next.config.js forwarded it by hand).
//
//                      Turning ranked back off is now a code change, and that is
//                      deliberate: after the migration the DB holds v2 ratings,
//                      so a flag flip alone would NOT restore v1 behaviour — it
//                      would run v1 arithmetic over a v2 scale. The real revert
//                      is scripts/rollbackRatingV2.js (restores elo from
//                      elo_s0) and then this constant.
export const RATING_V2 = true;

// MIGRATION_AT         The instant the one-time migration ran. Accounts created
//                      at or after it are the ONLY ones allowed into placements
//                      (components/utils/placementGates.js gate 2), and
//                      api/leaderboard.js measures the ranked-activity window
//                      from it.
//
//                      Not read from the env either, for the same reason as
//                      above: one value, true everywhere, nothing to configure.
//                      RATING_V2_MIGRATION_AT in .env is now INERT and can be
//                      deleted.
//
//                      >>> THIS IS THE DEV-DATABASE MIGRATION TIME. <<<
//                      Bump it to the real production migration instant as part
//                      of the prod cutover. Too EARLY is the dangerous
//                      direction: every account created after it that still has
//                      ratedGames 0 is placement-eligible, and a placement win
//                      overwrites a migrated rating with a 500-800 seed. Too
//                      late merely delays placements for genuinely new accounts.
export const MIGRATION_AT = new Date('2026-08-07T21:36:00.000Z');
