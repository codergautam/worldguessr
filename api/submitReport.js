import User from '../models/User.js';
import Report from '../models/Report.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const {
    secret,
    reportedUserAccountId,
    reportedUsername,
    reason,
    description,
    gameId,
    gameType
  } = req.body;

  // Validate inputs
  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid session' });
  }

  if (!reportedUserAccountId || !reportedUsername) {
    return res.status(400).json({ message: 'Missing reported user information' });
  }

  if (!reason || !['inappropriate_username', 'cheating', 'other'].includes(reason)) {
    return res.status(400).json({ message: 'Invalid reason' });
  }

  if (!description || typeof description !== 'string' || description.trim().length < 10) {
    return res.status(400).json({ message: 'Description must be at least 10 characters' });
  }

  if (description.length > 500) {
    return res.status(400).json({ message: 'Description must be less than 500 characters' });
  }

  if (!gameId || typeof gameId !== 'string') {
    return res.status(400).json({ message: 'Invalid game ID' });
  }

  if (!gameType || !['ranked_duel', 'unranked_multiplayer', 'private_multiplayer'].includes(gameType)) {
    return res.status(400).json({ message: 'Invalid game type' });
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

    // Verify reported user exists (by MongoDB _id)
    const reportedUser = await User.findById(reportedUserAccountId);
    if (!reportedUser) {
      return res.status(404).json({ message: 'Reported user not found' });
    }

    // Prevent self-reporting
    if (reporter._id.toString() === reportedUser._id.toString()) {
      return res.status(400).json({ message: 'You cannot report yourself' });
    }

    // Check for duplicate reports (same reporter, same reported user, same game)
    const existingReport = await Report.findOne({
      'reportedBy.accountId': reporter._id.toString(),
      'reportedUser.accountId': reportedUser._id.toString(),
      gameId: gameId
    });

    if (existingReport) {
      return res.status(409).json({ message: 'You have already reported this player for this game' });
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
        username: reportedUsername
      },
      reason,
      description: description.trim(),
      gameId,
      gameType,
      status: 'pending'
    });

    await report.save();

    return res.status(201).json({
      message: 'Report submitted successfully',
      reportId: report._id
    });

  } catch (error) {
    console.error('Submit report error:', error);
    return res.status(500).json({
      message: 'An error occurred while submitting the report',
      error: error.message
    });
  }
}

