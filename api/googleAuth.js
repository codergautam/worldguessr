import { createUUID } from "../components/createUUID.js";
import User from "../models/User.js";
import { Webhook } from "discord-webhook-node";
import { OAuth2Client } from "google-auth-library";
import { createPublicKey, createVerify } from "crypto";
import timezoneToCountry, { VALID_COUNTRY_CODES } from "../serverUtils/timezoneToCountry.js";
import { syncedClearCache } from '../serverUtils/cacheBus.js';
import { getLeague } from '../components/utils/leagues.js';
import { findBannedIdentity, bannedIdentityMessage } from '../serverUtils/bannedIdentities.js';

const USERNAME_CHANGE_COOLDOWN = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Refuse account creation for an identity that was permanently banned, or deleted
 * while perm-banned (see BannedIdentity). Returns true if it sent a 403 response
 * (caller must stop). Only ever called on the NEW-account path, so a legitimate
 * returning user is never affected.
 */
async function blockIfBannedIdentity(res, { email, appleId }, timings, startTotal) {
  const blocked = await findBannedIdentity({ email, appleId });
  if (!blocked) return false;
  timings.total = Date.now() - startTotal;
  timings.blockedReSignup = blocked.type;
  console.log('[googleAuth] blocked banned identity re-signup:', JSON.stringify(timings));
  res.status(403).json({
    error: bannedIdentityMessage(blocked),
    banned: true,
    banType: 'permanent',
  });
  return true;
}
const DEFAULT_APPLE_AUDIENCE = 'com.codergautamyt.worldguessr';
let appleKeysCache = { fetchedAt: 0, keys: [] };

