import { createUUID } from "../components/createUUID.js";
import User from "../models/User.js";
import { Webhook } from "discord-webhook-node";
import { OAuth2Client } from "google-auth-library";
import timezoneToCountry from "../serverUtils/timezoneToCountry.js";
import cachegoose from 'recachegoose';
import { getLeague } from '../components/utils/leagues.js';

const USERNAME_CHANGE_COOLDOWN = 30 * 24 * 60 * 60 * 1000; // 30 days

const client = new OAuth2Client(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, 'postmessage');

/**
 * Check and handle temp ban expiration
 * Also handles migration of legacy banned users (banned: true but no banType)
 * Returns the user with updated ban status if expired
 */
async function checkTempBanExpiration(user) {
  const userObj = user.toObject ? user.toObject() : user;
  
  // Handle legacy banned users - if banned is true but banType is missing/none,
  // treat as permanent ban (migration from old system)
  if (userObj.banned && (!userObj.banType || userObj.banType === 'none')) {
    // Migrate to new system - mark as permanent ban
    await User.findByIdAndUpdate(user._id, {
      banType: 'permanent'
    });
    return {
      ...userObj,
      banType: 'permanent'
    };
  }
  
  // Check if temp ban has expired
  if (userObj.banned && userObj.banType === 'temporary' && userObj.banExpiresAt) {
    const now = new Date();
    if (now >= new Date(userObj.banExpiresAt)) {
      // Temp ban has expired - auto unban
      await User.findByIdAndUpdate(user._id, {
        banned: false,
        banType: 'none',
        banExpiresAt: null
      });
      // Return updated status
      return {
        ...userObj,
        banned: false,
        banType: 'none',
        banExpiresAt: null
      };
    }
  }
  
  return userObj;
}

/**
 * Get extended user data (publicAccount + eloRank data) for combined response
 * This eliminates the need for separate publicAccount and eloRank API calls
 */
