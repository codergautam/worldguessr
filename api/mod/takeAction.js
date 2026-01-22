import User from '../../models/User.js';
import Report from '../../models/Report.js';
import ModerationLog from '../../models/ModerationLog.js';
import NameChangeRequest from '../../models/NameChangeRequest.js';
import Game from '../../models/Game.js';
import UserStats from '../../models/UserStats.js';
import { leagues } from '../../components/utils/leagues.js';
import cachegoose from 'recachegoose';

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

  // Get MAX_ELO from leagues
  const MAX_ELO = leagues.nomad.max;

  // Apply refunds to each affected opponent
  const refundPromises = [];
  for (const [opponentAccountId, refundAmount] of Object.entries(opponentRefunds)) {
    // Get current user to check their ELO before refund
    refundPromises.push(
      User.findById(opponentAccountId).then(async (opponentUser) => {
        if (!opponentUser) return;

        const currentElo = opponentUser.elo || 0;
        const newEloUncapped = currentElo + refundAmount;

        // Cap the new ELO at MAX_ELO - don't let refunds push users above the cap
        const newElo = Math.min(newEloUncapped, MAX_ELO);
        const actualRefund = newElo - currentElo;

        // Update User model with the capped ELO
        const updatedUser = await User.findByIdAndUpdate(
          opponentAccountId,
          { $set: { elo: newElo } },
          { new: true }
        );

        if (updatedUser) {
          // Get current ELO rank (excluding banned users)
          const higherEloCount = await User.countDocuments({ 
            elo: { $gt: updatedUser.elo },
            banned: { $ne: true },
          });
          const newEloRank = higherEloCount + 1;

          // Get most recent xpRank from UserStats for this user
          const mostRecentStats = await UserStats.findOne({ userId: opponentAccountId })
            .sort({ timestamp: -1 })
            .select('xpRank')
            .lean();
          const xpRank = mostRecentStats?.xpRank || 1;

          // Create UserStats entry to record the ELO refund
          await UserStats.create({
            userId: opponentAccountId,
            timestamp: new Date(),
            totalXp: updatedUser.totalXp || 0,
            xpRank: xpRank,
            elo: updatedUser.elo,
            eloRank: newEloRank,
            triggerEvent: 'elo_refund',
            gameId: null,
            eloRefundDetails: {
              amount: actualRefund,
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
    skipEloRefund     // For permanent bans: skip ELO refund to opponents (optional)
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

    let moderationLog = null;
    let expiresAt = null;
    let eloRefundResult = null;

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

        // Clear cached session data so user sees ban immediately on refresh
        cachegoose.clearCache(`userAuth_${targetUser.secret}`, (error) => {
          if (error) {
            console.error('Error clearing cache after ban:', error);
          } else {
            console.log('Cache cleared for banned user:', targetUserId);
          }
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

        // Enforce ban immediately via WebSocket if player is connected
        if (process.env.MAINTENANCE_SECRET && process.env.WS_PORT) {
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

        // Clear cached session data so user sees ban immediately on refresh
        cachegoose.clearCache(`userAuth_${targetUser.secret}`, (error) => {
          if (error) {
            console.error('Error clearing cache after temporary ban:', error);
          } else {
            console.log('Cache cleared for temporarily banned user:', targetUserId);
          }
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

        // Update previously ignored reports to action_taken (retroactive validation)
        const previouslyIgnoredTempBan = await updatePreviouslyIgnoredReports(
          targetUserId,
          'ban_temporary',
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
          actionType: 'ban_temporary',
          duration: duration,
          durationString: durationString || `${Math.round(duration / (1000 * 60 * 60 * 24))} days`,
          expiresAt: expiresAt,
          reason: reason, // Internal reason
          relatedReports: [...resolvedReportsTempBan, ...previouslyIgnoredTempBan.reportIds], // Include both pending and retroactive reports
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

        // Enforce name change immediately via WebSocket if player is connected
        if (process.env.MAINTENANCE_SECRET && process.env.WS_PORT) {
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

        // Clear cached session data so user sees pending name change immediately on refresh
        cachegoose.clearCache(`userAuth_${targetUser.secret}`, (error) => {
          if (error) {
            console.error('Error clearing cache after force name change:', error);
          } else {
            console.log('Cache cleared for user with forced name change:', targetUserId);
          }
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

        // Clear cached session data so user sees change immediately
        cachegoose.clearCache(`userAuth_${targetUser.secret}`, (error) => {
          if (error) {
            console.error('Error clearing cache after undo force name change:', error);
          } else {
            console.log('Cache cleared for user after undo force name change:', targetUserId);
          }
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

  return message;
}

