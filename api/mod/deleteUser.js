import User from '../../models/User.js';
import UserStats from '../../models/UserStats.js';
import Map from '../../models/Map.js';
import Game from '../../models/Game.js';
import Report from '../../models/Report.js';
import ModerationLog from '../../models/ModerationLog.js';
import NameChangeRequest from '../../models/NameChangeRequest.js';

/**
 * Delete User API - Staff Only
 * 
 * Permanently deletes a user and all associated data.
 * This action is IRREVERSIBLE.
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
      email: targetUser.email,
      totalXp: targetUser.totalXp,
      elo: targetUser.elo,
      created_at: targetUser.created_at
    };

    // Count related data for response
    const counts = {
      userStats: await UserStats.countDocuments({ userId: targetUser._id }),
      maps: await Map.countDocuments({ created_by: targetUser._id }),
      games: await Game.countDocuments({ 'players.accountId': targetUser._id }),
      friendsOf: await User.countDocuments({ friends: targetUser._id }),
      sentRequests: await User.countDocuments({ receivedReq: targetUser._id }),
      receivedRequests: await User.countDocuments({ sentReq: targetUser._id }),
      reportsMade: await Report.countDocuments({ 'reportedBy.accountId': targetUser._id.toString() }),
      reportsAgainst: await Report.countDocuments({ 'reportedUser.accountId': targetUser._id.toString() })
    };

    // Start deletion process
    const deletionStats = {
      userStatsDeleted: 0,
      mapsDeleted: 0,
      gamesAnonymized: 0,
      friendListsCleaned: 0,
      sentRequestsCleaned: 0,
      receivedRequestsCleaned: 0,
      reportsMadeAnonymized: 0,
      reportsAgainstAnonymized: 0,
      userAccountDeleted: 0
    };

    // 1. Delete UserStats
    if (counts.userStats > 0) {
      const result = await UserStats.deleteMany({ userId: targetUser._id });
      deletionStats.userStatsDeleted = result.deletedCount;
    }

    // 2. Delete Maps created by user
    if (counts.maps > 0) {
      const result = await Map.deleteMany({ created_by: targetUser._id });
      deletionStats.mapsDeleted = result.deletedCount;
    }

    // 3. Anonymize user data in Games
    if (counts.games > 0) {
      // Anonymize player summary data
      await Game.updateMany(
        { 'players.accountId': targetUser._id },
        { 
          $set: {
            'players.$[elem].username': '[Deleted User]',
            'players.$[elem].accountId': null
          }
        },
        { arrayFilters: [{ 'elem.accountId': targetUser._id }] }
      );

      // Anonymize round guess data
      const roundResult = await Game.updateMany(
        { 'rounds.playerGuesses.accountId': targetUser._id },
        { 
          $set: {
            'rounds.$[].playerGuesses.$[guess].username': '[Deleted User]',
            'rounds.$[].playerGuesses.$[guess].accountId': null
          }
        },
        { arrayFilters: [{ 'guess.accountId': targetUser._id }] }
      );
      deletionStats.gamesAnonymized = roundResult.modifiedCount;
    }

    // 4. Remove user from friend lists
    if (counts.friendsOf > 0) {
      const result = await User.updateMany(
        { friends: targetUser._id },
        { $pull: { friends: targetUser._id } }
      );
      deletionStats.friendListsCleaned = result.modifiedCount;
    }

    // 5. Remove sent friend requests
    if (counts.sentRequests > 0) {
      const result = await User.updateMany(
        { receivedReq: targetUser._id },
        { $pull: { receivedReq: targetUser._id } }
      );
      deletionStats.sentRequestsCleaned = result.modifiedCount;
    }

    // 6. Remove received friend requests
    if (counts.receivedRequests > 0) {
      const result = await User.updateMany(
        { sentReq: targetUser._id },
        { $pull: { sentReq: targetUser._id } }
      );
      deletionStats.receivedRequestsCleaned = result.modifiedCount;
    }

    // 7. Anonymize reports made by user
    if (counts.reportsMade > 0) {
      const result = await Report.updateMany(
        { 'reportedBy.accountId': targetUser._id.toString() },
        { 
          $set: {
            'reportedBy.username': '[Deleted User]',
            'reportedBy.accountId': null
          }
        }
      );
      deletionStats.reportsMadeAnonymized = result.modifiedCount;
    }

    // 8. Anonymize reports against user
    if (counts.reportsAgainst > 0) {
      const result = await Report.updateMany(
        { 'reportedUser.accountId': targetUser._id.toString() },
        { 
          $set: {
            'reportedUser.username': '[Deleted User]',
            'reportedUser.accountId': null
          }
        }
      );
      deletionStats.reportsAgainstAnonymized = result.modifiedCount;
    }

    // 9. Create moderation log BEFORE deleting user
    await ModerationLog.create({
      targetUser: {
        accountId: deletedUserInfo.accountId,
        username: deletedUserInfo.username
      },
      moderator: {
        accountId: moderator._id.toString(),
        username: moderator.username
      },
      actionType: 'user_deleted',
      reason: reason,
      notes: JSON.stringify({
        deletedUserInfo,
        deletionStats,
        deletedAt: new Date().toISOString()
      })
    });

    // 10. Delete NameChangeRequests
    await NameChangeRequest.deleteMany({ 'user.accountId': targetUser._id.toString() });

    // 11. Finally, delete the user account
    const userResult = await User.deleteOne({ _id: targetUser._id });
    deletionStats.userAccountDeleted = userResult.deletedCount;

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

