import User from '../models/User.js';
import { syncedClearCache } from './cacheBus.js';

/**
 * Clear every server cache that can serve a user's rating, right after an elo
 * write. This is the missing half of the ranked write path: elo is written by
 * the WS PROCESS (setElo / applyPlacementSeed) or a refund path, but the
 * cached copies live in the API and auth processes, each with a 120s TTL and
 * an independent populate time. Without this clear, the surfaces that FETCH
 * (account modal, /user page, mobile, the next session verify) disagree with
 * the surface the ws just PUSHED to — the "my elo shows two different
 * numbers" bug.
 *
 * The full key set for one user:
 *   - eloRank_id_<accountId>        api/eloRank.js lookup by id (/user page)
 *   - eloRank_secret_<secret>       api/eloRank.js lookup by secret (account modal)
 *   - eloRank_name_<username lc>    api/eloRank.js lookup by username (mobile, /user)
 *   - userAuth_<secret>             api/googleAuth.js verify — feeds the session,
 *                                   wg_session_cache and mobile authStore
 *   - crazyAuth_<crazyGamesId>      api/crazyAuth.js verify (CrazyGames clients)
 *
 * `ident` (secret/username/crazyGamesId) is resolved with one uncached point
 * read when not supplied — the callers mostly hold only the accountId, and
 * the read is what makes the secret-keyed clears possible at all. A failed
 * lookup still clears the id key: fetch-by-id freshness must not depend on a
 * second read succeeding.
 */
export async function clearUserEloCaches(accountId, ident = null) {
  if (!accountId) return;
  // toLowerCase mirrors the read-side key in api/eloRank.js — ObjectId hex is
  // lowercase from Mongo, but the contract should not hinge on that.
  const id = accountId.toString().toLowerCase();

  if (!ident) {
    try {
      ident = await User.findById(id).select('secret username crazyGamesId').lean();
    } catch (e) {
      console.error('[userEloCaches] ident lookup failed for', id, '-', e?.message || e);
    }
  }

  syncedClearCache(`eloRank_id_${id}`);
  if (ident?.secret) {
    syncedClearCache(`userAuth_${ident.secret}`);
    syncedClearCache(`eloRank_secret_${ident.secret}`);
  }
  // Lowercased to match the read side: USERNAME_COLLATION (strength 2) makes
  // the lookup case-insensitive, so every casing of a name is one cache entry.
  if (ident?.username) syncedClearCache(`eloRank_name_${ident.username.toLowerCase()}`);
  if (ident?.crazyGamesId) syncedClearCache(`crazyAuth_${ident.crazyGamesId}`);
}