function decodeJwtPayload(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function decodeJwtPart(part) {
  const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
}

async function getApplePublicKeys() {
  if (Date.now() - appleKeysCache.fetchedAt < 60 * 60 * 1000 && appleKeysCache.keys.length) {
    return appleKeysCache.keys;
  }
  const response = await fetch('https://appleid.apple.com/auth/keys');
  if (!response.ok) throw new Error('Failed to fetch Apple public keys');
  const data = await response.json();
  appleKeysCache = { fetchedAt: Date.now(), keys: data.keys || [] };
  return appleKeysCache.keys;
}

async function verifyAppleIdentityToken(identityToken) {
  const [encodedHeader, encodedPayload, encodedSignature] = identityToken.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error('Malformed Apple identity token');
  }

  const header = decodeJwtPart(encodedHeader);
  const payload = decodeJwtPart(encodedPayload);
  if (header.alg !== 'RS256') throw new Error('Unsupported Apple token algorithm');
  if (payload.iss !== 'https://appleid.apple.com') throw new Error('Invalid Apple token issuer');
  if (!payload.exp || payload.exp * 1000 <= Date.now()) throw new Error('Expired Apple token');

  const allowedAudiences = [
    process.env.APPLE_CLIENT_ID,
    process.env.EXPO_PUBLIC_APPLE_CLIENT_ID,
    process.env.IOS_BUNDLE_ID,
    DEFAULT_APPLE_AUDIENCE,
  ].filter(Boolean);
  if (!allowedAudiences.includes(payload.aud)) {
    throw new Error(`Invalid Apple token audience: ${payload.aud}`);
  }

  const keys = await getApplePublicKeys();
  const jwk = keys.find((key) => key.kid === header.kid && key.alg === 'RS256');
  if (!jwk) throw new Error('Apple public key not found');

  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();
  const signature = Buffer.from(encodedSignature.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
  if (!verifier.verify(publicKey, signature)) throw new Error('Invalid Apple token signature');

  return payload;
}

function buildAuthResponse(user, extendedData = {}) {
  return {
    secret: user.secret,
    username: user.username,
    email: user.email,
    staff: user.staff,
    canMakeClues: user.canMakeClues,
    supporter: user.supporter,
    accountId: user._id,
    countryCode: user.countryCode || null,
    banned: user.banned,
    banType: user.banType || 'none',
    banExpiresAt: user.banExpiresAt,
    banPublicNote: user.banPublicNote || null,
    pendingNameChange: user.pendingNameChange,
    pendingNameChangePublicNote: user.pendingNameChangePublicNote || null,
    pendingDeletion: !!user.scheduledDeletionAt,
    scheduledDeletionAt: user.scheduledDeletionAt || null,
    ...extendedData,
  };
}

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

  const { code, secret, redirect_uri, id_token, apple_identity_token, tz } = req.body;

  // Derive a country flag from a real client-provided IANA timezone (mobile sends
  // the device tz on signup). We deliberately do NOT trust the User schema's
  // default tz ('America/Los_Angeles') for this — only an explicit, valid tz from
  // the request, so brand-new users get the correct flag instantly instead of
  // waiting for a later websocket-driven migration.
  const signupCountryCode = (() => {
    if (!tz || typeof tz !== 'string') return null;
    const cc = timezoneToCountry(tz);
    return cc && VALID_COUNTRY_CODES.includes(cc) ? cc : null;
  })();

  if (apple_identity_token && !code && !secret && !id_token) {
    timings.authType = 'apple_id_token';
    try {
      const startTokenVerify = Date.now();
      const applePayload = await verifyAppleIdentityToken(apple_identity_token);
      timings.tokenVerify = Date.now() - startTokenVerify;
      timings.tokenAud = applePayload.aud;

      const appleId = applePayload.sub;
      const email = applePayload.email;
      if (!appleId) {
        timings.total = Date.now() - startTotal;
        console.log('[googleAuth] Timings (ms):', JSON.stringify(timings));
        return res.status(400).json({ error: 'No Apple user id in token' });
      }

      const startLookup = Date.now();
      let existingUser = await User.findOne({ appleId });
      if (!existingUser && email) {
        existingUser = await User.findOne({ email });
        if (existingUser && !existingUser.appleId) {
          existingUser.appleId = appleId;
          await existingUser.save();
          syncedClearCache(`userAuth_${existingUser.secret}`);
        }
      }
      timings.appleLookup = Date.now() - startLookup;

      if (!existingUser) {
        // Refuse re-registration of a blocklisted (perm-banned/deleted) identity.
        if (await blockIfBannedIdentity(res, { email, appleId }, timings, startTotal)) return;
        timings.isNewUser = true;
        const newSecret = createUUID();
        const newUser = new User({ email, appleId, secret: newSecret });
        // Auto-assign country flag instantly from the client's real device tz.
        if (signupCountryCode) {
          newUser.countryCode = signupCountryCode;
          if (tz) newUser.timeZone = tz;
        }
        await newUser.save();

        const startRank = Date.now();
        const usersAbove = await User.countDocuments({ elo: { $gt: 1000 }, banned: false }).cache(2000);
        timings.rankQuery = Date.now() - startRank;
        timings.total = Date.now() - startTotal;
        console.log('[googleAuth] Timings (ms):', JSON.stringify(timings));
        return res.status(200).json({
          ...buildAuthResponse(newUser, {
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
            win_rate: 0,
          }),
          username: undefined,
          banned: false,
          banType: 'none',
          banExpiresAt: null,
          banPublicNote: null,
          pendingNameChange: false,
          pendingNameChangePublicNote: null,
        });
      }

      timings.isNewUser = false;
      const checkedUser = await checkTempBanExpiration(existingUser);
      const extendedData = await getExtendedUserData(checkedUser, timings);
      timings.total = Date.now() - startTotal;
      console.log('[googleAuth] Timings (ms):', JSON.stringify(timings));
      return res.status(200).json(buildAuthResponse(checkedUser, extendedData));
    } catch (error) {
      timings.total = Date.now() - startTotal;
      timings.error = error.message;
      console.log('[googleAuth] Timings (ms):', JSON.stringify(timings));
      console.error('Apple token verification error:', error.message);
      return res.status(400).json({
        error: process.env.NODE_ENV === 'production' ? 'Invalid Apple token' : `Invalid Apple token: ${error.message}`,
      });
    }
  }

  // Mobile flow: verify id_token directly (no code exchange needed)
  if (id_token && !code && !secret) {
    timings.authType = 'id_token';
    try {
      const tokenPayload = decodeJwtPayload(id_token);
      if (tokenPayload) {
        timings.tokenAud = tokenPayload.aud;
        timings.tokenAzp = tokenPayload.azp;
        timings.tokenIss = tokenPayload.iss;
        timings.tokenExp = tokenPayload.exp;
      }
      const startTokenVerify = Date.now();
      const allowedAudiences = [
        process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        process.env.GOOGLE_IOS_CLIENT_ID,
        process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
        process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
      ].filter(Boolean);
      const tokenClient = new OAuth2Client();
      const ticket = await tokenClient.verifyIdToken({
        idToken: id_token,
        audience: allowedAudiences,
      });
      timings.tokenVerify = Date.now() - startTokenVerify;

      const email = ticket.getPayload()?.email;
      if (!email) {
        timings.total = Date.now() - startTotal;
        console.log('[googleAuth] Timings (ms):', JSON.stringify(timings));
        return res.status(400).json({ error: 'No email in token' });
      }

      const startEmailLookup = Date.now();
      const existingUser = await User.findOne({ email });
      timings.emailLookup = Date.now() - startEmailLookup;

      if (!existingUser) {
        // Refuse re-registration of a blocklisted (perm-banned/deleted) identity.
        if (await blockIfBannedIdentity(res, { email }, timings, startTotal)) return;
        timings.isNewUser = true;
        const startNewUser = Date.now();
        const newSecret = createUUID();
        const newUser = new User({ email, secret: newSecret });
        // Auto-assign country flag instantly from the client's real device tz.
        if (signupCountryCode) {
          newUser.countryCode = signupCountryCode;
          if (tz) newUser.timeZone = tz;
        }
        await newUser.save();
        timings.newUserCreate = Date.now() - startNewUser;

        const startRank = Date.now();
        const usersAbove = await User.countDocuments({ elo: { $gt: 1000 }, banned: false }).cache(2000);
        timings.rankQuery = Date.now() - startRank;

        timings.total = Date.now() - startTotal;
        console.log('[googleAuth] Timings (ms):', JSON.stringify(timings));
        return res.status(200).json({
          secret: newSecret,
          username: undefined,
          email: email,
          staff: false,
          canMakeClues: false,
          supporter: false,
          accountId: newUser._id,
          countryCode: signupCountryCode,
          banned: false,
          banType: 'none',
          banExpiresAt: null,
          banPublicNote: null,
          pendingNameChange: false,
          pendingNameChangePublicNote: null,
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
      } else {
        timings.isNewUser = false;
        const checkedUser = await checkTempBanExpiration(existingUser);

        if (checkedUser.countryCode == null && checkedUser.timeZone) {
          const countryCode = timezoneToCountry(checkedUser.timeZone);
          if (countryCode) {
            await User.findByIdAndUpdate(checkedUser._id, { countryCode });
            checkedUser.countryCode = countryCode;
          }
        }

        const extendedData = await getExtendedUserData(checkedUser, timings);

        timings.total = Date.now() - startTotal;
        console.log('[googleAuth] Timings (ms):', JSON.stringify(timings));
        return res.status(200).json({
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
          pendingDeletion: !!checkedUser.scheduledDeletionAt,
          scheduledDeletionAt: checkedUser.scheduledDeletionAt || null,
          ...extendedData
        });
      }
    } catch (error) {
      timings.total = Date.now() - startTotal;
      timings.error = error.message;
      console.log('[googleAuth] Timings (ms):', JSON.stringify(timings));
      console.error('ID token verification error:', error.message);
      return res.status(400).json({
        error: process.env.NODE_ENV === 'production' ? 'Invalid token' : `Invalid token: ${error.message}`,
      });
    }
  }

  if (!code) {
    // Prevent NoSQL injection - secret must be a string
    if(!secret || typeof secret !== 'string') {
      return res.status(400).json({ error: 'Invalid' });
    }

    timings.authType = 'secret';
    const startUserLookup = Date.now();
    const userDb = await User.findOne({
      secret,
    }).select("_id secret username email staff canMakeClues supporter banned banType banExpiresAt banPublicNote pendingNameChange pendingNameChangePublicNote scheduledDeletionAt timeZone countryCode totalXp created_at totalGamesPlayed lastLogin lastNameChange elo duels_wins duels_losses duels_tied").cache(120, `userAuth_${secret}`);
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

          syncedClearCache(`userAuth_${secret}`);
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
        pendingDeletion: !!checkedUser.scheduledDeletionAt,
        scheduledDeletionAt: checkedUser.scheduledDeletionAt || null,
        // Extended data (publicAccount + eloRank combined)
        ...extendedData
      };

      if(!checkedUser.username || checkedUser.username.length < 1) {
        // try again without cache, to prevent new users getting stuck with no username
        timings.retryWithoutCache = true;
        const startRetry = Date.now();
        const userDb2 = await User.findOne({
          secret,
        }).select("_id secret username email staff canMakeClues supporter banned banType banExpiresAt banPublicNote pendingNameChange pendingNameChangePublicNote scheduledDeletionAt timeZone countryCode totalXp created_at totalGamesPlayed lastLogin lastNameChange elo duels_wins duels_losses duels_tied");
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

              syncedClearCache(`userAuth_${secret}`);
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
            pendingDeletion: !!checkedUser2.scheduledDeletionAt,
            scheduledDeletionAt: checkedUser2.scheduledDeletionAt || null,
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
      // Use provided redirect_uri for redirect flow (GD), otherwise default client uses 'postmessage' (popup flow)
      const tokenClient = new OAuth2Client(
        process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri || 'postmessage'
      );
      const { tokens } = await tokenClient.getToken(code);
      tokenClient.setCredentials(tokens);
      timings.tokenExchange = Date.now() - startTokenExchange;

      const startTokenVerify = Date.now();
      const ticket = await tokenClient.verifyIdToken({
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
        // Refuse re-registration of a blocklisted (perm-banned/deleted) identity.
        if (await blockIfBannedIdentity(res, { email }, timings, startTotal)) return;
        timings.isNewUser = true;
        const startNewUser = Date.now();
        // countryCode is auto-assigned ONLY from an explicit, valid client-provided
        // tz (see signupCountryCode). We never derive it from the User schema's
        // default tz ('America/Los_Angeles'), which would mislabel all new users as
        // 'US'. When no tz is provided (e.g. web OAuth, which doesn't send one), it
        // stays null and the user can pick a flag later / get it via ws migration.
        secret = createUUID();
        const newUser = new User({ email, secret });
        if (signupCountryCode) {
          newUser.countryCode = signupCountryCode;
          if (tz) newUser.timeZone = tz;
        }

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
          countryCode: signupCountryCode,
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
          pendingDeletion: !!checkedUser.scheduledDeletionAt,
          scheduledDeletionAt: checkedUser.scheduledDeletionAt || null,
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
