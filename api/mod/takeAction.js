import User from '../../models/User.js';
import Report from '../../models/Report.js';
import ModerationLog from '../../models/ModerationLog.js';
import NameChangeRequest from '../../models/NameChangeRequest.js';
import Game from '../../models/Game.js';
import DailyChallengeScore from '../../models/DailyChallengeScore.js';
import DailyLeaderboard from '../../models/DailyLeaderboard.js';
import { syncedClearCache } from '../../serverUtils/cacheBus.js';
import { invalidateDailyPublicCache } from '../dailyChallenge/results.js';
import { addBannedIdentity, removeBannedIdentity } from '../../serverUtils/bannedIdentities.js';
import { refundEloToOpponents, refundEloForReportedGames } from '../../serverUtils/eloRefunds.js';

/**
 * Remove a user from every daily leaderboard surface.
 *
 * Called from punitive actions (perm ban, temp ban, force_name_change) so the
 * offender stops showing up on the daily-challenge top-10 and the precomputed
 * daily XP/ELO leaderboards the moment the action lands. Without this, a
 * banned cheater's name keeps sitting at #1 until their entries naturally fall
 * off (which for past dates is "never").
 *
 * - DailyChallengeScore: flagged hidden=true rather than deleted, so the row
 *   (and its "one play per day" lock) survives and the offender still sees
 *   their own score/streak/history — it just never surfaces publicly again.
 *   NOT the disqualified flag: that means tab-switch DQ (score voided, streak
 *   denied, DQ ribbon in the UI), which is the wrong story for moderation.
 *   Post-ban submits arrive already hidden via submit.js's shadow path.
 * - DailyLeaderboard: $pulls the user's row from each cached top-50k array.
 *   The cron rebuild also filters banned/pendingNameChange users so they don't
 *   reappear on the next 15-minute cycle.
 */
async function scrubFromDailyLeaderboards(targetUserId) {
  const userIdStr = targetUserId.toString();

  // Capture which dates currently have live entries so we can invalidate the
  // per-date public cache after the scrub. Done before the update because
  // afterwards every row is hidden. DQ markers were never live, so they don't
  // need their dates invalidated.
  const affectedDates = await DailyChallengeScore.find({
    userId: targetUserId,
    hidden: { $ne: true },
    disqualified: { $ne: true }
  }).distinct('date');

  const [dcResult, dlResult] = await Promise.all([
    DailyChallengeScore.updateMany(
      { userId: targetUserId, hidden: { $ne: true } },
      { $set: { hidden: true } }
    ),
    DailyLeaderboard.updateMany(
      { 'leaderboard.userId': userIdStr },
      { $pull: { leaderboard: { userId: userIdStr } } }
    )
  ]);

  for (const date of affectedDates) invalidateDailyPublicCache(date);

  return {
    dailyChallengeScoresHidden: dcResult.modifiedCount,
    dailyLeaderboardsScrubbed: dlResult.modifiedCount
  };
}

/**
 * Update previously ignored reports to action_taken when a punitive action is taken
 * This retroactively validates reports that were incorrectly dismissed
 *
 * @param {string} targetUserId - The MongoDB _id of the user being moderated
 * @param {string} actionTaken - The action being taken ('ban_permanent', 'ban_temporary', 'force_name_change')
 * @param {Object} moderator - The moderator taking action { _id, username }
 * @param {string} reason - Internal moderation reason
 * @param {string|null} reportReasonFilter - Optional filter for specific report reasons (e.g., 'inappropriate_username')
 * @returns {Object} Summary: { updatedCount, reportIds }
 */
