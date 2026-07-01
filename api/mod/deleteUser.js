import User from '../../models/User.js';
import { purgeUserCascade } from '../../serverUtils/purgeUserCascade.js';

/**
 * Delete User API - Staff Only
 *
 * Permanently deletes a user and all associated data via the shared cascade
 * (serverUtils/purgeUserCascade.js — also used by the self-service deletion purge
 * in cron.js). This action is IRREVERSIBLE.
 *
 * NOTE: the heavy cascade can take a while on a well-connected account; this
 * endpoint can still exceed an HTTP timeout for such users even though the work
 * completes server-side. The self-service flow avoids that entirely by running
 * the cascade from the cron process.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const {
    secret,
    targetUserId,
    confirmUsername,  // Must match the target user's username for safety
    reason
  } = req.body;

  // Validate required fields
  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid secret' });
  }

  if (!targetUserId) {
    return res.status(400).json({ message: 'Target user ID is required' });
  }

  if (!confirmUsername || typeof confirmUsername !== 'string') {
    return res.status(400).json({ message: 'Username confirmation is required' });
  }

  if (!reason || reason.trim().length < 10) {
    return res.status(400).json({ message: 'Reason is required (minimum 10 characters)' });
  }

  try {
    // Verify requesting user is staff
    const moderator = await User.findOne({ secret });
    if (!moderator || !moderator.staff) {
      return res.status(403).json({ message: 'Unauthorized - staff access required' });
    }
    if (moderator.username !== 'codergautam' && moderator.username !== 'Pascaline') { // TODO: Remove this after testing
      return res.status(403).json({ message: 'Unauthorized - admin access required' });
    }
    // Find target user
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ message: 'Target user not found' });
    }

    // Don't allow deleting staff accounts
    if (targetUser.staff) {
      return res.status(403).json({ message: 'Cannot delete staff accounts' });
    }

    // Verify username confirmation matches
    if (confirmUsername.toLowerCase() !== targetUser.username.toLowerCase()) {
      return res.status(400).json({
        message: `Username confirmation does not match. Expected "${targetUser.username}"`
      });
    }

    // Store user info for logging before deletion
    const deletedUserInfo = {
      accountId: targetUser._id.toString(),
      username: targetUser.username,
      totalXp: targetUser.totalXp,
      elo: targetUser.elo,
      created_at: targetUser.created_at
    };

    // Run the shared cascade (single source of truth; also used by the
    // self-service deletion purge in cron.js). isSelfService:false keeps the
    // moderator attribution on the audit record and the perm-ban blocklist step.
    const deletionStats = await purgeUserCascade(targetUser, {
      reason,
      moderator,
      isSelfService: false,
    });

    return res.status(200).json({
      success: true,
      message: `User "${deletedUserInfo.username}" has been permanently deleted`,
      deletedUser: deletedUserInfo,
      deletionStats
    });

  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({
      message: 'An error occurred while deleting user',
      error: error.message
    });
  }
}
