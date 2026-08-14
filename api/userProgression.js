import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import User, { USERNAME_COLLATION } from '../models/User.js';
import UserStatsService from '../components/utils/userStatsService.js';
import { rateLimit } from '../utils/rateLimit.js';
import { convertRating, convertDelta, normalizeConversionTable } from '../components/utils/ratingConversion.js';
import { MIGRATION_AT } from '../components/utils/ratingFlags.js';


// gautam note: this doesnt make any sense at all, ai slop.
// user id is public, username is public, so why are we pretending like user id is private?
// temporarily fix this by setting isPublicRequest to true, every request is public.

// Username validation regex: must match api/setName.js exactly so any name the
// server allowed at signup is also lookupable here. Validation is kept (not
// removed) because this endpoint accepts arbitrary input and feeds it into
// User.findOne({ username }) — a non-string body would enable NoSQL injection.
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;

// MongoDB ObjectId validation regex
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

/* ------------------------------------------------------------------ *
 * Season 0 -> Season 1 read-time rating conversion
 * ------------------------------------------------------------------ *
 * Historical UserStats rows carry Season 0 ratings (0..20,000); rows written
 * after the migration carry v2 ratings (100..1600). Drawn raw, one graph holds
 * both and every veteran sees a cliff from 12,000 to 1,300.
 *
 * So pre-migration points are converted HERE, at read time, through the SAME
 * frozen table the migration wrote with (scripts/migrateRatingV2.js). The last
 * pre-migration point therefore lands on exactly the value the migration stamped
 * as the live rating: no seam, by construction. ~6.3M UserStats docs are never
 * rewritten, and old mobile builds get continuous graphs for free because none
 * of this is release-bound.
 *
 * eloRank needs nothing: the map is non-decreasing, so stored ranks stay
 * consistent with the converted ratings.
 * ------------------------------------------------------------------ */

// Same file, same accepted shapes as the migration's --map default.
const CONVERSION_MAP_PATH = path.join(process.cwd(), 'data', 'elo-conversion-map.json');

// undefined = never attempted, null = absent/unusable. Parsed ONCE per process:
// this endpoint is on the profile hot path and the table is tens of thousands of
// entries. Never per request.
let conversionTableCache;
let missingInstantLogged = false;

function getConversionTable() {
  if (conversionTableCache !== undefined) return conversionTableCache;

  // Set first so a throw below can never cause a re-read (and re-log) per request.
  conversionTableCache = null;

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(CONVERSION_MAP_PATH, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      console.warn(
        `[userProgression] RATING CONVERSION DISABLED: ${CONVERSION_MAP_PATH} NOT FOUND. ` +
        'Rating history is being served UNCONVERTED, so pre-migration points stay on the ' +
        'Season 0 scale and graphs will show the migration cliff. Place the FROZEN ' +
        'elo-conversion-map.json (the same file scripts/migrateRatingV2.js ran with) at ' +
        'that path and restart to enable read-time conversion.'
      );
    } else {
      console.warn(
        `[userProgression] RATING CONVERSION DISABLED: ${CONVERSION_MAP_PATH} could not be read/parsed ` +
        `(${error?.message}). Serving rating history UNCONVERTED.`
      );
    }
    return conversionTableCache;
  }

  const table = normalizeConversionTable(raw);
  if (!table) {
    console.warn(
      `[userProgression] RATING CONVERSION DISABLED: ${CONVERSION_MAP_PATH} is not a usable dense ` +
      'lookup keyed by old elo (see the CONVERSION TABLE FORMAT header in ' +
      'scripts/migrateRatingV2.js). Serving rating history UNCONVERTED.'
    );
    return conversionTableCache;
  }

  conversionTableCache = table;
  console.log(
    `[userProgression] rating conversion ENABLED: ${CONVERSION_MAP_PATH} ` +
    `(${table.size} entries, old elo ${table.minOld}..${table.maxOld})`
  );
  if (table.nonMonotonicCount > 0) {
    console.warn(
      `[userProgression] WARNING: conversion table has ${table.nonMonotonicCount} decreasing steps. ` +
      'A non-monotone map swaps two players\' relative order, so stored eloRank values will ' +
      'disagree with the converted ratings on those points.'
    );
  }
  return conversionTableCache;
}

