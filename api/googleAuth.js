import { createUUID } from "../components/createUUID.js";
import User, { STARTING_ELO } from "../models/User.js";
import StampLedger from "../models/StampLedger.js";
import { Webhook } from "discord-webhook-node";
import { OAuth2Client } from "google-auth-library";
import { createPublicKey, createVerify } from "crypto";
import timezoneToCountry, { VALID_COUNTRY_CODES } from "../serverUtils/timezoneToCountry.js";
import { syncedClearCache } from '../serverUtils/cacheBus.js';
import { getLeague } from '../components/utils/leagues.js';
import { STARTING_ELO as DEFAULT_ELO } from '../components/utils/ratingFlags.js';
import { hasSeason0, season0RankOf } from '../shared/season0/rank.js';
import { findBannedIdentity, bannedIdentityMessage } from '../serverUtils/bannedIdentities.js';
import { entitlementFields, defaultEntitlementFields } from './stampShop.js';

const USERNAME_CHANGE_COOLDOWN = 30 * 24 * 60 * 60 * 1000; // 30 days

// ENTITLEMENTS (stamps / cosmetics / adFreeUntil / stampsEnabled) TRAVEL WITH
// EVERY AUTH RESPONSE. Two traps live in this file:
//
//  1. The .select() whitelists on the secret-login lookups. A field that is not
//     named there is silently absent from the document — so the shop clears the
//     userAuth_* cache after a purchase, the cache repopulates WITHOUT the new
//     balance, and the whole feature does nothing with no error anywhere. Any
//     new persisted field must be added to EVERY .select( string below.
//
//  2. The new-user response objects are hand-built literals that spread
//     nothing, so they need defaultEntitlementFields() explicitly.
//
// stampsEnabled is delivered by the SERVER (see entitlementFields) and must
// never become a client build constant: an app-store build cannot be re-flagged
// when the kill switch is thrown.
//
// The Season 1 notice fields (elo_s0 seasonPeakElo seasonPeakLeague
// eloNoticeSeenAt ogAccount) are here for exactly the reason documented in
// trap 1 above: buildEloNotice reads all five off this document, and a field
// missing from this whitelist reads as `undefined`, which makes the notice
// silently never fire (elo_s0 == null) or fire forever (eloNoticeSeenAt == null).
const AUTH_SELECT = "_id secret username email staff canMakeClues banned banType banExpiresAt banPublicNote pendingNameChange pendingNameChangePublicNote scheduledDeletionAt timeZone countryCode totalXp created_at totalGamesPlayed lastLogin lastNameChange elo duels_wins duels_losses duels_tied stamps cosmetics adFreeUntil elo_s0 seasonPeakElo seasonPeakLeague eloNoticeSeenAt ogAccount";

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);

/**
 * How many Stamps the Season 1 migration paid this account. READ ONLY: every
 * number here was already written by scripts/grantSeason1Compensation.js.
 *
 * The StampLedger is the declared source of truth for currency movement, and
 * the grant script's keys are deterministic
 * (`a:season1:<userId>:grinder|league|milestone:<tier>`), so an anchored prefix
 * sum over APPLIED rows is exact. Rows still sitting at applied:false never
 * moved the balance and must not be advertised.
 *
 * THE MIGRATION GRANTS NO XP, so there is nothing else to report. This function
 * used to also derive an XP figure by diffing a `season1_grant` UserStats marker
 * against the previous history row; both the grant and the marker are gone.
 *
 * Never throws: a ledger hiccup must not cost anyone their login. It costs the
 * gift tile, which hides at 0.
 */
async function readSeason1Stamps(userId) {
  const id = userId.toString();
  try {
    // Anchored regex so the unique idempotencyKey index is usable as a prefix
    // scan. The id is a Mongo ObjectId hex string, but it is escaped anyway
    // rather than trusting that at a query-building site.
    const ledgerRows = await StampLedger.find({
      userId,
      applied: true,
      idempotencyKey: new RegExp('^a:season1:' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':'),
    }).select('delta').lean();

    return num(
      (ledgerRows || []).reduce((sum, row) => sum + (typeof row.delta === 'number' ? row.delta : 0), 0)
    );
  } catch (e) {
    console.error('[googleAuth] season1 stamps read failed:', e.message);
    return 0;
  }
}

