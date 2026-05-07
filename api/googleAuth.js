import { createUUID } from "../components/createUUID.js";
import User from "../models/User.js";
import { Webhook } from "discord-webhook-node";
import { OAuth2Client } from "google-auth-library";
import { createRemoteJWKSet, jwtVerify } from "jose";
import timezoneToCountry from "../serverUtils/timezoneToCountry.js";
import { syncedClearCache } from '../serverUtils/cacheBus.js';
import { getLeague } from '../components/utils/leagues.js';

const USERNAME_CHANGE_COOLDOWN = 30 * 24 * 60 * 60 * 1000; // 30 days
const USER_AUTH_SELECT = "_id secret username email googleSub appleSub staff canMakeClues supporter banned banType banExpiresAt banPublicNote pendingNameChange pendingNameChangePublicNote timeZone countryCode totalXp created_at totalGamesPlayed lastLogin lastNameChange elo duels_wins duels_losses duels_tied";
const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS = createRemoteJWKSet(new URL(`${APPLE_ISSUER}/auth/keys`));
const DEFAULT_APPLE_BUNDLE_ID = 'com.codergautamyt.worldguessr';

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

function getAppleAudiences() {
  return [
    process.env.APPLE_CLIENT_ID,
    process.env.APPLE_BUNDLE_ID,
    process.env.NEXT_PUBLIC_APPLE_CLIENT_ID,
    process.env.NEXT_PUBLIC_APPLE_BUNDLE_ID,
    DEFAULT_APPLE_BUNDLE_ID,
    ...(process.env.APPLE_CLIENT_IDS || '').split(','),
  ]
    .map((value) => value?.trim())
    .filter(Boolean);
}

function getAllowedGoogleClientIds() {
  return [
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    process.env.NEXT_PUBLIC_GOOGLE_NATIVE_CLIENT_ID,
    process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    process.env.NEXT_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    process.env.GOOGLE_NATIVE_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
    ...(process.env.GOOGLE_NATIVE_CLIENT_IDS || '').split(','),
  ]
    .map((value) => value?.trim())
    .filter(Boolean);
}

async function buildAuthResponseForUser(user, timings, cacheSecret = null) {
  const checkedUser = await checkTempBanExpiration(user);

  if (checkedUser.countryCode == null && checkedUser.timeZone) {
    const countryCode = timezoneToCountry(checkedUser.timeZone);
    if (countryCode) {
      await User.findByIdAndUpdate(checkedUser._id, { countryCode });
      checkedUser.countryCode = countryCode;
      if (cacheSecret) syncedClearCache(`userAuth_${cacheSecret}`);
    }
  }

  if (checkedUser._id) {
    await User.findByIdAndUpdate(checkedUser._id, { lastLogin: new Date() });
  }

  const extendedData = await getExtendedUserData(checkedUser, timings);

  return {
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
    ...extendedData
  };
}

async function findOrCreateUserForIdentity({ provider, email, providerSub, timings }) {
  const normalizedEmail = typeof email === 'string' ? email.toLowerCase().trim() : null;
  const providerField = provider === 'apple' ? 'appleSub' : 'googleSub';
  let user = null;

  if (providerSub) {
    const startProviderLookup = Date.now();
    user = await User.findOne({ [providerField]: providerSub }).select(USER_AUTH_SELECT);
    timings.providerLookup = Date.now() - startProviderLookup;
  }

  if (!user && normalizedEmail) {
    const startEmailLookup = Date.now();
    user = await User.findOne({ email: normalizedEmail }).select(USER_AUTH_SELECT);
    timings.emailLookup = Date.now() - startEmailLookup;
  }

  if (!user) {
    if (!normalizedEmail) {
      throw new Error(`${provider} did not return an email for this account`);
    }

    timings.isNewUser = true;
    const secret = createUUID();
    const newUser = new User({
      email: normalizedEmail,
      secret,
      ...(providerSub ? { [providerField]: providerSub } : {}),
    });

    await newUser.save();
    user = newUser;
  } else {
    timings.isNewUser = false;
    const updates = {};
    if (providerSub && !user[providerField]) updates[providerField] = providerSub;
    if (normalizedEmail && !user.email) updates.email = normalizedEmail;

    if (Object.keys(updates).length > 0) {
      await User.findByIdAndUpdate(user._id, updates);
      Object.assign(user, updates);
      syncedClearCache(`userAuth_${user.secret}`);
    }
  }

  return buildAuthResponseForUser(user, timings, user.secret);
}

