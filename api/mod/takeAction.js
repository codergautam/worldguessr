import User from '../../models/User.js';
import Report from '../../models/Report.js';
import ModerationLog from '../../models/ModerationLog.js';
import NameChangeRequest from '../../models/NameChangeRequest.js';
import Game from '../../models/Game.js';
import UserStats from '../../models/UserStats.js';

/**
 * Refund ELO to opponents who lost ELO playing against a banned user
 *
 * @param {string} bannedUserId - The MongoDB _id of the banned user
 * @param {string} bannedUsername - The username of the banned user
 * @param {string} moderationLogId - The ID of the moderation log entry (optional, set after log is created)
 * @returns {Object} Summary of refunds: { totalRefunded, opponentsAffected, gamesProcessed }
 */
async function refundEloToOpponents(bannedUserId, bannedUsername, moderationLogId = null) {
  const bannedAccountId = bannedUserId.toString();

  // Find all ranked_duel games where the banned user participated
  // Use atomic findOneAndUpdate to prevent race conditions - only one request can claim each game
  const gameIds = await Game.find({
    gameType: 'ranked_duel',
    'players.accountId': bannedAccountId,
    eloRefunded: { $ne: true }
  }).distinct('_id');

  let totalRefunded = 0;
  let gamesProcessed = 0;
  let gamesMarkedRefunded = 0;
  const opponentRefunds = {}; // { opponentAccountId: totalRefund }

  // Process each game atomically - use findOneAndUpdate to claim the game
  for (const gameId of gameIds) {
    // Atomically mark game as refunded and get its data
    // Only succeeds if eloRefunded is still not true (prevents race condition)
    const game = await Game.findOneAndUpdate(
      {
        _id: gameId,
        eloRefunded: { $ne: true }
      },
      {
        eloRefunded: true,
        eloRefundedAt: new Date()
      },
      { new: false } // Return the original document before update
    );

    // If game is null, another request already claimed it - skip
    if (!game) continue;

    gamesMarkedRefunded++;

    // Find the opponent(s) who lost ELO in this game
    for (const player of game.players) {
      // Skip the banned user
      if (player.accountId === bannedAccountId) continue;

      // Skip if no ELO data or no loss
      if (!player.elo || !player.elo.change || player.elo.change >= 0) continue;

      // Skip guests (no accountId)
      if (!player.accountId) continue;

      // Calculate refund amount (absolute value of loss)
      const refundAmount = Math.abs(player.elo.change);

      // Track refund per opponent
      if (!opponentRefunds[player.accountId]) {
        opponentRefunds[player.accountId] = 0;
      }
      opponentRefunds[player.accountId] += refundAmount;
      totalRefunded += refundAmount;
      gamesProcessed++;
    }
  }

  // Apply refunds to each affected opponent
  const refundPromises = [];
  for (const [opponentAccountId, refundAmount] of Object.entries(opponentRefunds)) {
    // Update User model - add back the lost ELO
    refundPromises.push(
      User.findByIdAndUpdate(opponentAccountId, {
        $inc: { elo: refundAmount }
      }, { new: true }).then(async (updatedUser) => {
        if (updatedUser) {
          // Get current rank (approximate - we just need a reasonable value)
          const higherEloCount = await User.countDocuments({ elo: { $gt: updatedUser.elo } });
          const newRank = higherEloCount + 1;

          // Create UserStats entry to record the ELO refund
          await UserStats.create({
            userId: opponentAccountId,
            timestamp: new Date(),
            totalXp: updatedUser.totalXp || 0,
            xpRank: 1, // Will be recalculated on next proper update
            elo: updatedUser.elo,
            eloRank: newRank,
            triggerEvent: 'elo_refund',
            gameId: null,
            eloRefundDetails: {
              amount: refundAmount,
              bannedUserId: bannedAccountId,
              bannedUsername: bannedUsername,
              moderationLogId: moderationLogId ? moderationLogId.toString() : null
            }
          });
        }
      })
    );
  }

  await Promise.all(refundPromises);

  return {
    totalRefunded,
    opponentsAffected: Object.keys(opponentRefunds).length,
    gamesProcessed,
    gamesMarkedRefunded,
    refundDetails: opponentRefunds // { accountId: refundAmount }
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
    skipEloRefund     // For permanent bans: skip ELO refund to opponents (optional)
  } = req.body;

  // Validate required fields
  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid secret' });
  }

  if (!action || !['ignore', 'mark_resolved', 'ban_permanent', 'ban_temporary', 'force_name_change', 'unban'].includes(action)) {
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

    let moderationLog = null;
    let expiresAt = null;
    let eloRefundResult = null;

    // Handle each action type
    switch (action) {
      case 'ignore':
        // Mark reports as dismissed atomically to prevent race conditions
        const resolvedReportsIgnore = [];
        for (const report of reports) {
          // Atomically claim the report - only succeeds if still pending
          const claimedReport = await Report.findOneAndUpdate(
            { _id: report._id, status: 'pending' },
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

          resolvedReportsIgnore.push(report._id);

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
        // Mark reports as resolved without taking punitive action
        // The report was helpful (valid concern) but no action needed on the user
        const resolvedReportsNeutral = [];
        for (const report of reports) {
          // Atomically claim the report - only succeeds if still pending
          const claimedReport = await Report.findOneAndUpdate(
            { _id: report._id, status: 'pending' },
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

          resolvedReportsNeutral.push(report._id);

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

        // Refund ELO to opponents who lost ELO playing against this user (unless skipped)
        if (!skipEloRefund) {
          eloRefundResult = await refundEloToOpponents(targetUserId, targetUser.username);
        }

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
          relatedReports: resolvedReportsBan, // Only include reports we actually resolved
          notes: publicNote || '', // Public note for reference
          eloRefund: eloRefundResult // Store refund details in log
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

        // ELO refunds are only issued for permanent bans, not temporary bans

        // Find ALL pending reports against this user (not just the ones passed in)
        const pendingReportIdsTempBan = await Report.find({
          'reportedUser.accountId': targetUserId.toString(),
          status: 'pending'
        }).distinct('_id');

        // Update all pending reports atomically to prevent race conditions
        const resolvedReportsTempBan = [];
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

          // Increment helpful reports for reporter (only if we claimed it)
          await User.findByIdAndUpdate(claimedReport.reportedBy.accountId, {
            $inc: { 'reporterStats.helpfulReports': 1 }
          });
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
          relatedReports: resolvedReportsTempBan, // Only include reports we actually resolved
          notes: publicNote || '' // Public note for reference
          // No ELO refund for temporary bans
        });

        break;

      case 'force_name_change':
        // Set user to pending name change state
        await User.findByIdAndUpdate(targetUserId, {
          pendingNameChange: true,
          pendingNameChangeReason: reason, // INTERNAL - never exposed to user
          pendingNameChangePublicNote: publicNote || null // Shown to user
        });

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
          relatedReports: resolvedUsernameReports, // Only include reports we actually resolved
          nameChange: {
            oldName: targetUser.username,
            newName: null // Will be filled when they submit new name
          },
          notes: publicNote || '' // Public note for reference
        });

        // Update the moderation log ID on all resolved reports
        if (resolvedUsernameReports.length > 0) {
          await Report.updateMany(
            { _id: { $in: resolvedUsernameReports } },
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
      eloRefund: eloRefundResult, // ELO refund summary (null if no refunds)
      message: getSuccessMessage(action, targetUser.username, eloRefundResult)
    });

  } catch (error) {
    console.error('Moderation action error:', error);
    return res.status(500).json({
      message: 'An error occurred while taking moderation action',
      error: error.message
    });
  }
}

function getSuccessMessage(action, username, eloRefundResult = null) {
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
    default:
      message = 'Action completed';
  }

  // Add ELO refund info to message if applicable
  if (eloRefundResult && eloRefundResult.totalRefunded > 0) {
    message += `. Refunded ${eloRefundResult.totalRefunded} ELO to ${eloRefundResult.opponentsAffected} opponent(s) across ${eloRefundResult.gamesProcessed} game(s)`;
  }

  return message;
}