async function getExtendedUserData(user, timings) {
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
  let output = {};
  // only accept post
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { code, secret } = req.body;
  if (!code) {
    // Prevent NoSQL injection - secret must be a string
    if(!secret || typeof secret !== 'string') {
      return res.status(400).json({ error: 'Invalid' });
    }

    timings.authType = 'secret';
    const startUserLookup = Date.now();
    const userDb = await User.findOne({
      secret,
    }).select("_id secret username email staff canMakeClues supporter banned banType banExpiresAt banPublicNote pendingNameChange pendingNameChangePublicNote timeZone countryCode totalXp created_at totalGamesPlayed lastLogin lastNameChange elo duels_wins duels_losses duels_tied").cache(120, `userAuth_${secret}`);
    timings.userLookup = Date.now() - startUserLookup;
    
    if (userDb) {
      // Check if temp ban has expired
      const startBanCheck = Date.now();
      const checkedUser = await checkTempBanExpiration(userDb);
      timings.banCheck = Date.now() - startBanCheck;

      // Auto-assign country code from timezone if not set (lazy migration)
      // Use == null to catch both null and undefined (for users without the field)
      if (checkedUser.countryCode == null && checkedUser.timeZone) {
        const startCountryMigration = Date.now();
        const countryCode = timezoneToCountry(checkedUser.timeZone);
        if (countryCode) {
          await User.findByIdAndUpdate(checkedUser._id, { countryCode });
          checkedUser.countryCode = countryCode;

          // Clear auth cache to ensure fresh data on next request
          cachegoose.clearCache(`userAuth_${secret}`, (error) => {
            if (error) {
              console.error('Error clearing auth cache after country code update:', error);
            }
          });
        }
        timings.countryMigration = Date.now() - startCountryMigration;
      }

      // Get extended user data (publicAccount + eloRank)
      const extendedData = await getExtendedUserData(checkedUser, timings);

      output = {
        secret: checkedUser.secret,
        username: checkedUser.username,
        email: checkedUser.email,
        staff: checkedUser.staff,
        canMakeClues: checkedUser.canMakeClues,
        supporter: checkedUser.supporter,
        accountId: checkedUser._id,
        countryCode: checkedUser.countryCode || null,
        // Ban info (public note only - internal reason never exposed)
        banned: checkedUser.banned,
        banType: checkedUser.banType || 'none',
        banExpiresAt: checkedUser.banExpiresAt,
        banPublicNote: checkedUser.banPublicNote || null,
        // Pending name change (public note only - internal reason never exposed)
        pendingNameChange: checkedUser.pendingNameChange,
        pendingNameChangePublicNote: checkedUser.pendingNameChangePublicNote || null,
        // Extended data (publicAccount + eloRank combined)
        ...extendedData
      };

      if(!checkedUser.username || checkedUser.username.length < 1) {
        // try again without cache, to prevent new users getting stuck with no username
        timings.retryWithoutCache = true;
        const startRetry = Date.now();
        const userDb2 = await User.findOne({
          secret,
        }).select("_id secret username email staff canMakeClues supporter banned banType banExpiresAt banPublicNote pendingNameChange pendingNameChangePublicNote timeZone countryCode totalXp created_at totalGamesPlayed lastLogin lastNameChange elo duels_wins duels_losses duels_tied");
        timings.retryLookup = Date.now() - startRetry;

        if(userDb2) {
          const checkedUser2 = await checkTempBanExpiration(userDb2);

          // Auto-assign country code from timezone if not set (lazy migration)
          // Use == null to catch both null and undefined (for users without the field)
          if (checkedUser2.countryCode == null && checkedUser2.timeZone) {
            const countryCode = timezoneToCountry(checkedUser2.timeZone);
            if (countryCode) {
              await User.findByIdAndUpdate(checkedUser2._id, { countryCode });
              checkedUser2.countryCode = countryCode;

              // Clear auth cache to ensure fresh data on next request
              cachegoose.clearCache(`userAuth_${secret}`, (error) => {
                if (error) {
                  console.error('Error clearing auth cache after country code update:', error);
                }
              });
            }
          }

          // Get extended user data (publicAccount + eloRank)
          const extendedData2 = await getExtendedUserData(checkedUser2, timings);

          output = {
            secret: checkedUser2.secret,
            username: checkedUser2.username,
            email: checkedUser2.email,
            staff: checkedUser2.staff,
            canMakeClues: checkedUser2.canMakeClues,
            supporter: checkedUser2.supporter,
            accountId: checkedUser2._id,
            countryCode: checkedUser2.countryCode || null,
            banned: checkedUser2.banned,
            banType: checkedUser2.banType || 'none',
            banExpiresAt: checkedUser2.banExpiresAt,
            banPublicNote: checkedUser2.banPublicNote || null,
            pendingNameChange: checkedUser2.pendingNameChange,
            pendingNameChangePublicNote: checkedUser2.pendingNameChangePublicNote || null,
            // Extended data (publicAccount + eloRank combined)
            ...extendedData2
          };
        }
      }

      timings.total = Date.now() - startTotal;
      console.log('[googleAuth] Timings (ms):', JSON.stringify(timings));
      return res.status(200).json(output);
    } else {
      timings.total = Date.now() - startTotal;
      console.log('[googleAuth] Timings (ms):', JSON.stringify(timings));
      return res.status(400).json({ error: 'Invalid' });
    }

  } else {
    // first login
    timings.authType = 'google_oauth';
    try {
      // verify the access token
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

      const startTokenExchange = Date.now();
      const { tokens } = await client.getToken(code);
      client.setCredentials(tokens);
      timings.tokenExchange = Date.now() - startTokenExchange;

      const startTokenVerify = Date.now();
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: clientId,
      });
      timings.tokenVerify = Date.now() - startTokenVerify;

      if(!ticket) {
        timings.total = Date.now() - startTotal;
        console.log('[googleAuth] Timings (ms):', JSON.stringify(timings));
        return res.status(400).json({ error: 'Invalid token verification' });
      }

      const email = ticket.getPayload()?.email;

      if (!email) {
        timings.total = Date.now() - startTotal;
        console.log('[googleAuth] Timings (ms):', JSON.stringify(timings));
        return res.status(400).json({ error: 'No email in token' });
      }

      const startEmailLookup = Date.now();
      const existingUser = await User.findOne({ email });
      timings.emailLookup = Date.now() - startEmailLookup;
      let secret = null;
      if (!existingUser) {
        timings.isNewUser = true;
        const startNewUser = Date.now();
        // Note: countryCode is left as null (schema default) for new users.
        // We don't auto-assign based on timeZone here because timeZone defaults to
        // 'America/Los_Angeles', which would incorrectly assign all new users to 'US'.
        // Users can manually set their country flag later in their profile.
        secret = createUUID();
        const newUser = new User({ email, secret });

        await newUser.save();
        timings.newUserCreate = Date.now() - startNewUser;

        // Default extended data for new users
        // Rank = count of users with elo > 1000 (starting elo) + 1
        const startRank = Date.now();
        const usersAbove = await User.countDocuments({ elo: { $gt: 1000 }, banned: false }).cache(2000);
        timings.rankQuery = Date.now() - startRank;

        output = {
          secret: secret,
          username: undefined,
          email: email,
          staff: false,
          canMakeClues: false,
          supporter: false,
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
        };
      } else {
        timings.isNewUser = false;
        // Check if temp ban has expired for existing user
        const startBanCheck = Date.now();
        const checkedUser = await checkTempBanExpiration(existingUser);
        timings.banCheck = Date.now() - startBanCheck;

        // Auto-assign country code from timezone if not set (lazy migration)
        // Use == null to catch both null and undefined (for users without the field)
        if (checkedUser.countryCode == null && checkedUser.timeZone) {
          const countryCode = timezoneToCountry(checkedUser.timeZone);
          if (countryCode) {
            await User.findByIdAndUpdate(checkedUser._id, { countryCode });
            checkedUser.countryCode = countryCode;
          }
        }

        // Get extended user data (publicAccount + eloRank)
        const extendedData = await getExtendedUserData(checkedUser, timings);

        output = {
          secret: checkedUser.secret,
          username: checkedUser.username,
          email: checkedUser.email,
          staff: checkedUser.staff,
          canMakeClues: checkedUser.canMakeClues,
          supporter: checkedUser.supporter,
          accountId: checkedUser._id,
          countryCode: checkedUser.countryCode || null,
          banned: checkedUser.banned,
          banType: checkedUser.banType || 'none',
          banExpiresAt: checkedUser.banExpiresAt,
          banPublicNote: checkedUser.banPublicNote || null,
          pendingNameChange: checkedUser.pendingNameChange,
          pendingNameChangePublicNote: checkedUser.pendingNameChangePublicNote || null,
          // Extended data (publicAccount + eloRank combined)
          ...extendedData
        };
      }

      timings.total = Date.now() - startTotal;
      console.log('[googleAuth] Timings (ms):', JSON.stringify(timings));
      return res.status(200).json(output);
    } catch (error) {
      timings.total = Date.now() - startTotal;
      timings.error = error.message;
      console.log('[googleAuth] Timings (ms):', JSON.stringify(timings));
      console.error('Google OAuth error:', error.message);
      return res.status(400).json({ error: 'Authentication failed' });
    }
  }

}
