import User from '../models/User.js';
import { rankQueryRating } from '../components/utils/eloSystem.js';

/**
 * THE ONLY PLACE AN ELO RANK IS COMPUTED. Every surface that shows a ranked
 * position — the account modal, /user, public profiles, both auth verifies,
 * the per-game UserStats snapshot, refunds, and the weekly cron — comes
 * through this file. Same pattern as serverUtils/dailyRank.js exactEmDailyRank.
 *
 * IT EXISTS BECAUSE THE FORMULA WAS INLINED IN SEVEN PLACES and they had
 * already drifted: six filtered `banned: false`, refunds filtered
 * `banned: { $ne: true }`, and the 670 baseline floor had to be remembered
 * separately at each one. A rank that differs between two pages for the same
 * player is indistinguishable from a bug, so the query lives here once.
 *
 * THE 670 BASELINE. ~3.7M never-played accounts sit at exactly
 * RANK_BASELINE_RATING (Season 0's default of 1000 as the Aug 12 2026
 * migration converted it). Comparing a raw rating against that mass meant one
 * lost game at 670 -> 669 dropped a real player ~3.7M ranks in a single step.
 * rankQueryRating() floors the COMPARED rating at the baseline, so the lowest
 * rank anyone can hold is the rank of the 670 tie block itself. Stored ratings
 * are never floored by this — clampRating/RATING_FLOOR still own that.
 */

// `banned: false` and not `{ $ne: true }`: six of the seven original sites
// used it, including every user-visible rank, so this keeps the numbers on
// the site exactly where they were. The difference is only legacy documents
// predating the `banned` field (schema default is false, so anything saved
// since has it). Refunds silently used the other form; they now match.
const NOT_BANNED = { banned: false };

/**
 * Competition rank for a rating: 1 + the number of unbanned accounts rated
 * strictly above it, with the comparison floored at the 670 baseline.
 *
 * @param {number} elo    The player's rating. Missing/NaN is treated as
 *                        sub-baseline (never as NaN, which would match no
 *                        documents and wrongly return rank 1).
 * @param {number|false} cache  recachegoose TTL in seconds, or false for an
 *                        uncached read. Default 2000, matching what the API
 *                        surfaces used. IGNORED in processes that never
 *                        initialised recachegoose (ws, cron) — see below.
 */
export async function computeEloRank(elo, { cache = 2000 } = {}) {
  const query = User.countDocuments({
    elo: { $gt: rankQueryRating(elo) },
    ...NOT_BANNED,
  });

  // .cache() only exists once recachegoose has patched Query.prototype. cron
  // and the ws server never call cachegoose(mongoose, ...), so calling it
  // unguarded there is a TypeError — and those are exactly the processes that
  // write UserStats snapshots. The typeof check is what lets ONE helper serve
  // both the cached API paths and the uncached background ones.
  if (cache !== false && typeof query.cache === 'function') {
    return (await query.cache(cache)) + 1;
  }
  return (await query) + 1;
}

/**
 * The in-memory twin of computeEloRank, for the weekly cron snapshot: it
 * already holds every user sorted by rating, so 4M point queries would be
 * absurd. Returns Map<userIdString, rank>.
 *
 * MUST AGREE WITH computeEloRank FOR THE SAME PLAYER — test/rankBaseline
 * asserts exactly that. Two properties make it agree:
 *   - COMPETITION ranking (ties share the first rank in their block), because
 *     count(above) + 1 gives every tied player the same number. Using
 *     index + 1 here was its own multi-million-rank bug (see git history).
 *   - the same baseline floor, so every sub-baseline account lands in the 670
 *     block instead of strung out below it.
 *
 * @param {Array<{_id: any, elo: number}>} usersDescending sorted by elo desc.
 */
export function buildEloRankMap(usersDescending) {
  const out = new globalThis.Map();
  let prevRating = Symbol();
  let prevRank = 0;
  usersDescending.forEach((user, index) => {
    const ranked = rankQueryRating(user.elo);
    if (ranked !== prevRating) {
      prevRating = ranked;
      prevRank = index + 1;
    }
    out.set(user._id.toString(), prevRank);
  });
  return out;
}
