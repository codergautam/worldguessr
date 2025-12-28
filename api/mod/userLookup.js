import mongoose from 'mongoose';
import User from '../../models/User.js';
import Report from '../../models/Report.js';
import ModerationLog from '../../models/ModerationLog.js';
import NameChangeRequest from '../../models/NameChangeRequest.js';
import UserStats from '../../models/UserStats.js';

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
    let searchType = null; // Track how we found the user

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
      searchType = 'accountId';
    }
    // If username is 'self', return the requesting user's data
    else if (username === 'self') {
      targetUser = requestingUser;
      searchType = 'self';
    }
    // Search mode - find all matching users by current or past names, email, or account ID
    else if (searchMode && username) {
      const searchTerm = username.trim();
      if (searchTerm.length < 2) {
        return res.status(400).json({ message: 'Search term must be at least 2 characters' });
      }

      // Check if search term looks like a MongoDB ObjectId
      const isObjectId = mongoose.Types.ObjectId.isValid(searchTerm) && searchTerm.length === 24;

      // Check if search term looks like an email
      const isEmail = searchTerm.includes('@');

      let currentNameMatches = [];

      if (isObjectId) {
        // Search by account ID
        const userById = await User.findById(searchTerm)
          .select('_id username email totalXp elo banned banType pendingNameChange staff supporter created_at')
          .lean();
        if (userById) {
          currentNameMatches = [userById];
        }
      } else if (isEmail) {
        // Search by email (case-insensitive)
        currentNameMatches = await User.find({
          email: { $regex: new RegExp(searchTerm, 'i') }
        })
          .select('_id username email totalXp elo banned banType pendingNameChange staff supporter created_at')
          .limit(10)
          .lean();
      } else {
        // Find users by current username (case-insensitive partial match)
        currentNameMatches = await User.find({
          username: { $regex: new RegExp(searchTerm, 'i') }
        })
          .select('_id username email totalXp elo banned banType pendingNameChange staff supporter created_at')
          .limit(10)
          .lean();
      }

      // Find users by past names in ModerationLog (only for non-ID/email searches)
      // Only search nameChange.oldName - NOT targetUser.username (that would incorrectly match
      // users who were targets of moderation actions but never had that username)
      let pastNameLogs = [];
      if (!isObjectId && !isEmail) {
        pastNameLogs = await ModerationLog.find({
          'nameChange.oldName': { $regex: new RegExp(searchTerm, 'i') },
          actionType: { $in: ['name_change_approved', 'name_change_forced', 'force_name_change', 'name_change_manual'] }
        })
          .select('targetUser.accountId targetUser.username nameChange createdAt')
          .limit(20)
          .lean();
      }

      // Get unique account IDs from past name matches
      const pastNameAccountIds = [...new Set(pastNameLogs.map(log => log.targetUser.accountId))];

      // Fetch those users (exclude users already in currentNameMatches)
      const currentMatchIds = currentNameMatches.map(u => u._id.toString());
      const pastNameUsers = await User.find({
        _id: { $in: pastNameAccountIds.filter(id => !currentMatchIds.includes(id)) }
      })
        .select('_id username email totalXp elo banned banType pendingNameChange staff supporter created_at')
        .limit(10)
        .lean();

      // Add past name info to users found by past names
      const pastNameUsersWithInfo = pastNameUsers.map(user => {
        const relevantLogs = pastNameLogs.filter(log => log.targetUser.accountId === user._id.toString());
        const pastNames = relevantLogs
          .filter(log => log.nameChange?.oldName)
          .map(log => log.nameChange.oldName);
        const lastChange = relevantLogs[0]?.createdAt;
        return {
          ...user,
          matchedByPastName: true,
          pastNames: [...new Set(pastNames)],
          lastNameChangeDate: lastChange
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
    // Exact username lookup (also supports account ID and email)
    // IMPORTANT: Also checks for multiple matches (ban evader detection)
    else if (username) {
      const searchTerm = username.trim();

      // Check if search term looks like a MongoDB ObjectId (24 hex characters)
      const isObjectId = mongoose.Types.ObjectId.isValid(searchTerm) && searchTerm.length === 24;

      // Check if search term looks like an email
      const isEmail = searchTerm.includes('@');

      if (isObjectId) {
        // Search by account ID - exact match, no multiple results possible
        targetUser = await User.findById(searchTerm);
        if (targetUser) {
          searchType = 'accountId';
        }
      } else if (isEmail) {
        // Search by email (exact match, case-insensitive)
        targetUser = await User.findOne({ email: { $regex: new RegExp(`^${searchTerm}$`, 'i') } });
        if (targetUser) {
          searchType = 'email';
        }
      } else {
        // Username search - check for MULTIPLE matches to catch ban evaders!
        // Escape regex special characters to prevent injection
        const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // 1. Find current user with this exact username
        const currentUserWithName = await User.findOne({
          username: { $regex: new RegExp(`^${escapedSearchTerm}$`, 'i') }
        });

        // 2. Find users who previously had this EXACT username (from name changes - including voluntary)
        const pastNameLogs = await ModerationLog.find({
          'nameChange.oldName': { $regex: new RegExp(`^${escapedSearchTerm}$`, 'i') },
          actionType: { $in: ['name_change_approved', 'name_change_forced', 'force_name_change', 'name_change_manual'] }
        }).sort({ createdAt: -1 }).limit(20).lean();

        // Get unique account IDs from past name logs (filter out nulls)
        const pastUserIds = [...new Set(
          pastNameLogs
            .filter(log => log.targetUser?.accountId)
            .map(log => log.targetUser.accountId)
        )];

        // Fetch those users (excluding current user if they're in the list)
        let pastUsers = [];
        if (pastUserIds.length > 0) {
          const excludeId = currentUserWithName?._id?.toString();
          // Filter out the current user's ID before querying (can't have two _id conditions)
          const idsToFetch = excludeId
            ? pastUserIds.filter(id => id !== excludeId)
            : pastUserIds;

          if (idsToFetch.length > 0) {
            pastUsers = await User.find({
              _id: { $in: idsToFetch }
            }).limit(10).lean();
          }
        }

        // Build list of all matches
        const allMatches = [];

        if (currentUserWithName) {
          allMatches.push({
            user: currentUserWithName,
            matchType: 'current_username',
            matchInfo: `Currently using "${searchTerm}"`
          });
        }

        for (const pastUser of pastUsers) {
          const relevantLogs = pastNameLogs.filter(log => log.targetUser.accountId === pastUser._id.toString());
          const changeDate = relevantLogs[0]?.createdAt;
          allMatches.push({
            user: pastUser,
            matchType: 'past_username',
            matchInfo: `Previously used "${searchTerm}" (changed ${changeDate ? new Date(changeDate).toLocaleDateString() : 'unknown'})`
          });
        }

        // If multiple matches found, return them all for review
        if (allMatches.length > 1) {
          // Build detailed info for each match
          const multipleMatches = await Promise.all(allMatches.map(async (match) => {
            return {
              _id: match.user._id,
              username: match.user.username,
              email: match.user.email,
              totalXp: match.user.totalXp,
              elo: match.user.elo,
              banned: match.user.banned,
              banType: match.user.banType,
              pendingNameChange: match.user.pendingNameChange,
              staff: match.user.staff,
              supporter: match.user.supporter,
              created_at: match.user.created_at,
              matchType: match.matchType,
              matchInfo: match.matchInfo
            };
          }));

          return res.status(200).json({
            multipleMatches: true,
            searchTerm: searchTerm,
            matchCount: multipleMatches.length,
            matches: multipleMatches,
            warning: '⚠️ Multiple accounts associated with this username - possible ban evasion!'
          });
        }

        // Single match or no match
        if (allMatches.length === 1) {
          targetUser = allMatches[0].user;
          searchType = allMatches[0].matchType === 'current_username' ? 'username' : 'past_username';
          if (searchType === 'past_username') {
            const response = await buildUserResponse(targetUser);
            response.foundByPastName = true;
            response.searchedName = searchTerm;
            return res.status(200).json(response);
          }
        }
      }

      if (!targetUser) {
        return res.status(404).json({ message: `User not found. Searched by: ${isObjectId ? 'Account ID' : isEmail ? 'Email' : 'Username'}` });
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
      email: targetUser.email || null, // Include email for staff lookup
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

  // Get ELO refunds from UserStats
  const eloRefunds = await UserStats.find({
    userId: targetUser._id.toString(),
    triggerEvent: 'elo_refund'
  })
    .sort({ timestamp: -1 })
    .limit(100)
    .lean();

  // Format ELO refunds for display
  const formattedEloRefunds = eloRefunds.map(refund => ({
    amount: refund.eloRefundDetails?.amount || 0,
    bannedUsername: refund.eloRefundDetails?.bannedUsername || 'Unknown',
    bannedUserId: refund.eloRefundDetails?.bannedUserId || null,
    timestamp: refund.timestamp,
    newElo: refund.elo,
    moderationLogId: refund.eloRefundDetails?.moderationLogId || null
  }));

  const totalEloRefunded = formattedEloRefunds.reduce((sum, r) => sum + r.amount, 0);

  response.history = {
    moderationLogs: moderationHistory,
    reportsMade: reportsMade,
    reportsAgainst: reportsAgainst,
    nameChangeRequests: nameChangeHistory,
    usernameHistory: usernameHistory,
    banHistory: banHistory,
    eloRefunds: formattedEloRefunds,
    summary: {
      totalModerationActions: moderationHistory.length,
      totalReportsMade: reportsMade.length,
      totalReportsAgainst: reportsAgainst.length,
      totalBans: banHistory.filter(b => b.action !== 'unban').length,
      totalUnbans: banHistory.filter(b => b.action === 'unban').length,
      totalNameChanges: usernameHistory.length,
      totalEloRefunded: totalEloRefunded,
      totalEloRefunds: formattedEloRefunds.length
    }
  };

  return response;
}
