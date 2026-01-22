import mongoose from 'mongoose';
import User, { USERNAME_COLLATION } from '../models/User.js';
import UserStatsService from '../components/utils/userStatsService.js';
import { rateLimit } from '../utils/rateLimit.js';


// gautam note: this doesnt make any sense at all, ai slop.
// user id is public, username is public, so why are we pretending like user id is private?
// temporarily fix this by setting isPublicRequest to true, every request is public.

// Username validation regex: alphanumeric and underscores only, 3-20 characters
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

// MongoDB ObjectId validation regex
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

/**
 * Sanitize progression data by removing sensitive fields
 * @param {Array} progression - Raw progression data
 * @param {boolean} isPublic - Whether this is a public (username-based) request
 * @returns {Array} Sanitized progression data
 */
function sanitizeProgression(progression, isPublic = false) {
  return progression.map(stat => {
    const sanitized = {
      timestamp: stat.timestamp,
      totalXp: stat.totalXp,
      xpRank: stat.xpRank,
      elo: stat.elo,
      eloRank: stat.eloRank,
      // Calculated fields
      xpGain: stat.xpGain || 0,
      eloChange: stat.eloChange || 0,
      rankImprovement: stat.rankImprovement || 0
    };

    // Never expose userId for public requests
    if (!isPublic) {
      sanitized.userId = stat.userId;
    }

    // Never expose gameId, eloRefundDetails, or other sensitive fields
    // These are intentionally excluded for security

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
    max: 10, 
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
          message: 'Invalid username format. Username must be 3-20 characters and contain only letters, numbers, and underscores.'
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

    // Sanitize progression data - remove gameId and other sensitive fields
    const sanitizedProgression = sanitizeProgression(progression, isPublicRequest);

    // Build response
    const response = {
      progression: sanitizedProgression,
      username: user.username
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
