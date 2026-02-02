import User from '../models/User.js';
import Report from '../models/Report.js';

/**
 * Submit Username Report API
 *
 * Allows users to report inappropriate usernames from public profiles
 * This is separate from in-game reports as it doesn't require a game context
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const {
    secret,
    reportedUsername,
    description
  } = req.body;

  // Validate inputs
  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid session' });
  }

  if (!reportedUsername || typeof reportedUsername !== 'string' || reportedUsername.trim().length === 0) {
    return res.status(400).json({ message: 'Invalid username' });
  }

  if (!description || typeof description !== 'string' || description.trim().length < 10) {
    return res.status(400).json({ message: 'Description must be at least 10 characters' });
  }

  if (description.length > 500) {
    return res.status(400).json({ message: 'Description must be less than 500 characters' });
  }

  try {
    // Verify reporter exists
    const reporter = await User.findOne({ secret });
    if (!reporter) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Check if reporter is banned
    if (reporter.banned) {
      return res.status(403).json({ message: 'Your account is banned and cannot submit reports' });
    }

    // Find the reported user by username (case-insensitive)
    // Escape special regex characters to prevent injection
    const escapedUsername = reportedUsername.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const reportedUser = await User.findOne({
      username: { $regex: new RegExp(`^${escapedUsername}$`, 'i') }
    });

    if (!reportedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent self-reporting
    if (reporter._id.toString() === reportedUser._id.toString()) {
      return res.status(400).json({ message: 'You cannot report yourself' });
    }

    // Check for duplicate reports (same reporter, same reported user, username report type)
    // Using gameId: 'PROFILE_REPORT' to distinguish from in-game reports
    const existingReport = await Report.findOne({
      'reportedBy.accountId': reporter._id.toString(),
      'reportedUser.accountId': reportedUser._id.toString(),
      gameId: 'PROFILE_REPORT',
      reason: 'inappropriate_username'
    });

    if (existingReport) {
      return res.status(409).json({ message: 'You have already reported this username' });
    }

    // Check for spam (more than 5 reports in the last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentReportsCount = await Report.countDocuments({
      'reportedBy.accountId': reporter._id.toString(),
      createdAt: { $gte: oneHourAgo }
    });

    if (recentReportsCount >= 5) {
      return res.status(429).json({ message: 'You are submitting reports too quickly. Please try again later.' });
    }

    // Create the report
    const report = new Report({
      reportedBy: {
        accountId: reporter._id.toString(),
        username: reporter.username || 'Anonymous'
      },
      reportedUser: {
        accountId: reportedUser._id.toString(),
        username: reportedUser.username
      },
      reason: 'inappropriate_username',
      description: description.trim(),
      gameId: 'PROFILE_REPORT', // Special marker for profile-based reports
      gameType: 'profile_report', // Custom game type for profile reports
      status: 'pending'
    });

    await report.save();

    return res.status(201).json({
      message: 'Report submitted successfully',
      reportId: report._id
    });

  } catch (error) {
    console.error('Submit username report error:', error);
    return res.status(500).json({
      message: 'An error occurred while submitting the report',
      error: error.message
    });
  }
}
