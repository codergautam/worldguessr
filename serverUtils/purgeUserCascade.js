import User from '../models/User.js';
import UserStats from '../models/UserStats.js';
import Map from '../models/Map.js';
import Game from '../models/Game.js';
import Report from '../models/Report.js';
import Clue from '../models/Clue.js';
import ModerationLog from '../models/ModerationLog.js';
import NameChangeRequest from '../models/NameChangeRequest.js';
import DailyChallengeScore from '../models/DailyChallengeScore.js';
import DailyLeaderboard from '../models/DailyLeaderboard.js';
import GuestProfile from '../models/GuestProfile.js';
import { addBannedIdentity } from './bannedIdentities.js';

/**
 * Permanently delete a user and ALL associated data — the single shared cascade
 * behind both the moderator hard-delete (api/mod/deleteUser.js) and the
 * self-service 7-day-grace purge (cron.js).
 *
 * This is the SLOW part of deletion and MUST run OFF the HTTP request path. The
 * old in-request version (mod/deleteUser.js) routinely timed out because the
 * round-anonymize + friend-array $pulls full-scanned the two biggest collections
 * inside the request; the new indexes (see models/Game.js, models/User.js,
 * models/DailyChallengeScore.js) plus running this from the cron process fix that.
 *
 * Design notes:
 *  - Idempotent / resumable: every step tolerates 0 matches and the User row is
 *    deleted LAST, so a crashed/redeployed run can simply be re-run.
 *  - No count pass: the old endpoint's countDocuments duplicated every expensive
 *    scan (≈2× the work) purely to populate a response — dropped here.
 *  - Operates from the passed-in user snapshot, so callers needn't hold a live doc.
 *  - Ban evasion: a PERMANENTLY banned user is blocklisted on the way out (so they
 *    can't re-register); a normal self-service delete is NOT blocklisted, so a
 *    legitimate user can come back later.
 *
 * @param {object} targetUser  A User doc (or lean snapshot) with at least
 *   `_id`, `username`, `banned`, `banType`, `email`, `appleId`, `crazyGamesId`,
 *   `banPublicNote` (the last four only matter for the perm-ban blocklist path).
 * @param {object}  [opts]
 * @param {string}  [opts.reason]        Stored on the ModerationLog audit record.
 * @param {object|null} [opts.moderator] Acting mod (mod path), or null (self-service).
 * @param {boolean} [opts.isSelfService] true for the cron grace purge.
 * @returns {Promise<object>} deletionStats
 */
