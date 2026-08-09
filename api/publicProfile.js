import mongoose from 'mongoose';
import User, { USERNAME_COLLATION } from '../models/User.js';
import { STARTING_ELO } from '../components/utils/ratingFlags.js';
import { getLeague } from '../components/utils/leagues.js';
import { season0RankOf, hasSeason0 } from '../shared/season0/rank.js';
import { rateLimit } from '../utils/rateLimit.js';
import { registerStat } from '../serverUtils/statRegistry.js';


// Cache for profile data (userId -> {data, timestamp})
const profileCache = new Map();
registerStat('api/publicProfile.profileCache', () => profileCache.size);
const CACHE_DURATION = 60000; // 60 seconds

// In-memory store for IP -> profile views to prevent refresh spam
// Format: "ip:userId" -> timestamp
const profileViewTracking = new Map();
registerStat('api/publicProfile.profileViewTracking', () => profileViewTracking.size);
const VIEW_COOLDOWN = 5 * 60 * 1000; // 5 minutes - same IP can't count as a view again for 5 minutes

// Cleanup old cache entries every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of profileCache.entries()) {
    if (now - value.timestamp > CACHE_DURATION * 2) {
      profileCache.delete(key);
    }
  }
}, 120000);

// Cleanup old profile view tracking entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of profileViewTracking.entries()) {
    if (now - timestamp > VIEW_COOLDOWN * 2) {
      profileViewTracking.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Public Profile API Endpoint
 * Returns public profile data for a given username
 * Includes rate limiting, caching, and security measures
 */
export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Apply rate limiting: 10 requests per minute per IP
  const limiter = rateLimit({ max: 20, windowMs: 60000 });
  if (!limiter(req, res)) {
    return; // Rate limit exceeded, response already sent
  }

  const { username, id } = req.query;
  console.log(`[API] publicProfile: ${id || username}`);

  // Validate a lookup key is provided (id preferred — usernames change)
  const validId = id && typeof id === 'string' && mongoose.Types.ObjectId.isValid(id);
  if (!validId && (!username || typeof username !== 'string')) {
    return res.status(400).json({ message: 'Username is required' });
  }

  // Connect to MongoDB if not already connected (needed for view tracking)
  if (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(process.env.MONGODB);
    } catch (error) {
      console.error('Database connection failed:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  try {
    // Find by id when given (stable across renames), else by username
    // (case-insensitive with collation for index usage)
    const user = validId
      ? await User.findById(id)
      : await User.findOne({ username: username }).collation(USERNAME_COLLATION);

    // Generic error message to prevent user enumeration
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Exclude banned users (security: don't expose banned users' profiles)
    // if (user.banned === true) {
    //   return res.status(404).json({ message: 'User not found' });
    // }

    // Exclude users with pending name changes (security: match eloRank.js pattern)
    // if (user.pendingNameChange === true) {
    //   return res.status(404).json({ message: 'User not found' });
    // }

    const userId = user._id.toString();

    // Track profile view before checking cache (to ensure all unique IPs count)
    const clientIP = getClientIP(req);
    let viewCounted = false;
    try {
      viewCounted = await trackProfileView(userId, clientIP);
      // If view was counted, invalidate cache to get fresh view count
      if (viewCounted) {
        profileCache.delete(userId);
      }
    } catch (err) {
      console.error('Error tracking profile view:', err);
    }

    // Check cache (after potentially invalidating it)
    const cached = profileCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return res.status(200).json(cached.data);
    }

    // Calculate ELO rank (exclude banned users and pending name changes)
    const rank = (await User.countDocuments({
      elo: { $gt: user.elo },
      banned: false
    }).cache(2000)) + 1;

    // Calculate league info
    const league = getLeague(user.elo);

    // Calculate win rate safely (avoid division by zero)
    const totalDuels = (user.duels_wins || 0) + (user.duels_losses || 0) + (user.duels_tied || 0);
    const winRate = totalDuels > 0 ? (user.duels_wins || 0) / totalDuels : 0;

    // Calculate "member since" duration
    const memberSince = calculateMemberSince(user.created_at);

    // Refresh user data if view was counted to get updated view count
    let profileViews = user.profileViews || 0;
    if (viewCounted) {
      const refreshedUser = await User.findById(userId);
      if (refreshedUser) {
        profileViews = refreshedUser.profileViews || 0;
      }
    }

    // Build public profile response (ONLY public data)
    const publicProfile = {
      username: user.username,
      userId: userId,
      totalXp: user.totalXp || 0,
      gamesPlayed: user.totalGamesPlayed || 0,
      createdAt: user.created_at,
      memberSince: memberSince,
      lastLogin: user.lastLogin || user.created_at,
      profileViews: profileViews,
      elo: user.elo || STARTING_ELO,
      rank: rank,
      league: {
        name: league.name,
        emoji: league.emoji,
        color: league.color,
        minElo: league.minElo
      },
      // Season 0 commemorative fields. seasonPeakElo is the HIGHEST rating ever
      // reached on the old scale, which is a different number from `elo` above
      // (the current Season 1 rating) and must be labelled as such wherever it
      // renders, or players read it as a live rating and dispute it.
      // Falls back to elo_s0 (the closing rating) when the peak table missed.
      seasonPeakElo: user.seasonPeakElo ?? user.elo_s0 ?? null,
      seasonPeakLeague: user.seasonPeakLeague || null,
      // Closing rating on the old scale, for the OG badge's Season 0 card.
      // Safe to publish: the Hall of Fame already ranks the whole top board by
      // this exact number, and seasonPeakElo above (always the LARGER figure
      // from the same retired era) has been public since migration. Null on
      // every account the migration never touched.
      season0Elo: user.elo_s0 ?? null,
      // Where this account finished on the closing Season 0 ladder, from the
      // frozen table (shared/season0/rankTable.js) — never a live count, so it
      // is the same number today and in two years, and the same number the Hall
      // of Fame prints. Ties share the better rank.
      season0Rank: season0RankOf(user),
      // THE OG BADGE, resolved here and nowhere else. It is no longer the
      // `ogAccount` stamp alone (created before 2025-08-01) — every account that
      // was here for Season 0 gets it, and `elo_s0` is what records that. Web
      // and mobile both read this one boolean, so they cannot drift apart over
      // who counts as a veteran. See shared/season0/rank.js.
      ogAccount: hasSeason0(user),
      duelStats: {
        wins: user.duels_wins || 0,
        losses: user.duels_losses || 0,
        ties: user.duels_tied || 0,
        winRate: parseFloat(winRate.toFixed(3))
      },
      countryCode: user.countryCode || null,
      // Equipped name glow, mirroring what api/publicAccount.js already returns
      // for the signed-in view of the same screen. Both the web profile header
      // and mobile's ProfileView render the username from this payload, so
      // without it a player's own profile page was the one place their purchase
      // could never show. Public presentation, exactly like countryCode above —
      // nothing else under `cosmetics` is exposed here.
      //
      // `background` is here for the same reason and is used the same way:
      // pages/user.js paints THIS user's city behind their profile, so a
      // visitor reads the page in the owner's colours rather than their own.
      // It is a sku string from a public catalogue, not an entitlement — it
      // says what is on show, never what the account owns.
      cosmetics: {
        equipped: {
          nameGlow: user.cosmetics?.equipped?.nameGlow || null,
          background: user.cosmetics?.equipped?.background || null
        }
      }
    };

    // Cache the response using userId
    profileCache.set(userId, {
      data: publicProfile,
      timestamp: Date.now()
    });

    // Return public profile data
    return res.status(200).json(publicProfile);

  } catch (error) {
    console.error('Error fetching public profile:', error);
    return res.status(500).json({ message: 'An error occurred while fetching profile data' });
  }
}