/**
 * Season 1 migration notice payload, or null when the modal must not render.
 *
 * DISPLAY ONLY. The Stamps and the OG badge are applied EAGERLY by the migration
 * script; readSeason1Stamps above reads the already-applied ledger total so the
 * modal can show it. This path must NEVER grant or write anything.
 *
 * Three gates, all required:
 *   1. elo_s0 is non-null         - only the migration stamps it, so this is the
 *                                   proof the account existed before migration.
 *                                   A post-migration signup has null here and
 *                                   gets no notice, which is correct: they never
 *                                   lost a number.
 *   2. eloNoticeSeenAt is null    - the once-per-account latch (api/eloNoticeAck).
 *   3. elo_s0 > 1000              - the account actually played ranked. 1000 is
 *                                   the old default rating, and on the dev set
 *                                   50,202 of 50,217 accounts sit on it exactly:
 *                                   they never queued, never had a rating to
 *                                   convert, and a modal announcing what
 *                                   happened to "their" rating is noise. The
 *                                   badges and grants still land for them; only
 *                                   this screen is skipped.
 *
 * When any gate fails we return null and the caller OMITS the key entirely, so
 * the client has nothing to render rather than an empty object to guard against.
 */
/**
 * Old-scale rating an account must have EXCEEDED to be shown the notice. 1000
 * was the starting rating, so `> 1000` means "played ranked and climbed".
 * NOTE: this also skips the handful who played and finished BELOW 1000. That
 * follows the rule as specified; widen to `!== 1000` if they should see it too.
 */
const ELO_NOTICE_MIN_S0 = 1000;

