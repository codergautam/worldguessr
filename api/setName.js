// pages/api/setName.js
import User, { USERNAME_COLLATION } from "../models/User.js";
import { Webhook } from "discord-webhook-node";
import { USERNAME_CHANGE_COOLDOWN } from "./publicAccount.js";
import Map from "../models/Map.js";
import cachegoose from "recachegoose";
import { Filter } from "bad-words";
import UserStatsService from "../components/utils/userStatsService.js";
import ModerationLog from "../models/ModerationLog.js";
import Report from "../models/Report.js";
import NameChangeRequest from "../models/NameChangeRequest.js";
const filter = new Filter();

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  // Extract the token and username from the request body
  const { token, username } = req.body;
  if (typeof token !== "string" || typeof username !== "string") {
    return res.status(400).json({ message: "Invalid input" });
  }
  if (!token || !username) {
    return res.status(400).json({ message: "Missing token or username" });
  }

  // Ensure username meets criteria
  if (username.length < 3 || username.length > 30) {
    return res
      .status(400)
      .json({ message: "Username must be between 3 and 30 characters" });
  }
  // Alphanumeric characters and underscores only
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res
      .status(400)
      .json({
        message: "Username must contain only letters, numbers, and underscores",
      });
  }
  // make sure username is not profane
  if (filter.isProfane(username)) {
    return res.status(400).json({ message: "Inappropriate content" });
  }
  // Make sure the username is unique (case-insensitive)
  // Uses collation index for fast O(log n) lookup instead of slow regex scan
  const existing = await User.findOne({ username })
    .collation(USERNAME_COLLATION);
  if (existing) {
    return res
      .status(400)
      .json({ message: "Username already taken, please select a new one" });
  }

  try {
    // Find user by the provided token
    const user = await User.findOne({ secret: token });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user is banned (permanent or active temp ban)
    if (user.banned) {
      const isActiveBan = user.banType === 'permanent' ||
        (user.banType === 'temporary' && user.banExpiresAt && new Date(user.banExpiresAt) > new Date());
      if (isActiveBan) {
        return res.status(403).json({ message: "Banned users cannot change their username" });
      }
    }

    // If user has a forced name change, submit for moderator review instead of direct change
    if (user.pendingNameChange) {
      // Check if user already has a pending request
      const existingRequest = await NameChangeRequest.findOne({
        'user.accountId': user._id.toString(),
        status: 'pending'
      });

      if (existingRequest) {
        // Update the existing request with the new name
        await NameChangeRequest.findByIdAndUpdate(existingRequest._id, {
          requestedUsername: username,
          updatedAt: new Date()
        });

        return res.status(200).json({
          success: true,
          pendingReview: true,
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
        requestedUsername: username,
        reason: user.pendingNameChangeReason || 'Forced name change',
        status: 'pending'
      });

      return res.status(200).json({
        success: true,
        pendingReview: true,
        message: 'Your name change request has been submitted. Please wait for moderator review.',
        requestId: nameRequest._id
      });
    }

    if (user.username) {
      // this means this is a name change, not a first time name set
      // check if the user has waited long enough since the last name change
      if (
        user.lastNameChange &&
        Date.now() - user.lastNameChange < USERNAME_CHANGE_COOLDOWN
      ) {
        return res
          .status(400)
          .json({ message: "You must wait 30 days between name changes" });
      }
      user.lastNameChange = Date.now();

      // update users map with new username
      const userMaps = await Map.find({ created_by: user._id });
      for (const map of userMaps) {
        map.map_creator_name = username;
        await map.save();
      }

      // recachegoose clear key publicData_${id}
      cachegoose.clearCache(`publicData_${user._id.toString()}`, (error) => {
        if (error) {
          console.error("Error clearing cache", error);
        }
      });
    }

    // Update the user's username
    const isFirstTimeSettingUsername = !user.username;
    const oldUsername = user.username; // Store old name before changing
    user.username = username;
    await user.save();

    // Log name change to ModerationLog for audit trail (only for name changes, not first time)
    if (!isFirstTimeSettingUsername && oldUsername) {
      try {
        await ModerationLog.create({
          targetUser: {
            accountId: user._id.toString(),
            username: username // New username
          },
          moderator: {
            accountId: user._id.toString(), // Self-initiated
            username: username
          },
          actionType: 'name_change_manual',
          reason: 'User-initiated name change',
          nameChange: {
            oldName: oldUsername,
            newName: username
          },
          notes: 'Voluntary name change (no approval required)'
        });
      } catch (logError) {
        // Don't fail the name change if logging fails
        console.error('Error logging name change to ModerationLog:', logError);
      }

      // Update pending reports against this user to use the new username
      try {
        await Report.updateMany(
          {
            'reportedUser.accountId': user._id.toString(),
            status: 'pending'
          },
          {
            'reportedUser.username': username
          }
        );
      } catch (reportError) {
        // Don't fail the name change if report update fails
        console.error('Error updating pending reports with new username:', reportError);
      }
    }

    // Create initial UserStats entry for new users
    if (isFirstTimeSettingUsername) {
      try {
        await UserStatsService.recordGameStats(user._id, null, { triggerEvent: 'account_created' });
      } catch (error) {
        console.error('Error creating initial user stats:', error);
      }
    }

    // try {
    //   if(process.env.DISCORD_WEBHOOK) {
    //     const hook = new Webhook(process.env.DISCORD_WEBHOOK);
    //     hook.setUsername("WorldGuessr");
    //     hook.send(`🎉 **${username}** has joined WorldGuessr!`);
    //   }
    // } catch (error) {
    //   console.error('Discord webhook failed', error);
    // }

    res.status(200).json({ success: true });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error", error: error.message, success: false });
  }
}