async function verifyAppleIdentityToken(identityToken, expectedNonce) {
  const audiences = getAppleAudiences();
  if (audiences.length === 0) {
    throw new Error('Apple Sign In audience is not configured');
  }

  const { payload } = await jwtVerify(identityToken, APPLE_JWKS, {
    issuer: APPLE_ISSUER,
    audience: audiences,
  });

  if (expectedNonce && payload.nonce && payload.nonce !== expectedNonce) {
    throw new Error('Apple nonce mismatch');
  }

  if (!payload.sub) {
    throw new Error('Apple token missing subject');
  }

  return payload;
}

export default async function handler(req, res) {
  const timings = {};
  const startTotal = Date.now();
  let output = {};
  // only accept post
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const {
    code,
    secret,
    redirect_uri,
    provider = 'google',
    code_verifier,
    client_id,
    identity_token,
    nonce,
    email: providedEmail,
  } = req.body || {};

  if (!code && !identity_token) {
    // Prevent NoSQL injection - secret must be a string
    if(!secret || typeof secret !== 'string') {
      return res.status(400).json({ error: 'Invalid' });
    }

    timings.authType = 'secret';
    const startUserLookup = Date.now();
    const userDb = await User.findOne({
      secret,
    }).select(USER_AUTH_SELECT).cache(120, `userAuth_${secret}`);
    timings.userLookup = Date.now() - startUserLookup;
    
    if (userDb) {
      output = await buildAuthResponseForUser(userDb, timings, secret);

      if(!output.username || output.username.length < 1) {
        // try again without cache, to prevent new users getting stuck with no username
        timings.retryWithoutCache = true;
        const startRetry = Date.now();
        const userDb2 = await User.findOne({
          secret,
        }).select(USER_AUTH_SELECT);
        timings.retryLookup = Date.now() - startRetry;

        if(userDb2) {
          output = await buildAuthResponseForUser(userDb2, timings, secret);
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
    timings.authType = `${provider}_oauth`;
    try {
      if (provider === 'apple') {
        if (!identity_token || typeof identity_token !== 'string') {
          return res.status(400).json({ error: 'Missing Apple identity token' });
        }

        const startTokenVerify = Date.now();
        const applePayload = await verifyAppleIdentityToken(identity_token, nonce);
        timings.tokenVerify = Date.now() - startTokenVerify;

        output = await findOrCreateUserForIdentity({
          provider: 'apple',
          email: providedEmail || applePayload.email,
          providerSub: applePayload.sub,
          timings,
        });
      } else {
        const googleClientId = client_id || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
        const allowedGoogleClientIds = getAllowedGoogleClientIds();
        if (!googleClientId || !allowedGoogleClientIds.includes(googleClientId)) {
          return res.status(400).json({ error: 'Google client is not configured' });
        }

        const startTokenExchange = Date.now();
        const tokenClient = client_id
          ? new OAuth2Client({
              clientId: googleClientId,
              redirectUri: redirect_uri,
              clientAuthentication: 'None',
            })
          : new OAuth2Client(
              googleClientId,
              process.env.GOOGLE_CLIENT_SECRET,
              redirect_uri || 'postmessage'
            );
        const { tokens } = await tokenClient.getToken({
          code,
          redirect_uri: redirect_uri || 'postmessage',
          codeVerifier: code_verifier,
          client_id: googleClientId,
        });
        tokenClient.setCredentials(tokens);
        timings.tokenExchange = Date.now() - startTokenExchange;

        const startTokenVerify = Date.now();
        const ticket = await tokenClient.verifyIdToken({
          idToken: tokens.id_token,
          audience: googleClientId,
        });
        timings.tokenVerify = Date.now() - startTokenVerify;

        if(!ticket) {
          timings.total = Date.now() - startTotal;
          console.log('[googleAuth] Timings (ms):', JSON.stringify(timings));
          return res.status(400).json({ error: 'Invalid token verification' });
        }

        const payload = ticket.getPayload();
        if (!payload?.email) {
          timings.total = Date.now() - startTotal;
          console.log('[googleAuth] Timings (ms):', JSON.stringify(timings));
          return res.status(400).json({ error: 'No email in token' });
        }

        output = await findOrCreateUserForIdentity({
          provider: 'google',
          email: payload.email,
          providerSub: payload.sub,
          timings,
        });
      }

      timings.total = Date.now() - startTotal;
      console.log('[googleAuth] Timings (ms):', JSON.stringify(timings));
      return res.status(200).json(output);
    } catch (error) {
      timings.total = Date.now() - startTotal;
      timings.error = error.message;
      console.log('[googleAuth] Timings (ms):', JSON.stringify(timings));
      console.error(`${provider} OAuth error:`, error.message);
      return res.status(400).json({ error: 'Authentication failed' });
    }
  }

}