export async function purgeUserCascade(
  targetUser,
  { reason = 'self_service_deletion', moderator = null, isSelfService = true } = {},
) {
  const accountObjectId = targetUser._id;        // ObjectId — matches existing queries
  const accountId = targetUser._id.toString();   // string — for String-typed refs

  const deletionStats = {
    userStatsDeleted: 0,
    mapsDeleted: 0,
    cluesDeleted: 0,
    gamesAnonymized: 0,
    gamePlayersAnonymized: 0,
    gameGuessesAnonymized: 0,
    gameWinsScrubbed: 0,
    friendListsCleaned: 0,
    sentRequestsCleaned: 0,
    receivedRequestsCleaned: 0,
    reportsMadeAnonymized: 0,
    reportsAgainstAnonymized: 0,
    dailyChallengeScoresDeleted: 0,
    dailyLeaderboardsScrubbed: 0,
    guestProfilesUnclaimed: 0,
    userAccountDeleted: 0,
  };

  // 1. UserStats (userId is a String column — match with the string id)
  deletionStats.userStatsDeleted =
    (await UserStats.deleteMany({ userId: accountId })).deletedCount || 0;

  // 2. Maps created by user (created_by is a String column)
  deletionStats.mapsDeleted =
    (await Map.deleteMany({ created_by: accountId })).deletedCount || 0;

  // 2b. Clues created by user — LEAK fix: neither old delete path handled these.
  deletionStats.cluesDeleted =
    (await Clue.deleteMany({ created_by: accountId })).deletedCount || 0;

  // 3. Anonymize Games. Scrub username, accountId AND playerId — for singleplayer
  //    + daily games playerId == accountId == user._id (storeGame.js /
  //    dailyGameHistoryWriter.js), a residual identifier the old cascade left
  //    queryable in the largest collection.
  // accountId fields are String columns, and we use the STRING id for both the
  // filter AND the arrayFilters. This matters: Mongoose casts top-level query
  // values to the schema type (ObjectId -> String), but it does NOT cast
  // arrayFilters — an ObjectId there is sent to MongoDB raw, never equals the
  // String-typed accountId, and the $[elem]/$[guess] update silently matches
  // zero array elements (leaving the player un-anonymized). Strings avoid that.
  const playersResult = await Game.updateMany(
    { 'players.accountId': accountId },
    {
      $set: {
        'players.$[elem].username': '[Deleted User]',
        'players.$[elem].accountId': null,
        'players.$[elem].playerId': null,
      },
    },
    { arrayFilters: [{ 'elem.accountId': accountId }] },
  );
  const roundResult = await Game.updateMany(
    { 'rounds.playerGuesses.accountId': accountId },
    {
      $set: {
        'rounds.$[].playerGuesses.$[guess].username': '[Deleted User]',
        'rounds.$[].playerGuesses.$[guess].accountId': null,
        'rounds.$[].playerGuesses.$[guess].playerId': null,
      },
    },
    { arrayFilters: [{ 'guess.accountId': accountId }] },
  );
  // Count BOTH passes — a game can match one but not the other (e.g. a player who
  // joined but never guessed matches `players` only). They overlap heavily, so
  // gamesAnonymized uses max() as the distinct-game estimate (summing would
  // double-count the common games); the per-pass counts are reported too.
  deletionStats.gamePlayersAnonymized = playersResult.modifiedCount || 0;
  deletionStats.gameGuessesAnonymized = roundResult.modifiedCount || 0;
  deletionStats.gamesAnonymized = Math.max(
    deletionStats.gamePlayersAnonymized,
    deletionStats.gameGuessesAnonymized,
  );

  // 3b. result.winner stores the winner's accountId for duels/unranked games and
  //     was never anonymized — scrub it.
  deletionStats.gameWinsScrubbed =
    (await Game.updateMany({ 'result.winner': accountId }, { $set: { 'result.winner': null } }))
      .modifiedCount || 0;

  // 4-6. Remove the user from every OTHER user's friend / request arrays.
  deletionStats.friendListsCleaned =
    (await User.updateMany({ friends: accountObjectId }, { $pull: { friends: accountObjectId } }))
      .modifiedCount || 0;
  deletionStats.sentRequestsCleaned =
    (await User.updateMany({ receivedReq: accountObjectId }, { $pull: { receivedReq: accountObjectId } }))
      .modifiedCount || 0;
  deletionStats.receivedRequestsCleaned =
    (await User.updateMany({ sentReq: accountObjectId }, { $pull: { sentReq: accountObjectId } }))
      .modifiedCount || 0;

  // 7-8. Anonymize reports made by / against the user.
  deletionStats.reportsMadeAnonymized =
    (await Report.updateMany(
      { 'reportedBy.accountId': accountId },
      { $set: { 'reportedBy.username': '[Deleted User]', 'reportedBy.accountId': null } },
    )).modifiedCount || 0;
  deletionStats.reportsAgainstAnonymized =
    (await Report.updateMany(
      { 'reportedUser.accountId': accountId },
      { $set: { 'reportedUser.username': '[Deleted User]', 'reportedUser.accountId': null } },
    )).modifiedCount || 0;

  // 9a. Delete daily-challenge score records (purges them from every daily
  //     leaderboard they appear on). We do NOT decrement DailyChallengeStats —
  //     it's a denormalized aggregate and the drift from a rare deletion isn't
  //     worth a partial recompute (same stance as the old mod cascade).
  deletionStats.dailyChallengeScoresDeleted =
    (await DailyChallengeScore.deleteMany({ userId: accountObjectId })).deletedCount || 0;

  // 9b. Scrub precomputed daily XP/ELO leaderboards.
  deletionStats.dailyLeaderboardsScrubbed =
    (await DailyLeaderboard.updateMany(
      { 'leaderboard.userId': accountId },
      { $pull: { leaderboard: { userId: accountId } } },
    )).modifiedCount || 0;

  // 9c. Un-claim any GuestProfile this user claimed (TTL handles eventual cleanup).
  deletionStats.guestProfilesUnclaimed =
    (await GuestProfile.updateMany(
      { claimedBy: accountObjectId },
      { $set: { claimedBy: null, claimedAt: null } },
    )).modifiedCount || 0;

  // 10. Permanent audit record (ModerationLog is never deleted). Best-effort: a
  //     logging failure must not abort the purge. moderator.{accountId,username}
  //     are required:true, so self-service uses a sentinel.
  try {
    await ModerationLog.create({
      targetUser: { accountId, username: targetUser.username || '[unknown]' },
      moderator: moderator
        ? { accountId: moderator._id?.toString() || 'system', username: moderator.username || 'system' }
        : { accountId: 'system', username: 'self-service' },
      actionType: 'user_deleted',
      reason: reason || (isSelfService ? 'self_service_deletion' : 'moderator_deletion'),
      notes: JSON.stringify({
        deletedUserInfo: {
          accountId,
          username: targetUser.username,
          totalXp: targetUser.totalXp,
          elo: targetUser.elo,
          created_at: targetUser.created_at,
        },
        deletionStats,
        isSelfService,
        deletedAt: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.error('[purgeUserCascade] ModerationLog write failed (non-critical):', e?.message || e);
  }

  // 11. Name change requests.
  await NameChangeRequest.deleteMany({ 'user.accountId': accountId });

  // 11b. Ban-evasion blocklist — ONLY for permanently-banned users, so a normal
  //      self-service delete can still re-register. Never throws.
  if (targetUser.banned && targetUser.banType === 'permanent') {
    await addBannedIdentity({
      user: targetUser,
      type: 'user_deleted',
      reason,
      publicNote: targetUser.banPublicNote || null,
      moderator,
    });
  }

  // 12. Finally, the User row.
  deletionStats.userAccountDeleted =
    (await User.deleteOne({ _id: accountObjectId })).deletedCount || 0;

  return deletionStats;
}
