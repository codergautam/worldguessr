import User from '../models/User.js';
import Report from '../models/Report.js';
import Game from '../models/Game.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const {
    secret,
    reportedUserAccountId, // Optional - can be inferred from game for duels
    reason,
    description,
    gameId,
    gameType
  } = req.body;

  // Validate inputs
  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid session' });
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

    // Find the game to verify it exists and get reported user info
    const game = await Game.findOne({ gameId });
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    // Verify the reporter was in this game
    const reporterInGame = game.players.find(
      p => p.accountId && p.accountId === reporter._id.toString()
    );
    if (!reporterInGame) {
      return res.status(403).json({ message: 'You were not in this game' });
    }

    // Determine the reported user from the game
    // CRITICAL SECURITY: The reported user MUST be verified to be in the game
    let reportedPlayerInGame;
    let finalReportedUserAccountId;

    if (reportedUserAccountId) {
      // SECURITY CHECK: Validate the provided reportedUserAccountId is actually in the game
      // This prevents users from reporting random people by sending fake user IDs
      reportedPlayerInGame = game.players.find(
        p => p.accountId && p.accountId === reportedUserAccountId
      );

      if (!reportedPlayerInGame) {
        return res.status(400).json({
          message: 'The reported player was not in this game. You can only report players who participated in the game.'
        });
      }

      finalReportedUserAccountId = reportedUserAccountId;
    } else {
      // If not provided, try to infer from game (works for duels only)
      const playersWithAccounts = game.players.filter(p => p.accountId);

      if (playersWithAccounts.length === 2) {
        // It's a duel - the other player is the reported one
        reportedPlayerInGame = playersWithAccounts.find(
          p => p.accountId !== reporter._id.toString()
        );
        if (!reportedPlayerInGame) {
          return res.status(400).json({ message: 'Could not determine reported player' });
        }
        finalReportedUserAccountId = reportedPlayerInGame.accountId;
      } else {
        // Multiplayer game - need to specify which player
        return res.status(400).json({
          message: 'For multiplayer games, you must specify which player to report'
        });
      }
    }

    // Double-check: Ensure reportedPlayerInGame was found in the game
    // This should always be true at this point, but adding as an extra safety measure
    if (!reportedPlayerInGame || !reportedPlayerInGame.accountId) {
      return res.status(400).json({ message: 'Invalid reported player data' });
    }

    // Prevent self-reporting
    if (reporter._id.toString() === finalReportedUserAccountId) {
      return res.status(400).json({ message: 'You cannot report yourself' });
    }

    // Verify reported user exists (by MongoDB _id)
    const reportedUser = await User.findById(finalReportedUserAccountId);
    if (!reportedUser) {
      return res.status(404).json({ message: 'Reported user not found' });
    }

    // Check for duplicate reports (same reporter, same reported user, same game)
    const existingReport = await Report.findOne({
      'reportedBy.accountId': reporter._id.toString(),
      'reportedUser.accountId': finalReportedUserAccountId,
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

    // Create the report - use username from game data for accuracy
    const report = new Report({
      reportedBy: {
        accountId: reporter._id.toString(),
        username: reporter.username || 'Anonymous'
      },
      reportedUser: {
        accountId: finalReportedUserAccountId,
        username: reportedPlayerInGame.username // Get username from game data
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