async function updatePreviouslyIgnoredReports(targetUserId, actionTaken, moderator, reason, reportReasonFilter = null) {
  // Build query for previously ignored reports against this user
  const query = {
    'reportedUser.accountId': targetUserId.toString(),
    status: 'dismissed',
    actionTaken: 'ignored'
  };

  // Optionally filter by report reason (e.g., only inappropriate_username for force_name_change)
  if (reportReasonFilter) {
    query.reason = reportReasonFilter;
  }

  // Find all previously ignored reports
  const ignoredReportIds = await Report.find(query).distinct('_id');

  const updatedReportIds = [];
  for (const reportId of ignoredReportIds) {
    // Atomically update only if still in dismissed/ignored state
    const updatedReport = await Report.findOneAndUpdate(
      {
        _id: reportId,
        status: 'dismissed',
        actionTaken: 'ignored'
      },
      {
        status: 'action_taken',
        actionTaken: actionTaken,
        // Keep original reviewedBy/reviewedAt but add note about retroactive update
        moderatorNotes: reason + ' [Retroactively marked as action_taken]'
      },
      { new: false } // Return original to get reporter info
    );

    if (!updatedReport) continue;

    updatedReportIds.push(reportId);

    // Adjust reporter stats: decrement unhelpfulReports, increment helpfulReports
    await User.findByIdAndUpdate(updatedReport.reportedBy.accountId, {
      $inc: {
        'reporterStats.unhelpfulReports': -1,
        'reporterStats.helpfulReports': 1
      }
    });
  }

  return {
    updatedCount: updatedReportIds.length,
    reportIds: updatedReportIds
  };
}

