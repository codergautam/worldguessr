import User from '../../models/User.js';
import Report from '../../models/Report.js';
import ModerationLog from '../../models/ModerationLog.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { secret, status, reason, limit = 50, skip = 0, showAll = false } = req.body;

  // Validate secret
  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid secret' });
  }

  try {
    // Verify requesting user is staff
    const requestingUser = await User.findOne({ secret });
    if (!requestingUser || !requestingUser.staff) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Build query for status filter
    const matchQuery = {};
    if (status && ['pending', 'reviewed', 'dismissed', 'action_taken'].includes(status)) {
      matchQuery.status = status;
    }
    
    // Add reason filter if provided
    if (reason && ['inappropriate_username', 'cheating', 'other'].includes(reason)) {
      matchQuery.reason = reason;
    }
    
    // If showAll is true, we want all reports regardless of status
    const wantAllReports = showAll || (status !== 'pending' && status !== undefined);

    // Get counts by status for dashboard stats
    const statusCounts = await Report.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const stats = {
      total: 0,
      pending: 0,
      reviewed: 0,
      dismissed: 0,
      action_taken: 0
    };

    statusCounts.forEach(item => {
      if (item._id in stats) {
        stats[item._id] = item.count;
      }
      stats.total += item.count;
    });

    // Get counts by reason for pending reports (for the filter dropdown)
    const reasonCounts = await Report.aggregate([
      { $match: { status: 'pending' } },
      {
        $group: {
          _id: '$reason',
          count: { $sum: 1 }
        }
      }
    ]);

    const pendingReasonCounts = {
      cheating: 0,
      inappropriate_username: 0,
      other: 0
    };

    reasonCounts.forEach(item => {
      if (item._id in pendingReasonCounts) {
        pendingReasonCounts[item._id] = item.count;
      }
    });

    stats.pendingByReason = pendingReasonCounts;

    // For pending reports, we want to group by reported user and order by:
    // 1. Number of reports against user (descending)
    // 2. Oldest report date (ascending) - so oldest reports are seen first
    
    // If filtering by pending status (and not requesting all), use the special grouping logic
    if (status === 'pending' && !wantAllReports) {
      // Build match query for pending reports (including optional reason filter)
      const pendingMatchQuery = { status: 'pending' };
      if (reason && ['inappropriate_username', 'cheating', 'other'].includes(reason)) {
        pendingMatchQuery.reason = reason;
      }
      
      // Get pending reports grouped by reported user
      const groupedReports = await Report.aggregate([
        { $match: pendingMatchQuery },
        {
          $group: {
            _id: '$reportedUser.accountId',
            reportedUser: { $first: '$reportedUser' },
            reports: { $push: '$$ROOT' },
            reportCount: { $sum: 1 },
            oldestReportDate: { $min: '$createdAt' }
          }
        },
        {
          $sort: {
            reportCount: -1,      // Users with more reports first
            oldestReportDate: 1   // Then by oldest report (so old reports aren't forgotten)
          }
        },
        { $skip: skip },
        { $limit: Math.min(limit, 100) }
      ]);

      // Get all unique user IDs (reporters and reported users) to fetch their status
      const reporterIds = new Set();
      const reportedUserIds = new Set();
      groupedReports.forEach(group => {
        reportedUserIds.add(group.reportedUser.accountId);
        group.reports.forEach(report => {
          reporterIds.add(report.reportedBy.accountId);
        });
      });

      // Fetch reporter stats and status
      const reporters = await User.find(
        { _id: { $in: Array.from(reporterIds) } },
        { _id: 1, username: 1, reporterStats: 1, banned: 1, banType: 1, banExpiresAt: 1, pendingNameChange: 1 }
      ).lean();

      // Check ban history for all reporters
      const reporterBanHistory = await ModerationLog.find(
        {
          'targetUser.accountId': { $in: Array.from(reporterIds) },
          actionType: { $in: ['ban_permanent', 'ban_temporary'] }
        },
        { 'targetUser.accountId': 1 }
      ).lean();

      const reportersWithBanHistory = new Set(
        reporterBanHistory.map(log => log.targetUser.accountId)
      );

      const reporterDataMap = {};
      reporters.forEach(reporter => {
        reporterDataMap[reporter._id.toString()] = {
          helpfulReports: reporter.reporterStats?.helpfulReports || 0,
          unhelpfulReports: reporter.reporterStats?.unhelpfulReports || 0,
          banned: reporter.banned,
          banType: reporter.banType,
          banExpiresAt: reporter.banExpiresAt,
          pendingNameChange: reporter.pendingNameChange,
          hasBanHistory: reportersWithBanHistory.has(reporter._id.toString())
        };
      });

      // Fetch reported user status
      const reportedUsers = await User.find(
        { _id: { $in: Array.from(reportedUserIds) } },
        { _id: 1, banned: 1, banType: 1, banExpiresAt: 1, pendingNameChange: 1 }
      ).lean();

      const reportedUserDataMap = {};
      reportedUsers.forEach(user => {
        reportedUserDataMap[user._id.toString()] = {
          banned: user.banned,
          banType: user.banType,
          banExpiresAt: user.banExpiresAt,
          pendingNameChange: user.pendingNameChange
        };
      });

      // Enrich reports with reporter stats and status info
      const enrichedGroups = groupedReports.map(group => ({
        reportedUser: {
          ...group.reportedUser,
          ...reportedUserDataMap[group.reportedUser.accountId]
        },
        reportCount: group.reportCount,
        oldestReportDate: group.oldestReportDate,
        reports: group.reports.map(report => ({
          ...report,
          reporterStats: reporterDataMap[report.reportedBy.accountId] || {
            helpfulReports: 0,
            unhelpfulReports: 0
          },
          reporterStatus: reporterDataMap[report.reportedBy.accountId] || {}
        }))
      }));

      // Get total count of users with pending reports (with optional reason filter)
      const totalUsersWithPendingReports = await Report.aggregate([
        { $match: pendingMatchQuery },
        { $group: { _id: '$reportedUser.accountId' } },
        { $count: 'total' }
      ]);

      return res.status(200).json({
        groupedReports: enrichedGroups,
        stats,
        pagination: {
          total: totalUsersWithPendingReports[0]?.total || 0,
          limit,
          skip,
          hasMore: skip + groupedReports.length < (totalUsersWithPendingReports[0]?.total || 0)
        },
        isGrouped: true
      });
    }

    // For non-pending status, return flat list (for historical review)
    const reports = await Report.find(matchQuery)
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 100))
      .skip(skip)
      .lean();

    // Get all unique user IDs
    const reporterIds = [...new Set(reports.map(r => r.reportedBy.accountId))];
    const reportedUserIds = [...new Set(reports.map(r => r.reportedUser.accountId))];
    const allUserIds = [...new Set([...reporterIds, ...reportedUserIds])];

    // Fetch user data (stats and status)
    const users = await User.find(
      { _id: { $in: allUserIds } },
      { _id: 1, reporterStats: 1, banned: 1, banType: 1, banExpiresAt: 1, pendingNameChange: 1 }
    ).lean();

    // Check ban history for all reporters
    const reporterBanHistory = await ModerationLog.find(
      {
        'targetUser.accountId': { $in: reporterIds },
        actionType: { $in: ['ban_permanent', 'ban_temporary'] }
      },
      { 'targetUser.accountId': 1 }
    ).lean();

    const reportersWithBanHistory = new Set(
      reporterBanHistory.map(log => log.targetUser.accountId)
    );

    const userDataMap = {};
    users.forEach(user => {
      userDataMap[user._id.toString()] = {
        helpfulReports: user.reporterStats?.helpfulReports || 0,
        unhelpfulReports: user.reporterStats?.unhelpfulReports || 0,
        banned: user.banned,
        banType: user.banType,
        banExpiresAt: user.banExpiresAt,
        pendingNameChange: user.pendingNameChange,
        hasBanHistory: reportersWithBanHistory.has(user._id.toString())
      };
    });

    // Enrich reports with reporter stats and status info
    const enrichedReports = reports.map(report => ({
      ...report,
      reporterStats: userDataMap[report.reportedBy.accountId] || {
        helpfulReports: 0,
        unhelpfulReports: 0
      },
      reporterStatus: userDataMap[report.reportedBy.accountId] || {},
      reportedUserStatus: userDataMap[report.reportedUser.accountId] || {}
    }));

    // Get total count for pagination
    const totalCount = await Report.countDocuments(matchQuery);

    return res.status(200).json({
      reports: enrichedReports,
      stats,
      pagination: {
        total: totalCount,
        limit,
        skip,
        hasMore: skip + reports.length < totalCount
      },
      isGrouped: false
    });

  } catch (error) {
    console.error('Get reports error:', error);
    return res.status(500).json({
      message: 'An error occurred while fetching reports',
      error: error.message
    });
  }
}
