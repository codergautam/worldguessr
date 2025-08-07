// pages/api/setName.js
import User from "../models/User.js";
import { Webhook } from "discord-webhook-node";
import { USERNAME_CHANGE_COOLDOWN } from "./publicAccount.js";
import Map from "../models/Map.js";
import cachegoose from "recachegoose";
import { Filter } from "bad-words";
import UserStatsService from "../components/utils/userStatsService.js";
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
  const lowerUsername = username.toLowerCase();

  // quey check for username (case-insensitive)
  const existing = await User.findOne({
    username: { $regex: new RegExp(`^${lowerUsername}$`, "i") },
  });
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
    user.username = username;
    await user.save();

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
