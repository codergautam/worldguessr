import jwt from "jsonwebtoken";
const { verify } = jwt;
import axios from "axios";
import { createUUID } from "../components/createUUID.js";
import User, { USERNAME_COLLATION } from "../models/User.js";
import timezoneToCountry from "../serverUtils/timezoneToCountry.js";
import cachegoose from 'recachegoose';
import { getLeague } from '../components/utils/leagues.js';

const USERNAME_CHANGE_COOLDOWN = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Get extended user data (publicAccount + eloRank data) for combined response
 */
async function getExtendedUserData(user, timings = {}) {
  const startExtended = Date.now();

  // publicAccount data
  const lastNameChange = user.lastNameChange ? new Date(user.lastNameChange).getTime() : 0;
  const publicData = {
    totalXp: user.totalXp || 0,
    createdAt: user.created_at,
    gamesLen: user.totalGamesPlayed || 0,
    lastLogin: user.lastLogin || user.created_at,
    canChangeUsername: !user.lastNameChange || Date.now() - lastNameChange > USERNAME_CHANGE_COOLDOWN,
    daysUntilNameChange: lastNameChange ? Math.max(0, Math.ceil((lastNameChange + USERNAME_CHANGE_COOLDOWN - Date.now()) / (24 * 60 * 60 * 1000))) : 0,
    recentChange: user.lastNameChange ? Date.now() - lastNameChange < 24 * 60 * 60 * 1000 : false,
  };

  // eloRank data
  const startRank = Date.now();
  const rank = (await User.countDocuments({
    elo: { $gt: user.elo || 1000 },
    banned: false
  }).cache(2000)) + 1;
  timings.rankQuery = Date.now() - startRank;

  const eloData = {
    elo: user.elo || 1000,
    rank,
    league: getLeague(user.elo || 1000),
    duels_wins: user.duels_wins || 0,
    duels_losses: user.duels_losses || 0,
    duels_tied: user.duels_tied || 0,
    win_rate: (user.duels_wins || 0) / ((user.duels_wins || 0) + (user.duels_losses || 0) + (user.duels_tied || 0)) || 0
  };

  timings.extendedData = Date.now() - startExtended;

  return { ...publicData, ...eloData };
}

export default async function handler(req, res) {
  const timings = {};
  const startTotal = Date.now();
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
  timings.authType = 'existing_user_check';
  const startUserLookup = Date.now();
  const user = await User.findOne({ crazyGamesId: userId }).cache(120, `crazyAuth_${userId}`);
  timings.userLookup = Date.now() - startUserLookup;

  if (user) {
    // Auto-assign country code from timezone if not set (lazy migration)
    // Use == null to catch both null and undefined (for users without the field)
    if (user.countryCode == null && user.timeZone) {
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

    // Get extended user data (publicAccount + eloRank)
    const extendedData = await getExtendedUserData(user, timings);

    timings.total = Date.now() - startTotal;
    console.log('[crazyAuth] Timings (ms):', JSON.stringify(timings));

    return res.status(200).json({
      secret: user.secret,
      username: user.username,
      email: user.email,
      staff: user.staff,
      canMakeClues: user.canMakeClues,
      supporter: user.supporter,
      accountId: user._id,
      countryCode: user.countryCode || null,
      banned: user.banned || false,
      banType: user.banType || 'none',
      banExpiresAt: user.banExpiresAt || null,
      banPublicNote: user.banPublicNote || null,
      pendingNameChange: user.pendingNameChange || false,
      pendingNameChangePublicNote: user.pendingNameChangePublicNote || null,
      // Extended data (publicAccount + eloRank combined)
      ...extendedData
    });
  }

  // check if username is taken
  let newUsername = username.substring(0, 30).replace(/[^a-zA-Z0-9_]/g, '');
  let finalUsername = newUsername;
  let taken = true;
  let trial = 0;
  while (taken) {
    const existing = await User.findOne({ username: finalUsername }).collation(USERNAME_COLLATION);
    if (!existing) {
      taken = false;
    } else {
      trial++;
      finalUsername = `${newUsername}${trial}`;
    }
  }

  // create new user
  timings.isNewUser = true;
  // Note: countryCode is left as null (schema default) for new users.
  // We don't auto-assign based on timeZone here because timeZone defaults to
  // 'America/Los_Angeles', which would incorrectly assign all new users to 'US'.
  // Users can manually set their country flag later in their profile.
  const secret = createUUID();
  const newUser = new User({ crazyGamesId: userId, username: finalUsername, secret });

  const startSave = Date.now();
  await newUser.save();
  timings.newUserCreate = Date.now() - startSave;

  // Default extended data for new users
  // Rank = count of users with elo > 1000 (starting elo) + 1
  const startRank = Date.now();
  const usersAbove = await User.countDocuments({ elo: { $gt: 1000 }, banned: false }).cache(2000);
  timings.rankQuery = Date.now() - startRank;

  timings.total = Date.now() - startTotal;
  console.log('[crazyAuth] Timings (ms):', JSON.stringify(timings));

  return res.status(200).json({
    secret: newUser.secret,
    username: newUser.username,
    email: newUser.email,
    staff: newUser.staff || false,
    canMakeClues: newUser.canMakeClues || false,
    supporter: newUser.supporter || false,
    accountId: newUser._id,
    countryCode: null,
    banned: false,
    banType: 'none',
    banExpiresAt: null,
    banPublicNote: null,
    pendingNameChange: false,
    pendingNameChangePublicNote: null,
    // Extended data defaults for new users
    totalXp: 0,
    createdAt: newUser.created_at,
    gamesLen: 0,
    lastLogin: newUser.created_at,
    canChangeUsername: true,
    daysUntilNameChange: 0,
    recentChange: false,
    elo: 1000,
    rank: usersAbove + 1,
    league: getLeague(1000),
    duels_wins: 0,
    duels_losses: 0,
    duels_tied: 0,
    win_rate: 0
  });
}
