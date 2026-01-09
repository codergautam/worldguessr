import User, { USERNAME_COLLATION } from '../../models/User.js';
import NameChangeRequest from '../../models/NameChangeRequest.js';
import ModerationLog from '../../models/ModerationLog.js';

/**
 * Review Name Change API
 *
 * Allows moderators to approve or reject pending name change requests
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const {
    secret,
    requestId,      // NameChangeRequest ID
    action,         // 'approve' or 'reject'
    rejectionReason // Required if rejecting
  } = req.body;

  // Validate required fields
  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid secret' });
  }

  if (!requestId) {
    return res.status(400).json({ message: 'Request ID is required' });
  }

  if (!action || !['approve', 'reject'].includes(action)) {
    return res.status(400).json({ message: 'Invalid action - must be "approve" or "reject"' });
  }

  if (action === 'reject' && (!rejectionReason || rejectionReason.trim().length < 3)) {
    return res.status(400).json({ message: 'Rejection reason is required' });
  }

  try {
    // Verify requesting user is staff
    const moderator = await User.findOne({ secret });
    if (!moderator || !moderator.staff) {
      return res.status(403).json({ message: 'Unauthorized - staff access required' });
    }

    // Get the name change request
    const nameRequest = await NameChangeRequest.findById(requestId);
    if (!nameRequest) {
      return res.status(404).json({ message: 'Name change request not found' });
    }

    if (nameRequest.status !== 'pending') {
      return res.status(400).json({ message: 'This request has already been reviewed' });
    }

    // Get the target user
    const targetUser = await User.findById(nameRequest.user.accountId);
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (action === 'approve') {
      // Check if the new username is already taken (case-insensitive with collation index)
      const existingUser = await User.findOne({
        username: nameRequest.requestedUsername,
        _id: { $ne: targetUser._id }
      }).collation(USERNAME_COLLATION);

      if (existingUser) {
        return res.status(400).json({
          message: 'This username is already taken. Reject this request so the user can submit a different name.'
        });
      }

      const oldUsername = targetUser.username;

      // Update the user's username and clear pending status
      await User.findByIdAndUpdate(targetUser._id, {
        username: nameRequest.requestedUsername,
        pendingNameChange: false,
        pendingNameChangeReason: null,
        pendingNameChangePublicNote: null,
        lastNameChange: new Date()
      });

      // Update the request
      await NameChangeRequest.findByIdAndUpdate(requestId, {
        status: 'approved',
        reviewedBy: {
          accountId: moderator._id.toString(),
          username: moderator.username
        },
        reviewedAt: new Date()
      });

      // Create moderation log
      await ModerationLog.create({
        targetUser: {
          accountId: targetUser._id.toString(),
          username: oldUsername
        },
        moderator: {
          accountId: moderator._id.toString(),
          username: moderator.username
        },
        actionType: 'name_change_approved',
        reason: `Name change approved: ${oldUsername} → ${nameRequest.requestedUsername}`,
        nameChange: {
          oldName: oldUsername,
          newName: nameRequest.requestedUsername
        },
        notes: ''
      });

      return res.status(200).json({
        success: true,
        action: 'approved',
        oldUsername: oldUsername,
        newUsername: nameRequest.requestedUsername,
        message: `Username changed from "${oldUsername}" to "${nameRequest.requestedUsername}"`
      });

    } else {
      // Reject the name change
      await NameChangeRequest.findByIdAndUpdate(requestId, {
        status: 'rejected',
        reviewedBy: {
          accountId: moderator._id.toString(),
          username: moderator.username
        },
        reviewedAt: new Date(),
        rejectionReason: rejectionReason,
        $inc: { rejectionCount: 1 }
      });

      // User remains in pending name change state - they must submit a new name
      // pendingNameChange stays true

      // Create moderation log
      await ModerationLog.create({
        targetUser: {
          accountId: targetUser._id.toString(),
          username: targetUser.username
        },
        moderator: {
          accountId: moderator._id.toString(),
          username: moderator.username
        },
        actionType: 'name_change_rejected',
        reason: rejectionReason,
        nameChange: {
          oldName: targetUser.username,
          newName: nameRequest.requestedUsername
        },
        notes: `Rejected name: "${nameRequest.requestedUsername}"`
      });

      return res.status(200).json({
        success: true,
        action: 'rejected',
        rejectedUsername: nameRequest.requestedUsername,
        message: `Name change to "${nameRequest.requestedUsername}" was rejected. User must submit a new name.`
      });
    }

  } catch (error) {
    console.error('Review name change error:', error);
    return res.status(500).json({
      message: 'An error occurred while reviewing name change',
      error: error.message
    });
  }
}

