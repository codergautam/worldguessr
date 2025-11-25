import mongoose from 'mongoose';
import User from '../../models/User.js';
import Report from '../../models/Report.js';
import ModerationLog from '../../models/ModerationLog.js';
import NameChangeRequest from '../../models/NameChangeRequest.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { secret, username, accountId, searchMode = false } = req.body;

  // Validate secret
  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid secret' });
  }

  try {
    // Verify requesting user exists
    const requestingUser = await User.findOne({ secret });
    if (!requestingUser || !requestingUser.staff) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    let targetUser;

    // If accountId is provided, use it directly (more reliable)
    if (accountId) {
      // Validate ObjectId format first
      if (mongoose.Types.ObjectId.isValid(accountId)) {
        targetUser = await User.findById(accountId);
      }
      
      // If still not found, could be stored as a string reference
      if (!targetUser) {
        targetUser = await User.findOne({ _id: accountId });
      }
      
      if (!targetUser) {
        return res.status(404).json({ message: `User not found by ID: ${accountId}` });
      }
    }
    // If username is 'self', return the requesting user's data
    else if (username === 'self') {
      targetUser = requestingUser;
    }
    // Search mode - find all matching users by current or past names
    else if (searchMode && username) {
      const searchTerm = username.trim();
      if (searchTerm.length < 2) {
        return res.status(400).json({ message: 'Search term must be at least 2 characters' });
      }

      // Find users by current username (case-insensitive partial match)
      const currentNameMatches = await User.find({
        username: { $regex: new RegExp(searchTerm, 'i') }
      })
        .select('_id username totalXp elo banned banType pendingNameChange staff supporter created_at')
        .limit(10)
        .lean();

      // Find users by past names in ModerationLog
      const pastNameLogs = await ModerationLog.find({
        $or: [
          { 'nameChange.oldName': { $regex: new RegExp(searchTerm, 'i') } },
          { 'targetUser.username': { $regex: new RegExp(searchTerm, 'i') } }
        ]
      })
        .select('targetUser.accountId targetUser.username nameChange')
        .limit(20)
        .lean();

      // Get unique account IDs from past name matches
      const pastNameAccountIds = [...new Set(pastNameLogs.map(log => log.targetUser.accountId))];
      
      // Fetch those users
      const pastNameUsers = await User.find({
        _id: { $in: pastNameAccountIds },
        // Exclude users already in currentNameMatches
        _id: { $nin: currentNameMatches.map(u => u._id) }
      })
        .select('_id username totalXp elo banned banType pendingNameChange staff supporter created_at')
        .limit(10)
        .lean();

      // Add past name info to users found by past names
      const pastNameUsersWithInfo = pastNameUsers.map(user => {
        const relevantLogs = pastNameLogs.filter(log => log.targetUser.accountId === user._id.toString());
        const pastNames = relevantLogs
          .filter(log => log.nameChange?.oldName)
          .map(log => log.nameChange.oldName);
        return {
          ...user,
          matchedByPastName: true,
          pastNames: [...new Set(pastNames)]
        };
      });

      // Combine results
      const allMatches = [
        ...currentNameMatches.map(u => ({ ...u, matchedByPastName: false })),
        ...pastNameUsersWithInfo
      ];

      return res.status(200).json({
        searchResults: allMatches,
        totalMatches: allMatches.length
      });
    }
    // Exact username lookup
    else if (username) {
      // First try exact match
      targetUser = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
      
      // If not found, check if this was a past username
      if (!targetUser) {
        const pastNameLog = await ModerationLog.findOne({
          'nameChange.oldName': { $regex: new RegExp(`^${username}$`, 'i') }
        }).sort({ createdAt: -1 });

        if (pastNameLog) {
          targetUser = await User.findById(pastNameLog.targetUser.accountId);
          if (targetUser) {
            // Return with a note that this was found by past name
            const response = await buildUserResponse(targetUser);
            response.foundByPastName = true;
            response.searchedName = username;
            return res.status(200).json(response);
          }
        }
      }

      if (!targetUser) {
        return res.status(404).json({ message: 'User not found' });
      }
    } else {
      return res.status(400).json({ message: 'Username or accountId is required' });
    }

    const response = await buildUserResponse(targetUser);
    return res.status(200).json(response);

  } catch (error) {
    console.error('Mod user lookup error:', error);
    return res.status(500).json({
      message: 'An error occurred while looking up user',
      error: error.message
    });
  }
}

async function buildUserResponse(targetUser) {
  // Base response
  const response = {
    targetUser: {
      username: targetUser.username,
      secret: targetUser.secret,
      _id: targetUser._id,
      totalXp: targetUser.totalXp,
      totalGamesPlayed: targetUser.totalGamesPlayed,
      elo: targetUser.elo,
      created_at: targetUser.created_at,
      banned: targetUser.banned,
      banType: targetUser.banType || 'none',
      banExpiresAt: targetUser.banExpiresAt,
      pendingNameChange: targetUser.pendingNameChange,
      pendingNameChangeReason: targetUser.pendingNameChangeReason,
      staff: targetUser.staff,
      supporter: targetUser.supporter,
      reporterStats: targetUser.reporterStats || { helpfulReports: 0, unhelpfulReports: 0 }
    }
  };

  // Get moderation history
  const moderationHistory = await ModerationLog.find({
    'targetUser.accountId': targetUser._id.toString()
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  // Get reports made BY this user
  const reportsMade = await Report.find({
    'reportedBy.accountId': targetUser._id.toString()
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  // Get reports made AGAINST this user
  const reportsAgainst = await Report.find({
    'reportedUser.accountId': targetUser._id.toString()
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  // Get name change history
  const nameChangeHistory = await NameChangeRequest.find({
    'user.accountId': targetUser._id.toString()
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  // Extract username history from moderation logs
  const usernameHistory = moderationHistory
    .filter(log => log.nameChange && log.nameChange.oldName && log.nameChange.newName)
    .map(log => ({
      oldName: log.nameChange.oldName,
      newName: log.nameChange.newName,
      changedAt: log.createdAt,
      action: log.actionType
    }));

  // Extract ban history
  const banHistory = moderationHistory
    .filter(log => ['ban_permanent', 'ban_temporary', 'unban'].includes(log.actionType))
    .map(log => ({
      action: log.actionType,
      reason: log.reason,
      duration: log.durationString,
      expiresAt: log.expiresAt,
      moderator: log.moderator.username,
      createdAt: log.createdAt
    }));

  response.history = {
    moderationLogs: moderationHistory,
    reportsMade: reportsMade,
    reportsAgainst: reportsAgainst,
    nameChangeRequests: nameChangeHistory,
    usernameHistory: usernameHistory,
    banHistory: banHistory,
    summary: {
      totalModerationActions: moderationHistory.length,
      totalReportsMade: reportsMade.length,
      totalReportsAgainst: reportsAgainst.length,
      totalBans: banHistory.filter(b => b.action !== 'unban').length,
      totalUnbans: banHistory.filter(b => b.action === 'unban').length,
      totalNameChanges: usernameHistory.length
    }
  };

  return response;
}
