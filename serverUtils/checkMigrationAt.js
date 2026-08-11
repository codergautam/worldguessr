import User from '../models/User.js';
import { RATING_V2, MIGRATION_AT } from '../components/utils/ratingFlags.js';

/**
 * Boot-time sanity check on MIGRATION_AT.
 *
 * WHAT GOES WRONG IF IT IS STALE
 * ------------------------------
 * `MIGRATION_AT` is a hardcoded constant in components/utils/ratingFlags.js and
 * it has to be bumped by hand at the production cutover. It currently holds the
 * DEV migration instant. Two things break if it ships unchanged, and neither
 * announces itself:
 *
 *   1. PLACEMENT EATS REAL RATINGS. isPlacementEligible() lets an account into
 *      placements only if it was created at or after this instant. Point it too
 *      far in the past and every account created between that date and the real
 *      migration becomes placement-eligible — so a pre-migration account can win
 *      a bot game and have its carefully order-preserving migrated rating
 *      OVERWRITTEN by a 500-900 seed. That is the exact failure the two gates
 *      exist to prevent, and it fires silently, one player at a time.
 *
 *   2. THE LEADERBOARD EMPTIES. api/leaderboard.js switches the 14-day ranked
 *      inactivity filter on 14 days after this instant. If the constant predates
 *      the real migration by more than a fortnight, the filter is already live
 *      on day one — before a single `lastRankedAt` has been stamped — and the
 *      all-time ranked board renders empty on the most scrutinised day of the
 *      release.
 *
 * THE SIGNAL: `elo_s0` is stamped on every account by, and only by, the
 * migration. So "the constant says we migrated, but not one account carries a
 * Season 0 snapshot" is a contradiction that can only mean the constant is
 * wrong. Cheap to check — one indexed countDocuments, once, at boot.
 *
 * WARNS, NEVER BLOCKS. A wrong constant is a launch mistake, not a reason to
 * refuse to serve; and the check itself must never be the thing that takes the
 * process down.
 */
export async function checkMigrationAt(label = 'rating') {
  if (!RATING_V2) return true;
  if (!MIGRATION_AT || Number.isNaN(MIGRATION_AT.getTime())) {
    console.warn(`[${label}] MIGRATION_AT is unset or unparseable — placements are disabled and the leaderboard activity filter stays off.`);
    return false;
  }

  try {
    const migratedAccounts = await User.countDocuments({ elo_s0: { $ne: null } }).limit(1);
    if (migratedAccounts > 0) return true;   // constant and database agree

    const ageDays = Math.floor((Date.now() - MIGRATION_AT.getTime()) / 86400000);
    if (ageDays < 1) return true;            // migrating right now; nothing to say yet

    console.error('=========================================================');
    console.error(`[${label}] !!! MIGRATION_AT LOOKS WRONG !!!`);
    console.error(`  MIGRATION_AT     : ${MIGRATION_AT.toISOString()} (${ageDays} days ago)`);
    console.error('  accounts with elo_s0: 0');
    console.error('  The rating migration stamps elo_s0 on every account, so a past');
    console.error('  MIGRATION_AT with zero migrated accounts means this constant was');
    console.error('  never bumped for this database.');
    console.error('  CONSEQUENCES, both silent:');
    console.error('   - every account created after that date is PLACEMENT-ELIGIBLE, and a');
    console.error('     placement win OVERWRITES a rating with a 500-900 seed;');
    console.error(`   - the 14-day ranked inactivity filter is ${ageDays >= 14 ? 'ALREADY LIVE' : 'about to go live'}, which can`);
    console.error('     empty the all-time ranked leaderboard.');
    console.error('  FIX: set MIGRATION_AT in components/utils/ratingFlags.js to this');
    console.error('  deployment\'s real migration instant, or run the migration.');
    console.error('=========================================================');
    return false;
  } catch (e) {
    console.error(`[${label}] MIGRATION_AT check failed (not fatal):`, e?.message || e);
    return true;
  }
}
