import User from '../../models/User.js';
import Report from '../../models/Report.js';
import ModerationLog from '../../models/ModerationLog.js';
import NameChangeRequest from '../../models/NameChangeRequest.js';

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

    // Handle each action type
    switch (action) {
      case 'ignore':
        // Mark reports as dismissed and update reporter stats
        for (const report of reports) {
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

          // Increment unhelpful reports for reporter
          await User.findByIdAndUpdate(report.reportedBy.accountId, {
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

        // Update reports
        for (const report of reports) {
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
          relatedReports: reportIds || [],
          notes: publicNote || '' // Public note for reference
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

        // Update reports
        for (const report of reports) {
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
          relatedReports: reportIds || [],
          notes: publicNote || '' // Public note for reference
        });

        break;

      case 'force_name_change':
        // Set user to pending name change state
        await User.findByIdAndUpdate(targetUserId, {
          pendingNameChange: true,
          pendingNameChangeReason: reason, // INTERNAL - never exposed to user
          pendingNameChangePublicNote: publicNote || null // Shown to user
        });

        // Update reports
        for (const report of reports) {
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
          relatedReports: reportIds || [],
          nameChange: {
            oldName: targetUser.username,
            newName: null // Will be filled when they submit new name
          },
          notes: publicNote || '' // Public note for reference
        });

        // Update the moderation log ID on reports
        if (reportIds && reportIds.length > 0) {
          await Report.updateMany(
            { _id: { $in: reportIds } },
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
      message: getSuccessMessage(action, targetUser.username)
    });

  } catch (error) {
    console.error('Moderation action error:', error);
    return res.status(500).json({
      message: 'An error occurred while taking moderation action',
      error: error.message
    });
  }
}

function getSuccessMessage(action, username) {
  switch (action) {
    case 'ignore':
      return `Reports against ${username} have been ignored`;
    case 'ban_permanent':
      return `${username} has been permanently banned`;
    case 'ban_temporary':
      return `${username} has been temporarily banned`;
    case 'force_name_change':
      return `${username} has been forced to change their username`;
    case 'unban':
      return `${username} has been unbanned`;
    default:
      return 'Action completed';
  }
}