async function buildEloNotice(user) {
  if (user.elo_s0 === null || user.elo_s0 === undefined) return null;
  if (!(Number(user.elo_s0) > ELO_NOTICE_MIN_S0)) return null;
  if (user.eloNoticeSeenAt) return null;

  // Peak is the real career high (section 9a) and is >= elo_s0 by construction.
  // If the migration somehow left it null, fall back to the closing rating rather
  // than rendering "Your Season 0 peak: null" on the most emotionally loaded
  // surface in the update.
  const oldElo = Math.round(user.elo_s0);
  const peakElo = Math.round(
    user.seasonPeakElo === null || user.seasonPeakElo === undefined ? user.elo_s0 : user.seasonPeakElo
  );
  const newElo = Math.round(user.elo || DEFAULT_ELO);

  const stampsGranted = await readSeason1Stamps(user._id);

  return {
    oldElo,
    peakElo,
    newElo,
    // The tier for the NEW rating, resolved through the active (v2) table.
    league: getLeague(newElo)?.name || null,
    stampsGranted,
    // Same predicate the profile badge uses (shared/season0/rank.js), not the
    // `ogAccount` stamp alone: the badge belongs to everyone who was here for
    // Season 0. Every account that reaches this line has an elo_s0 above 1000,
    // so in practice this is true for everyone who sees the notice — which is
    // the point. Two surfaces showing the same badge must never disagree about
    // who has earned it.
    ogBadge: hasSeason0(user),
  };
}

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
    // Covers the Apple new-user path, whose extendedData is hand-built and
    // carries no entitlements. For existing users the spread below re-supplies
    // the same values from getExtendedUserData.
    ...entitlementFields(user),
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
    // Season 0 commemorative fields, mirroring api/publicProfile.js.
    //
    // WITHOUT THESE the mobile Profile tab renders its OG and peak badges only
    // when you are looking at SOMEONE ELSE — the own-profile payload is this
    // object, and it carried none of them, so a veteran opening their own
    // account saw no badge at all. AUTH_SELECT already pulls all four columns,
    // so this costs nothing extra at the database.
    //
    // seasonPeakElo is on the RETIRED 0-20,000 scale and is never comparable to
    // `elo` below. Every render site labels it Season 0 for that reason.
    seasonPeakElo: user.seasonPeakElo ?? user.elo_s0 ?? null,
    seasonPeakLeague: user.seasonPeakLeague || null,
    season0Elo: user.elo_s0 ?? null,
    season0Rank: season0RankOf(user),
    ogAccount: hasSeason0(user),
  };

  // eloRank data
  const startRank = Date.now();
  const rank = (await User.countDocuments({
    elo: { $gt: user.elo || DEFAULT_ELO },
    banned: false
  }).cache(2000)) + 1;
  timings.rankQuery = Date.now() - startRank;

  const eloData = {
    elo: user.elo || DEFAULT_ELO,
    rank,
    league: getLeague(user.elo || DEFAULT_ELO),
    duels_wins: user.duels_wins || 0,
    duels_losses: user.duels_losses || 0,
    duels_tied: user.duels_tied || 0,
    win_rate: (user.duels_wins || 0) / ((user.duels_wins || 0) + (user.duels_losses || 0) + (user.duels_tied || 0)) || 0
  };

  // Season 1 migration notice. Computed HERE rather than at each response site
  // because this one function is spread into all five existing-user responses
  // (apple / google id_token / secret / secret-retry / google oauth code) and
  // none of the new-user literals — which is exactly the set of accounts that
  // can ever have an elo_s0. Absent key when there is nothing to show, so the
  // client renders nothing rather than guarding an empty object.
  const eloNotice = await buildEloNotice(user);

  timings.extendedData = Date.now() - startExtended;
  if (eloNotice) timings.eloNotice = true;

  // Entitlements ride along with every response site that spreads this object.
  return {
    ...publicData,
    ...eloData,
    ...entitlementFields(user),
    ...(eloNotice ? { eloNotice } : {}),
  };
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
        const usersAbove = await User.countDocuments({ elo: { $gt: STARTING_ELO }, banned: false }).cache(2000);
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
            elo: STARTING_ELO,
            rank: usersAbove + 1,
            league: getLeague(STARTING_ELO),
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
      const picture = ticket.getPayload()?.picture;
      if (!email) {
        timings.total = Date.now() - startTotal;
        console.log('[googleAuth] Timings (ms):', JSON.stringify(timings));
        return res.status(400).json({ error: 'No email in token' });
      }

      const startEmailLookup = Date.now();
      const existingUser = await User.findOne({ email });
      timings.emailLookup = Date.now() - startEmailLookup;

      // Keep the Google profile picture fresh (used for forum avatar)
      if (existingUser && picture && existingUser.avatarUrl !== picture) {
        await User.updateOne({ _id: existingUser._id }, { avatarUrl: picture });
      }

      if (!existingUser) {
        // Refuse re-registration of a blocklisted (perm-banned/deleted) identity.
        if (await blockIfBannedIdentity(res, { email }, timings, startTotal)) return;
        timings.isNewUser = true;
        const startNewUser = Date.now();
        const newSecret = createUUID();
        const newUser = new User({ email, secret: newSecret, avatarUrl: picture || null });
        // Auto-assign country flag instantly from the client's real device tz.
        if (signupCountryCode) {
          newUser.countryCode = signupCountryCode;
          if (tz) newUser.timeZone = tz;
        }
        await newUser.save();
        timings.newUserCreate = Date.now() - startNewUser;

        const startRank = Date.now();
        const usersAbove = await User.countDocuments({ elo: { $gt: STARTING_ELO }, banned: false }).cache(2000);
        timings.rankQuery = Date.now() - startRank;

        timings.total = Date.now() - startTotal;
        console.log('[googleAuth] Timings (ms):', JSON.stringify(timings));
        return res.status(200).json({
          secret: newSecret,
          username: undefined,
          email: email,
          staff: false,
          canMakeClues: false,
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
          elo: STARTING_ELO,
          rank: usersAbove + 1,
          league: getLeague(STARTING_ELO),
          duels_wins: 0,
          duels_losses: 0,
          duels_tied: 0,
          win_rate: 0,
          // This literal spreads nothing, so the entitlement defaults (and the
          // server-delivered stampsEnabled flag) have to be added explicitly.
          ...defaultEntitlementFields()
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
    }).select(AUTH_SELECT).cache(120, `userAuth_${secret}`);
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
        }).select(AUTH_SELECT);
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
      const picture = ticket.getPayload()?.picture;

      if (!email) {
        timings.total = Date.now() - startTotal;
        console.log('[googleAuth] Timings (ms):', JSON.stringify(timings));
        return res.status(400).json({ error: 'No email in token' });
      }

      const startEmailLookup = Date.now();
      const existingUser = await User.findOne({ email });
      timings.emailLookup = Date.now() - startEmailLookup;

      // Keep the Google profile picture fresh (used for forum avatar)
      if (existingUser && picture && existingUser.avatarUrl !== picture) {
        await User.updateOne({ _id: existingUser._id }, { avatarUrl: picture });
      }

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
        const newUser = new User({ email, secret, avatarUrl: picture || null });
        if (signupCountryCode) {
          newUser.countryCode = signupCountryCode;
          if (tz) newUser.timeZone = tz;
        }

        await newUser.save();
        timings.newUserCreate = Date.now() - startNewUser;

        // Default extended data for new users
        // Rank = count of users with elo > the starting rating + 1
        const startRank = Date.now();
        const usersAbove = await User.countDocuments({ elo: { $gt: STARTING_ELO }, banned: false }).cache(2000);
        timings.rankQuery = Date.now() - startRank;

        output = {
          secret: secret,
          username: undefined,
          email: email,
          staff: false,
          canMakeClues: false,
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
          elo: STARTING_ELO,
          rank: usersAbove + 1,
          league: getLeague(STARTING_ELO),
          duels_wins: 0,
          duels_losses: 0,
          duels_tied: 0,
          win_rate: 0,
          // This literal spreads nothing, so the entitlement defaults (and the
          // server-delivered stampsEnabled flag) have to be added explicitly.
          ...defaultEntitlementFields()
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