/**
 * Get client IP address from request
 * @param {Object} req - Express request object
 * @returns {string} Client IP address
 */
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         'unknown';
}

/**
 * Track profile view if not recently viewed by this IP
 * @param {string} userId - User ID of the profile being viewed
 * @param {string} ip - IP address of the viewer
 * @returns {boolean} True if view was counted, false if it was a duplicate
 */
async function trackProfileView(userId, ip) {
  const viewKey = `${ip}:${userId}`;
  const now = Date.now();

  // Check if this IP recently viewed this profile
  const lastViewTime = profileViewTracking.get(viewKey);
  if (lastViewTime && (now - lastViewTime) < VIEW_COOLDOWN) {
    return false; // Don't count duplicate views
  }

  // Record this view
  profileViewTracking.set(viewKey, now);

  // Increment profile view count in database
  try {
    await User.updateOne(
      { _id: userId },
      { $inc: { profileViews: 1 } }
    );
    return true; // View was counted
  } catch (error) {
    console.error('Error tracking profile view:', error);
    return false;
  }
}

/**
 * Calculate human-readable "member since" duration
 * @param {Date} createdAt - User creation date
 * @returns {string} Human-readable duration (e.g., "3 months", "1 year")
 */
function calculateMemberSince(createdAt) {
  if (!createdAt) return 'Unknown';

  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now - created;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 1) return 'Today';
  if (diffDays === 1) return '1 day';
  if (diffDays < 30) return `${diffDays} days`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return '1 month';
  if (diffMonths < 12) return `${diffMonths} months`;

  const diffYears = Math.floor(diffMonths / 12);
  if (diffYears === 1) return '1 year';
  return `${diffYears} years`;
}