/**
 * The conversion is live only when BOTH hold:
 *   - the migration instant is known (accounts' points are split by it).
 *   - the frozen table loaded.
 * Either missing = pass records through untouched.
 */
function getConversionContext() {
  const cutoffMs = MIGRATION_AT instanceof Date && !Number.isNaN(MIGRATION_AT.getTime())
    ? MIGRATION_AT.getTime()
    : null;
  if (cutoffMs === null) {
    if (!missingInstantLogged) {
      missingInstantLogged = true;
      console.warn(
        '[userProgression] RATING CONVERSION DISABLED: MIGRATION_AT is ' +
        'unset/unparseable, so there is no instant to split old-scale points ' +
        'from new-scale ones. Serving rating history UNCONVERTED.'
      );
    }
    return null;
  }

  const table = getConversionTable();
  if (!table) return null;

  return { table, cutoffMs };
}

function timestampMs(timestamp) {
  if (timestamp instanceof Date) return timestamp.getTime();
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Sanitize progression data by removing sensitive fields, and convert
 * pre-migration ratings onto the v2 scale in the SAME pass.
 *
 * Exported so test/ratingConversion.test.js can drive the real shaping code with
 * a synthetic conversion context (no database, no map file) — the delta rule and
 * the migration-boundary step are exactly the things that must not silently
 * regress.
 *
 * @param {Array} progression - Raw progression data
 * @param {boolean} isPublic - Whether this is a public (username-based) request
 * @param {object|null} conversion - { table, cutoffMs } from getConversionContext(), or null
 * @returns {Array} Sanitized progression data
 */
export function sanitizeProgression(progression, isPublic = false, conversion = null) {
  const table = conversion ? conversion.table : null;
  const cutoffMs = conversion ? conversion.cutoffMs : 0;

  // Which scale the PREVIOUS point was on. eloChange is a consecutive difference
  // (userStatsService.getUserProgression), so `elo - eloChange` is literally the
  // previous point's stored rating and has to be mapped on the previous point's
  // terms — that is the one step that crosses the migration instant.
  let prevIsPreMigration = null;

  // Single pass: the conversion is folded into the existing shape loop, no
  // second traversal of the records.
  return progression.map(stat => {
    let elo = stat.elo;
    let eloChange = stat.eloChange || 0;

    const rawElo = Number(stat.elo);
    if (conversion && Number.isFinite(rawElo)) {
      const rawChange = Number(stat.eloChange) || 0;
      const ts = timestampMs(stat.timestamp);
      const isPre = ts !== null && ts < cutoffMs;
      // First record has no predecessor (and a 0 change): treat it as its own era.
      const prevIsPre = prevIsPreMigration === null ? isPre : prevIsPreMigration;

      elo = isPre ? convertRating(rawElo, table) : rawElo;

      if (isPre && prevIsPre) {
        // Both ends of the step are old-scale. RE-DERIVED as f(elo) - f(elo - change),
        // never f(change): the map is nonlinear, so +60 near 15,000 is worth about
        // +8 while +60 near 1,000 is worth about +25.
        eloChange = convertDelta(rawElo, rawChange, table);
      } else if (!isPre && !prevIsPre) {
        // Both ends already v2. Nothing to do.
        eloChange = rawChange;
      } else {
        // THE BOUNDARY STEP: exactly one end predates the migration. Map each end
        // on its own scale, then subtract. Without this, the first post-migration
        // point reports a delta like 1305 - 12000 = -10695.
        const prevRaw = rawElo - rawChange;
        eloChange = elo - (prevIsPre ? convertRating(prevRaw, table) : prevRaw);
      }

      prevIsPreMigration = isPre;
    }

    const sanitized = {
      timestamp: stat.timestamp,
      totalXp: stat.totalXp,
      xpRank: stat.xpRank,
      elo: elo,
      eloRank: stat.eloRank,
      // triggerEvent is deliberately NOT sent. It was added so the graphs could
      // label the Season 1 XP grant instead of drawing an unexplained cliff;
      // that grant was cut before it shipped, so no client reads it any more.
      // Calculated fields
      xpGain: stat.xpGain || 0,
      eloChange: eloChange,
      rankImprovement: stat.rankImprovement || 0
    };

    // Never expose userId for public requests
    if (!isPublic) {
      sanitized.userId = stat.userId;
    }

    // Never expose gameId, eloRefundDetails, or other sensitive fields
    // These are intentionally excluded for security.
    // (If a refund AMOUNT is ever surfaced here it must go through
    // convertDelta(elo, amount, table) — a refund is a delta, and mapping a
    // delta directly through f() produces garbage.)

    return sanitized;
  });
}

/**
 * User Progression API Endpoint
 * Returns user stats progression for charts
 * Includes rate limiting, input validation, and security measures
 */
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Determine if this is a public (username-based) or authenticated (userId-based) request
  const { userId, username } = req.body;
  console.log(`[API] userProgression: ${username || userId}`);
  const isPublicRequest = true

  // Apply stricter rate limiting for public requests
  // Public: 5 requests per minute per IP
  // Authenticated: 20 requests per minute per IP
  const limiter = rateLimit({ 
    max: 30, 
    windowMs: 60000,
    message: 'Too many requests. Please try again later.'
  });
  
  if (!limiter(req, res)) {
    return; // Rate limit exceeded, response already sent
  }

  try {
    // Validate input: must provide either userId or username, but not both
    if (!userId && !username) {
      return res.status(400).json({ message: 'UserId or username is required' });
    }

    if (userId && username) {
      return res.status(400).json({ message: 'Provide either userId or username, not both' });
    }

    // Validate userId format (MongoDB ObjectId)
    if (userId) {
      if (typeof userId !== 'string' || !OBJECT_ID_REGEX.test(userId)) {
        return res.status(400).json({ message: 'Invalid userId format' });
      }
    }

    // Validate username format (prevent injection attacks)
    if (username) {
      if (typeof username !== 'string') {
        return res.status(400).json({ message: 'Username must be a string' });
      }
      if (!USERNAME_REGEX.test(username)) {
        return res.status(400).json({
          message: 'Invalid username format. Username must be 3-30 characters and contain only letters, numbers, and underscores.'
        });
      }
    }

    // Connect to MongoDB if not already connected
    if (mongoose.connection.readyState !== 1) {
      try {
        await mongoose.connect(process.env.MONGODB);
      } catch (error) {
        console.error('Database connection failed:', error);
        return res.status(500).json({ message: 'Internal server error' });
      }
    }

    // Find user by userId or username
    let user;
    if (userId) {
      user = await User.findOne({ _id: userId });
    } else if (username) {
      user = await User.findOne({ username: username }).collation(USERNAME_COLLATION);
    }

    // Generic error message to prevent user enumeration
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Exclude banned users and users with pending name changes (public API security)
    // if ((user.banned === true || user.pendingNameChange === true) && isPublicRequest) {
    //   // Only apply this check for username-based requests (public access)
    //   // Allow userId-based requests (authenticated user viewing their own data)
    //   return res.status(404).json({ message: 'User not found' });
    // }

    // Get user's stats progression
    const progression = await UserStatsService.getUserProgression(user._id);

    // Sanitize progression data - remove gameId and other sensitive fields,
    // and convert pre-migration ratings onto the v2 scale as they are shaped.
    const conversion = getConversionContext();
    const sanitizedProgression = sanitizeProgression(progression, isPublicRequest, conversion);

    // Build response
    const response = {
      progression: sanitizedProgression,
      username: user.username,
      // True only when EVERY point in this payload is on the v2 scale (100..1600).
      // False means the payload is untouched Season 0 data, or a mix of both
      // because the conversion map is unavailable — clients use it to pick
      // scale-dependent thresholds instead of hardcoding 1000.
      ratingScaleV2: !!conversion
    };

    // Only include userId for authenticated requests (not public)
    if (!isPublicRequest) {
      response.userId = user._id.toString();
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('Error fetching user progression:', error);
    // Don't expose internal error details in production
    return res.status(500).json({
      message: 'An error occurred while fetching progression data'
    });
  }
}
