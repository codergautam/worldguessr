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
  // Skip games that have already been refunded (to prevent double refunds on re-ban)
  const games = await Game.find({
    gameType: 'ranked_duel',
    'players.accountId': bannedAccountId,
    eloRefunded: { $ne: true }
  });

  let totalRefunded = 0;
  let gamesProcessed = 0;
  const opponentRefunds = {}; // { opponentAccountId: totalRefund }
  const gameIdsToMarkRefunded = []; // Track game IDs to mark as refunded

  for (const game of games) {
    let gameHadRefund = false;

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
      gameHadRefund = true;
    }

    // Mark this game for refund status update (even if no refunds were made,
    // to prevent re-processing on future bans)
    gameIdsToMarkRefunded.push(game._id);
  }

  // Mark all processed games as refunded to prevent double refunds
  if (gameIdsToMarkRefunded.length > 0) {
    await Game.updateMany(
      { _id: { $in: gameIdsToMarkRefunded } },
      {
        eloRefunded: true,
        eloRefundedAt: new Date()
      }
    );
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
    gamesMarkedRefunded: gameIdsToMarkRefunded.length,
    refundDetails: opponentRefunds // { accountId: refundAmount }
  };
}

/**
 * Moderation Action API
 *
 * Handles all moderation actions:
 * - ignore: Ignore a report (counts against reporter)
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
    action,           // 'ignore', 'ban_permanent', 'ban_temporary', 'force_name_change', 'unban'
    targetUserId,     // MongoDB _id of user to take action on
    reportIds,        // Array of report IDs being acted upon (can be multiple for same user)
    reason,           // INTERNAL reason - NEVER shown to user, for mod reference only
    duration,         // For temp bans: duration in milliseconds
    durationString,   // For temp bans: human readable duration ("7 days", "30 days", etc.)
    publicNote        // PUBLIC note - shown to user explaining the action (optional)
  } = req.body;

  // Validate required fields
  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid secret' });
  }

  if (!action || !['ignore', 'ban_permanent', 'ban_temporary', 'force_name_change', 'unban'].includes(action)) {
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

    // Don't allow actions against other staff
    if (targetUser.staff && !moderator._id.equals(targetUser._id)) {
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
        // Mark reports as dismissed and update reporter stats
        for (const report of reports) {
          // Only increment unhelpful reports if this report hasn't already been reviewed
          const shouldIncrementReporterStats = report.status !== 'dismissed' && report.status !== 'action_taken';

          // Update report status
          await Report.findByIdAndUpdate(report._id, {
            status: 'dismissed',
            actionTaken: 'ignored',
            reviewedBy: {
              accountId: moderator._id.toString(),
              username: moderator.username
            },
            reviewedAt: new Date(),
            moderatorNotes: reason // Store internal reason in report for mod reference
          });

          // Increment unhelpful reports for reporter (only if not already counted)
          if (shouldIncrementReporterStats) {
            await User.findByIdAndUpdate(report.reportedBy.accountId, {
              $inc: { 'reporterStats.unhelpfulReports': 1 }
            });
          }
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
          relatedReports: reportIds || [],
          notes: publicNote || '' // Public note for reference (though ignored reports don't notify user)
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

        // Refund ELO to opponents who lost ELO playing against this user
        eloRefundResult = await refundEloToOpponents(targetUserId, targetUser.username);

        // Find ALL pending reports against this user (not just the ones passed in)
        const allPendingReportsBan = await Report.find({
          'reportedUser.accountId': targetUserId.toString(),
          status: 'pending'
        });

        // Update all pending reports against this user
        for (const report of allPendingReportsBan) {
          await Report.findByIdAndUpdate(report._id, {
            status: 'action_taken',
            actionTaken: 'ban_permanent',
            reviewedBy: {
              accountId: moderator._id.toString(),
              username: moderator.username
            },
            reviewedAt: new Date(),
            moderatorNotes: reason // Store internal reason in report for mod reference
          });

          // Increment helpful reports for reporter
          await User.findByIdAndUpdate(report.reportedBy.accountId, {
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
          relatedReports: allPendingReportsBan.map(r => r._id), // Include all resolved reports
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

        // Refund ELO to opponents who lost ELO playing against this user
        eloRefundResult = await refundEloToOpponents(targetUserId, targetUser.username);

        // Find ALL pending reports against this user (not just the ones passed in)
        const allPendingReportsTempBan = await Report.find({
          'reportedUser.accountId': targetUserId.toString(),
          status: 'pending'
        });

        // Update all pending reports against this user
        for (const report of allPendingReportsTempBan) {
          await Report.findByIdAndUpdate(report._id, {
            status: 'action_taken',
            actionTaken: 'ban_temporary',
            reviewedBy: {
              accountId: moderator._id.toString(),
              username: moderator.username
            },
            reviewedAt: new Date(),
            moderatorNotes: reason // Store internal reason in report for mod reference
          });

          // Increment helpful reports for reporter
          await User.findByIdAndUpdate(report.reportedBy.accountId, {
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
          relatedReports: allPendingReportsTempBan.map(r => r._id), // Include all resolved reports
          notes: publicNote || '', // Public note for reference
          eloRefund: eloRefundResult // Store refund details in log
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
        const allPendingUsernameReports = await Report.find({
          'reportedUser.accountId': targetUserId.toString(),
          status: 'pending',
          reason: 'inappropriate_username'
        });

        // Update all pending username reports against this user
        for (const report of allPendingUsernameReports) {
          await Report.findByIdAndUpdate(report._id, {
            status: 'action_taken',
            actionTaken: 'force_name_change',
            reviewedBy: {
              accountId: moderator._id.toString(),
              username: moderator.username
            },
            reviewedAt: new Date(),
            moderatorNotes: reason // Store internal reason in report for mod reference
          });

          // Increment helpful reports for reporter
          await User.findByIdAndUpdate(report.reportedBy.accountId, {
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
          relatedReports: allPendingUsernameReports.map(r => r._id), // Include all resolved reports
          nameChange: {
            oldName: targetUser.username,
            newName: null // Will be filled when they submit new name
          },
          notes: publicNote || '' // Public note for reference
        });

        // Update the moderation log ID on all resolved reports
        if (allPendingUsernameReports.length > 0) {
          await Report.updateMany(
            { _id: { $in: allPendingUsernameReports.map(r => r._id) } },
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