/**
 * Moderation Action API
 *
 * Handles all moderation actions:
 * - ignore: Ignore a report (counts against reporter)
 * - mark_resolved: Mark report as resolved without action (neutral - doesn't affect reporter stats)
 * - ban_permanent: Permanently ban a user
 * - ban_temporary: Temporarily ban a user for a specified duration
 * - force_name_change: Force user to change their username
 * - unban: Lift a ban from a user
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const {
    secret,
    action,           // 'ignore', 'mark_resolved', 'ban_permanent', 'ban_temporary', 'force_name_change', 'unban'
    targetUserId,     // MongoDB _id of user to take action on
    reportIds,        // Array of report IDs being acted upon (can be multiple for same user)
    reason,           // INTERNAL reason - NEVER shown to user, for mod reference only
    duration,         // For temp bans: duration in milliseconds
    durationString,   // For temp bans: human readable duration ("7 days", "30 days", etc.)
    publicNote,       // PUBLIC note - shown to user explaining the action (optional)
    skipEloRefund,    // For permanent bans: skip ELO refund to opponents (optional)
    suspiciousGameIds // Optional: Game.gameId string codes the mod flagged as evidence for this ban (internal only, no refund impact)
  } = req.body;

  // Validate required fields
  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid secret' });
  }

  if (!action || !['ignore', 'mark_resolved', 'ban_permanent', 'ban_temporary', 'force_name_change', 'unban', 'undo_force_name_change'].includes(action)) {
    return res.status(400).json({ message: 'Invalid action' });
  }

  if (!targetUserId) {
    return res.status(400).json({ message: 'Target user ID is required' });
  }

  if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
    return res.status(400).json({ message: 'Reason is required (minimum 3 characters)' });
  }

  if (action === 'ban_temporary' && (!duration || duration <= 0)) {
    return res.status(400).json({ message: 'Duration is required for temporary bans' });
  }

  try {
    // Verify requesting user is staff
    const moderator = await User.findOne({ secret });
    if (!moderator || !moderator.staff) {
      return res.status(403).json({ message: 'Unauthorized - staff access required' });
    }

    // Find target user
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ message: 'Target user not found' });
    }

    // Don't allow punitive actions against other staff
    // But allow report dismissal actions (ignore, mark_resolved) so mods can clear spam reports
    const punitiveActions = ['ban_permanent', 'ban_temporary', 'force_name_change', 'unban'];
    if (targetUser.staff && !moderator._id.equals(targetUser._id) && punitiveActions.includes(action)) {
      return res.status(403).json({ message: 'Cannot take moderation action against staff members' });
    }

    // Get reports if provided
    let reports = [];
    if (reportIds && reportIds.length > 0) {
      reports = await Report.find({ _id: { $in: reportIds } });
    }

    // Validate force_name_change is only used for inappropriate_username reports
    if (action === 'force_name_change') {
      const hasInappropriateUsernameReport = reports.some(r => r.reason === 'inappropriate_username');
      if (!hasInappropriateUsernameReport && reports.length > 0) {
        return res.status(400).json({
          message: 'Force name change can only be used for inappropriate username reports'
        });
      }
    }

    // Validate & sanitize the moderator-flagged suspicious games (evidence for this ban).
    // Persisted on the ModerationLog purely for appeals review - it does NOT influence
    // ELO refunds in any way (refunds remain exactly as before, handled per-action below).
    let suspiciousGames = [];
    if (Array.isArray(suspiciousGameIds) && suspiciousGameIds.length > 0) {
      // Dedupe, drop blanks, cap to a sane limit.
      const requestedGameIds = [...new Set(
        suspiciousGameIds
          .filter(g => typeof g === 'string' && g.trim().length > 0)
          .map(g => g.trim())
      )].slice(0, 100);

      if (requestedGameIds.length > 0) {
        // Keep only games that actually exist AND include the target as a player, so the
        // stored evidence can't be polluted with bogus/typo'd/unrelated game codes.
        // Snapshot the opponent (the other player) so the appeals view can show
        // "vs <name>" rather than a raw game code.
        const matchedGames = await Game.find({
          gameId: { $in: requestedGameIds },
          'players.accountId': targetUserId.toString()
        }).select('gameId players.username players.accountId players.team').lean();

        suspiciousGames = matchedGames.map(g => {
          const players = g.players || [];
          const target = players.find(p => p.accountId === targetUserId.toString());
          // Team games: "the opponent" is the whole opposing team — a bare
          // find() could snapshot the target's TEAMMATE. Join the names for
          // display; accountId stays null when there's more than one (the
          // gameId link opens the full game for anything deeper).
          const opponents = target?.team
            ? players.filter(p => p.team && p.team !== target.team)
            : players.filter(p => p.accountId !== targetUserId.toString()).slice(0, 1);
          return {
            gameId: g.gameId,
            opponentUsername: opponents.map(p => p.username).filter(Boolean).join(' & ') || null,
            opponentAccountId: opponents.length === 1 ? (opponents[0].accountId || null) : null
          };
        });
      }
    }

    let moderationLog = null;
    let expiresAt = null;
    let eloRefundResult = null;
    let leaderboardScrubResult = null;

    // Handle each action type
    switch (action) {
      case 'ignore':
        // Find ALL pending reports against this user (not just the ones passed in)
        const pendingReportIdsIgnore = await Report.find({
          'reportedUser.accountId': targetUserId.toString(),
          status: 'pending'
        }).distinct('_id');

        // Mark all pending reports as dismissed atomically to prevent race conditions
        const resolvedReportsIgnore = [];
        for (const reportId of pendingReportIdsIgnore) {
          // Atomically claim the report - only succeeds if still pending
          const claimedReport = await Report.findOneAndUpdate(
            { _id: reportId, status: 'pending' },
            {
              status: 'dismissed',
              actionTaken: 'ignored',
              reviewedBy: {
                accountId: moderator._id.toString(),
                username: moderator.username
              },
              reviewedAt: new Date(),
              moderatorNotes: reason
            },
            { new: false } // Return original to get reporter info
          );

          // If null, another mod already processed this report - skip
          if (!claimedReport) continue;

          resolvedReportsIgnore.push(reportId);

          // Increment unhelpful reports for reporter (only if we claimed it)
          await User.findByIdAndUpdate(claimedReport.reportedBy.accountId, {
            $inc: { 'reporterStats.unhelpfulReports': 1 }
          });
        }

        // Create moderation log
        moderationLog = await ModerationLog.create({
          targetUser: {
            accountId: targetUser._id.toString(),
            username: targetUser.username
          },
          moderator: {
            accountId: moderator._id.toString(),
            username: moderator.username
          },
          actionType: 'report_ignored',
          reason: reason, // Internal reason
          relatedReports: resolvedReportsIgnore, // Only include reports we actually resolved
          notes: publicNote || '' // Public note for reference (though ignored reports don't notify user)
        });

        break;

      case 'mark_resolved':
        // Find ALL pending reports against this user (not just the ones passed in)
        const pendingReportIdsResolved = await Report.find({
          'reportedUser.accountId': targetUserId.toString(),
          status: 'pending'
        }).distinct('_id');

        // Mark all pending reports as resolved without taking punitive action
        // The report was helpful (valid concern) but no action needed on the user
        const resolvedReportsNeutral = [];
        for (const reportId of pendingReportIdsResolved) {
          // Atomically claim the report - only succeeds if still pending
          const claimedReport = await Report.findOneAndUpdate(
            { _id: reportId, status: 'pending' },
            {
              status: 'action_taken',
              actionTaken: 'resolved_no_action',
              reviewedBy: {
                accountId: moderator._id.toString(),
                username: moderator.username
              },
              reviewedAt: new Date(),
              moderatorNotes: reason
            },
            { new: false }
          );

          // If null, another mod already processed this report - skip
          if (!claimedReport) continue;

          resolvedReportsNeutral.push(reportId);

          // Increment helpful reports for reporter - the report was valid/helpful
          // even though no punitive action was taken on the reported user
          await User.findByIdAndUpdate(claimedReport.reportedBy.accountId, {
            $inc: { 'reporterStats.helpfulReports': 1 }
          });
        }

        // Create moderation log
        moderationLog = await ModerationLog.create({
          targetUser: {
            accountId: targetUser._id.toString(),
            username: targetUser.username
          },
          moderator: {
            accountId: moderator._id.toString(),
            username: moderator.username
          },
          actionType: 'report_resolved',
          reason: reason, // Internal reason
          relatedReports: resolvedReportsNeutral,
          notes: publicNote || ''
        });

        break;

      case 'ban_permanent':
        // Permanently ban the user
        await User.findByIdAndUpdate(targetUserId, {
          banned: true,
          banType: 'permanent',
          banExpiresAt: null,
          banReason: reason, // INTERNAL - never exposed to user
          banPublicNote: publicNote || null // Shown to user
        });

        // Blocklist this identity so a deleted/re-registered account can't evade
        // the ban (perm bans only — see BannedIdentity). Best-effort: never blocks
        // the ban itself. Removed again on unban below.
        await addBannedIdentity({
          user: targetUser,
          type: 'ban_permanent',
          reason,
          publicNote: publicNote || null,
          moderator,
        });

        // Enforce ban immediately via WebSocket if player is connected
        if (process.env.MAINTENANCE_SECRET) {
          try {
            const wsPort = process.env.WS_PORT || 3002;
            const wsUrl = `http://localhost:${wsPort}/enforce-ban/${process.env.MAINTENANCE_SECRET}/${targetUserId}`;

            const wsResponse = await fetch(wsUrl, { method: 'GET' });
            const wsResult = await wsResponse.json();
            console.log('WebSocket ban enforcement result:', wsResult);
          } catch (error) {
            // Non-critical: Ban still succeeded in database
            console.error('Failed to enforce ban via WebSocket (non-critical):', error.message);
          }
        }

        syncedClearCache(`userAuth_${targetUser.secret}`);

        // Refund ELO to opponents who lost ELO playing against this user (unless skipped)
        if (!skipEloRefund) {
          eloRefundResult = await refundEloToOpponents(targetUserId, targetUser.username);
        }

        // Strip the user from every daily leaderboard surface
        leaderboardScrubResult = await scrubFromDailyLeaderboards(targetUserId);

        // Find ALL pending reports against this user (not just the ones passed in)
        const pendingReportIdsBan = await Report.find({
          'reportedUser.accountId': targetUserId.toString(),
          status: 'pending'
        }).distinct('_id');

        // Update all pending reports atomically to prevent race conditions
        const resolvedReportsBan = [];
        for (const reportId of pendingReportIdsBan) {
          // Atomically claim the report - only succeeds if still pending
          const claimedReport = await Report.findOneAndUpdate(
            { _id: reportId, status: 'pending' },
            {
              status: 'action_taken',
              actionTaken: 'ban_permanent',
              reviewedBy: {
                accountId: moderator._id.toString(),
                username: moderator.username
              },
              reviewedAt: new Date(),
              moderatorNotes: reason
            },
            { new: false } // Return original to get reporter info
          );

          // If null, another mod already processed this report - skip
          if (!claimedReport) continue;

          resolvedReportsBan.push(reportId);

          // Increment helpful reports for reporter (only if we claimed it)
          await User.findByIdAndUpdate(claimedReport.reportedBy.accountId, {
            $inc: { 'reporterStats.helpfulReports': 1 }
          });
        }

        // Update previously ignored reports to action_taken (retroactive validation)
        const previouslyIgnoredBan = await updatePreviouslyIgnoredReports(
          targetUserId,
          'ban_permanent',
          moderator,
          reason
        );

        // Create moderation log (internal - stores both reason and public note)
        moderationLog = await ModerationLog.create({
          targetUser: {
            accountId: targetUser._id.toString(),
            username: targetUser.username
          },
          moderator: {
            accountId: moderator._id.toString(),
            username: moderator.username
          },
          actionType: 'ban_permanent',
          reason: reason, // Internal reason
          relatedReports: [...resolvedReportsBan, ...previouslyIgnoredBan.reportIds], // Include both pending and retroactive reports
          notes: publicNote || '', // Public note for reference
          eloRefund: eloRefundResult, // Store refund details in log
          suspiciousGames // Mod-flagged evidence games (internal only)
        });

        break;

      case 'ban_temporary':
        // Calculate expiration date
        expiresAt = new Date(Date.now() + duration);

        // Temporarily ban the user
        await User.findByIdAndUpdate(targetUserId, {
          banned: true,
          banType: 'temporary',
          banExpiresAt: expiresAt,
          banReason: reason, // INTERNAL - never exposed to user
          banPublicNote: publicNote || null // Shown to user
        });

        // Enforce ban immediately via WebSocket if player is connected
        if (process.env.MAINTENANCE_SECRET) {
          try {
            const wsPort = process.env.WS_PORT || 3002;
            const wsUrl = `http://localhost:${wsPort}/enforce-ban/${process.env.MAINTENANCE_SECRET}/${targetUserId}`;

            const wsResponse = await fetch(wsUrl, { method: 'GET' });
            const wsResult = await wsResponse.json();
            console.log('WebSocket ban enforcement result:', wsResult);
          } catch (error) {
            // Non-critical: Ban still succeeded in database
            console.error('Failed to enforce ban via WebSocket (non-critical):', error.message);
          }
        }

        syncedClearCache(`userAuth_${targetUser.secret}`);

        // Strip the user from every daily leaderboard surface
        leaderboardScrubResult = await scrubFromDailyLeaderboards(targetUserId);

        // Find ALL pending reports against this user (not just the ones passed in)
        const pendingReportIdsTempBan = await Report.find({
          'reportedUser.accountId': targetUserId.toString(),
          status: 'pending'
        }).distinct('_id');

        // Update all pending reports atomically to prevent race conditions
        const resolvedReportsTempBan = [];
        const reportedGameIdsTempBan = [];
        for (const reportId of pendingReportIdsTempBan) {
          // Atomically claim the report - only succeeds if still pending
          const claimedReport = await Report.findOneAndUpdate(
            { _id: reportId, status: 'pending' },
            {
              status: 'action_taken',
              actionTaken: 'ban_temporary',
              reviewedBy: {
                accountId: moderator._id.toString(),
                username: moderator.username
              },
              reviewedAt: new Date(),
              moderatorNotes: reason
            },
            { new: false } // Return original to get reporter info
          );

          // If null, another mod already processed this report - skip
          if (!claimedReport) continue;

          resolvedReportsTempBan.push(reportId);
          if (claimedReport.gameId) {
            reportedGameIdsTempBan.push(claimedReport.gameId);
          }

          // Increment helpful reports for reporter (only if we claimed it)
          await User.findByIdAndUpdate(claimedReport.reportedBy.accountId, {
            $inc: { 'reporterStats.helpfulReports': 1 }
          });
        }

        // Update previously ignored reports to action_taken (retroactive validation)
        const previouslyIgnoredTempBan = await updatePreviouslyIgnoredReports(
          targetUserId,
          'ban_temporary',
          moderator,
          reason
        );

        // Collect gameIds from previously ignored reports that were retroactively validated
        if (previouslyIgnoredTempBan.reportIds.length > 0) {
          const ignoredReportGameIds = await Report.find({
            _id: { $in: previouslyIgnoredTempBan.reportIds },
            gameId: { $nin: [null, ''] }
          }).distinct('gameId');
          reportedGameIdsTempBan.push(...ignoredReportGameIds);
        }

        // Refund ELO only for the specific games that were reported
        const uniqueReportedGameIds = [...new Set(reportedGameIdsTempBan)];
        if (uniqueReportedGameIds.length > 0) {
          eloRefundResult = await refundEloForReportedGames(targetUserId, targetUser.username, uniqueReportedGameIds);
        }

        // Create moderation log (internal - stores both reason and public note)
        moderationLog = await ModerationLog.create({
          targetUser: {
            accountId: targetUser._id.toString(),
            username: targetUser.username
          },
          moderator: {
            accountId: moderator._id.toString(),
            username: moderator.username
          },
          actionType: 'ban_temporary',
          duration: duration,
          durationString: durationString || `${Math.round(duration / (1000 * 60 * 60 * 24))} days`,
          expiresAt: expiresAt,
          reason: reason, // Internal reason
          relatedReports: [...resolvedReportsTempBan, ...previouslyIgnoredTempBan.reportIds], // Include both pending and retroactive reports
          notes: publicNote || '', // Public note for reference
          eloRefund: eloRefundResult, // Store refund details in log
          suspiciousGames // Mod-flagged evidence games (internal only)
        });

        break;

      case 'force_name_change':
        // Set user to pending name change state
        await User.findByIdAndUpdate(targetUserId, {
          pendingNameChange: true,
          pendingNameChangeReason: reason, // INTERNAL - never exposed to user
          pendingNameChangePublicNote: publicNote || null // Shown to user
        });

        // Enforce name change immediately via WebSocket if player is connected
        if (process.env.MAINTENANCE_SECRET) {
          try {
            const wsPort = process.env.WS_PORT || 3002;
            const wsUrl = `http://localhost:${wsPort}/enforce-ban/${process.env.MAINTENANCE_SECRET}/${targetUserId}`;

            const wsResponse = await fetch(wsUrl, { method: 'GET' });
            const wsResult = await wsResponse.json();
            console.log('WebSocket name change enforcement result:', wsResult);
          } catch (error) {
            // Non-critical: Name change requirement still succeeded in database
            console.error('Failed to enforce name change via WebSocket (non-critical):', error.message);
          }
        }

        syncedClearCache(`userAuth_${targetUser.secret}`);

        // Strip the user from every daily leaderboard surface — their bad
        // username should stop appearing on the daily-challenge top-10 and
        // the precomputed XP/ELO daily leaderboards immediately, not after
        // they get around to picking a new name.
        leaderboardScrubResult = await scrubFromDailyLeaderboards(targetUserId);

        // Find ALL pending inappropriate_username reports against this user
        // (only resolve username reports, not cheating reports)
        const pendingUsernameReportIds = await Report.find({
          'reportedUser.accountId': targetUserId.toString(),
          status: 'pending',
          reason: 'inappropriate_username'
        }).distinct('_id');

        // Update all pending username reports atomically to prevent race conditions
        const resolvedUsernameReports = [];
        for (const reportId of pendingUsernameReportIds) {
          // Atomically claim the report - only succeeds if still pending
          const claimedReport = await Report.findOneAndUpdate(
            { _id: reportId, status: 'pending' },
            {
              status: 'action_taken',
              actionTaken: 'force_name_change',
              reviewedBy: {
                accountId: moderator._id.toString(),
                username: moderator.username
              },
              reviewedAt: new Date(),
              moderatorNotes: reason
            },
            { new: false } // Return original to get reporter info
          );

          // If null, another mod already processed this report - skip
          if (!claimedReport) continue;

          resolvedUsernameReports.push(reportId);

          // Increment helpful reports for reporter (only if we claimed it)
          await User.findByIdAndUpdate(claimedReport.reportedBy.accountId, {
            $inc: { 'reporterStats.helpfulReports': 1 }
          });
        }

        // Update previously ignored inappropriate_username reports to action_taken (retroactive validation)
        const previouslyIgnoredNameChange = await updatePreviouslyIgnoredReports(
          targetUserId,
          'force_name_change',
          moderator,
          reason,
          'inappropriate_username' // Only update inappropriate_username reports
        );

        // Combine all resolved reports for the moderation log
        const allResolvedUsernameReports = [...resolvedUsernameReports, ...previouslyIgnoredNameChange.reportIds];

        // Create moderation log (internal - stores both reason and public note)
        moderationLog = await ModerationLog.create({
          targetUser: {
            accountId: targetUser._id.toString(),
            username: targetUser.username
          },
          moderator: {
            accountId: moderator._id.toString(),
            username: moderator.username
          },
          actionType: 'force_name_change',
          reason: reason, // Internal reason
          relatedReports: allResolvedUsernameReports, // Include both pending and retroactive reports
          nameChange: {
            oldName: targetUser.username,
            newName: null // Will be filled when they submit new name
          },
          notes: publicNote || '' // Public note for reference
        });

        // Update the moderation log ID on all resolved reports
        if (allResolvedUsernameReports.length > 0) {
          await Report.updateMany(
            { _id: { $in: allResolvedUsernameReports } },
            { moderationLogId: moderationLog._id }
          );
        }

        break;

      case 'unban':
        // Unban the user
        await User.findByIdAndUpdate(targetUserId, {
          banned: false,
          banType: 'none',
          banExpiresAt: null,
          banPublicNote: null // Clear the public note on unban
          // Note: We keep banReason for historical reference
        });

        // Reversing the ban restores sign-up access: drop any blocklist entry so
        // this identity can create/keep an account again.
        await removeBannedIdentity(targetUserId);

        // Create moderation log
        moderationLog = await ModerationLog.create({
          targetUser: {
            accountId: targetUser._id.toString(),
            username: targetUser.username
          },
          moderator: {
            accountId: moderator._id.toString(),
            username: moderator.username
          },
          actionType: 'unban',
          reason: reason, // Internal reason
          notes: publicNote || '' // Public note for reference
        });

        break;

      case 'undo_force_name_change':
        // Undo a force name change - clear the pending name change status
        if (!targetUser.pendingNameChange) {
          return res.status(400).json({
            message: 'This user does not have a pending name change to undo'
          });
        }

        // Clear pending name change status
        await User.findByIdAndUpdate(targetUserId, {
          pendingNameChange: false,
          pendingNameChangeReason: null,
          pendingNameChangePublicNote: null
        });

        // Delete any pending name change requests for this user
        await NameChangeRequest.deleteMany({
          'user.accountId': targetUserId.toString(),
          status: 'pending'
        });

        syncedClearCache(`userAuth_${targetUser.secret}`);

        // Create moderation log
        moderationLog = await ModerationLog.create({
          targetUser: {
            accountId: targetUser._id.toString(),
            username: targetUser.username
          },
          moderator: {
            accountId: moderator._id.toString(),
            username: moderator.username
          },
          actionType: 'undo_force_name_change',
          reason: reason, // Internal reason
          notes: publicNote || '' // Public note for reference
        });

        break;
    }

    return res.status(200).json({
      success: true,
      action: action,
      targetUser: {
        id: targetUser._id,
        username: targetUser.username
      },
      moderationLogId: moderationLog?._id,
      expiresAt: expiresAt,
      suspiciousGames: suspiciousGames, // Mod-flagged evidence games stored on the log (internal only)
      eloRefund: eloRefundResult, // ELO refund summary (null if no refunds)
      leaderboardScrub: leaderboardScrubResult, // Daily-leaderboard scrub summary (null if not applicable)
      message: getSuccessMessage(action, targetUser.username, eloRefundResult, leaderboardScrubResult)
    });

  } catch (error) {
    console.error('Moderation action error:', error);
    return res.status(500).json({
      message: 'An error occurred while taking moderation action',
      error: error.message
    });
  }
}

function getSuccessMessage(action, username, eloRefundResult = null, leaderboardScrubResult = null) {
  let message;
  switch (action) {
    case 'ignore':
      message = `Reports against ${username} have been ignored`;
      break;
    case 'mark_resolved':
      message = `Reports against ${username} have been marked as resolved (no action taken)`;
      break;
    case 'ban_permanent':
      message = `${username} has been permanently banned`;
      break;
    case 'ban_temporary':
      message = `${username} has been temporarily banned`;
      break;
    case 'force_name_change':
      message = `${username} has been forced to change their username`;
      break;
    case 'unban':
      message = `${username} has been unbanned`;
      break;
    case 'undo_force_name_change':
      message = `Force name change for ${username} has been undone`;
      break;
    default:
      message = 'Action completed';
  }

  // Add ELO refund info to message if applicable
  if (eloRefundResult && eloRefundResult.totalRefunded > 0) {
    message += `. Refunded ${eloRefundResult.totalRefunded} ELO to ${eloRefundResult.opponentsAffected} opponent(s) across ${eloRefundResult.gamesProcessed} game(s)`;
  }

  if (leaderboardScrubResult) {
    const { dailyChallengeScoresHidden = 0, dailyLeaderboardsScrubbed = 0 } = leaderboardScrubResult;
    if (dailyChallengeScoresHidden > 0 || dailyLeaderboardsScrubbed > 0) {
      message += `. Removed from daily leaderboards (${dailyChallengeScoresHidden} challenge score(s), ${dailyLeaderboardsScrubbed} cached leaderboard(s))`;
    }
  }

  return message;
}

