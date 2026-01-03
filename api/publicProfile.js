import mongoose from 'mongoose';
import User from '../models/User.js';
import { getLeague } from '../components/utils/leagues.js';
import { rateLimit } from '../utils/rateLimit.js';

// Username validation regex: alphanumeric and underscores only, 3-20 characters
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

// Cache for profile data (userId -> {data, timestamp})
const profileCache = new Map();
const CACHE_DURATION = 60000; // 60 seconds

// In-memory store for IP -> profile views to prevent refresh spam
// Format: "ip:userId" -> timestamp
const profileViewTracking = new Map();
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

  const { username } = req.query;

  // Validate username is provided
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ message: 'Username is required' });
  }

  // Validate username format (prevent injection attacks)
  if (!USERNAME_REGEX.test(username)) {
    return res.status(400).json({
      message: 'Invalid username format. Username must be 3-20 characters and contain only letters, numbers, and underscores.'
    });
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
    // Find user by username (case-sensitive to match eloRank.js pattern)
    const user = await User.findOne({ username: username });

    // Generic error message to prevent user enumeration
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Exclude banned users (security: don't expose banned users' profiles)
    if (user.banned === true) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Exclude users with pending name changes (security: match eloRank.js pattern)
    if (user.pendingNameChange === true) {
      return res.status(404).json({ message: 'User not found' });
    }

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
      banned: { $ne: true },
      pendingNameChange: { $ne: true }
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
      elo: user.elo || 1000,
      rank: rank,
      league: {
        name: league.name,
        emoji: league.emoji,
        color: league.color,
        minElo: league.minElo
      },
      duelStats: {
        wins: user.duels_wins || 0,
        losses: user.duels_losses || 0,
        ties: user.duels_tied || 0,
        winRate: parseFloat(winRate.toFixed(3))
      },
      supporter: user.supporter === true,
      countryCode: user.countryCode || null
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
