import jwt from "jsonwebtoken";
const { verify } = jwt;
import axios from "axios";
// import { createUUID } from "@/components/createUUID";
// import User from "@/models/User";
import { createUUID } from "../components/createUUID.js";
import User from "../models/User.js";
import { Webhook } from "discord-webhook-node";
import timezoneToCountry from "../serverUtils/timezoneToCountry.js";
import cachegoose from 'recachegoose';

export default async function handler(req, res) {
  // only accept post
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { token, username } = req.body;
  if (!token || !username) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  // make sure they are strings
  if (typeof token !== 'string' || typeof username !== 'string') {
    return res.status(400).json({ error: 'Invalid input' });
  }

  let decodedToken;
  try {
    const resp = await axios.get("https://sdk.crazygames.com/publicKey.json");
    const publicKey = resp.data["publicKey"];
    decodedToken = verify(token, publicKey, { algorithms: ["RS256"] });
  } catch (error) {
    return res.status(400).json({ error: 'Invalid token' });
  }

  const { userId } = decodedToken;

  // check if userId exists
  const user = await User.findOne({ crazyGamesId: userId }).cache(120, `crazyAuth_${userId}`);
  if (user) {
    // Auto-assign country code from timezone if not set (lazy migration)
    if (user.countryCode === null && user.timeZone) {
      const countryCode = timezoneToCountry(user.timeZone);
      if (countryCode) {
        await User.findByIdAndUpdate(user._id, { countryCode });
        user.countryCode = countryCode;

        // Clear auth cache to ensure fresh data on next request
        cachegoose.clearCache(`crazyAuth_${userId}`, (error) => {
          if (error) {
            console.error('Error clearing auth cache after country code update:', error);
          }
        });
      }
    }

    return res.status(200).json({ secret: user.secret, username: user.username, email: user.email, staff: user.staff, canMakeClues: user.canMakeClues, supporter: user.supporter, accountId: user._id });
  }

  // check if username is taken
  let newUsername = username.substring(0, 30).replace(/[^a-zA-Z0-9_]/g, '');
  let finalUsername = newUsername;
  let taken = true;
  let trial = 0;
  while (taken) {
    const existing = await User.findOne({ username: finalUsername });
    if (!existing) {
      taken = false;
    } else {
      trial++;
      finalUsername = `${newUsername}${trial}`;
    }
  }

  // create new user
  // Note: countryCode is left as null (schema default) for new users.
  // We don't auto-assign based on timeZone here because timeZone defaults to
  // 'America/Los_Angeles', which would incorrectly assign all new users to 'US'.
  // Users can manually set their country flag later in their profile.
  const secret = createUUID();
  const newUser = new User({ crazyGamesId: userId, username: finalUsername, secret });

  await newUser.save();

  // try {
  //   if (process.env.DISCORD_WEBHOOK) {
  //     const hook = new Webhook(process.env.DISCORD_WEBHOOK);
  //     hook.setUsername("WorldGuessr");
  //     hook.send(`🎮 **${finalUsername}** has joined WorldGuessr from CrazyGames!`);
  //   }
  // } catch (error) {
  //   console.error('Error sending discord webhook', error);
  // }

  return res.status(200).json({ secret: newUser.secret, username: newUser.username, email: newUser.email, staff: newUser.staff, canMakeClues: newUser.canMakeClues, supporter: newUser.supporter, accountId: newUser._id });
}
