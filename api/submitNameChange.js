import User, { USERNAME_COLLATION } from '../models/User.js';
import NameChangeRequest from '../models/NameChangeRequest.js';

/**
 * Submit Name Change API
 *
 * For users who have been forced to change their name.
 * Submits a new username for moderator review.
 */

// TODO: FUNCTIONALTIY MERGED TO setName.js, SHOULD BE DEPRECATED SOON AFTER UPDATING CLIENT.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { secret, newUsername } = req.body;

  // Validate required fields
  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid secret' });
  }

  if (!newUsername || typeof newUsername !== 'string') {
    return res.status(400).json({ message: 'New username is required' });
  }

  // Validate username format
  const trimmedUsername = newUsername.trim();

  if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
    return res.status(400).json({ message: 'Username must be between 3 and 30 characters' });
  }

  // Only allow alphanumeric, underscores
  if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
    return res
      .status(400)
      .json({
        message: "Username must contain only letters, numbers, and underscores",
      });
  }
  try {
    // Get the user
    const user = await User.findOne({ secret });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user is banned (permanent or active temp ban)
    if (user.banned) {
      const isActiveBan = user.banType === 'permanent' ||
        (user.banType === 'temporary' && user.banExpiresAt && new Date(user.banExpiresAt) > new Date());
      if (isActiveBan) {
        return res.status(403).json({ message: 'Banned users cannot change their username' });
      }
    }

    // Check if user actually needs to change their name
    if (!user.pendingNameChange) {
      return res.status(400).json({ message: 'You do not have a pending name change' });
    }

    // Check if username is already taken (case-insensitive with collation index)
    const existingUser = await User.findOne({
      username: trimmedUsername,
      _id: { $ne: user._id }
    }).collation(USERNAME_COLLATION);

    if (existingUser) {
      return res.status(400).json({ message: 'This username is already taken' });
    }

    // Check if user already has a pending request
    const existingRequest = await NameChangeRequest.findOne({
      'user.accountId': user._id.toString(),
      status: 'pending'
    });

    if (existingRequest) {
      // Update the existing request with the new name
      await NameChangeRequest.findByIdAndUpdate(existingRequest._id, {
        requestedUsername: trimmedUsername,
        updatedAt: new Date()
      });

      return res.status(200).json({
        success: true,
        message: 'Your name change request has been updated. Please wait for moderator review.',
        requestId: existingRequest._id
      });
    }

    // Create new name change request
    const nameRequest = await NameChangeRequest.create({
      user: {
        accountId: user._id.toString(),
        currentUsername: user.username
      },
      requestedUsername: trimmedUsername,
      reason: user.pendingNameChangeReason || 'Forced name change',
      status: 'pending'
    });

    return res.status(200).json({
      success: true,
      message: 'Your name change request has been submitted. Please wait for moderator review.',
      requestId: nameRequest._id
    });

  } catch (error) {
    console.error('Submit name change error:', error);
    return res.status(500).json({
      message: 'An error occurred while submitting name change',
      error: error.message
    });
  }
}

