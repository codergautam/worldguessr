import User from '../models/User.js';
import UserStats from '../models/UserStats.js';
import ModerationLog from '../models/ModerationLog.js';
import Report from '../models/Report.js';

/**
 * User Moderation Data API
 * 
 * Returns moderation-related data for a user's own account:
 * - ELO refunds they received (from banned players)
 * - Moderation actions against them (public notes only, no internal reasons)
 * - Reports they submitted and their status
 * 
 * Does NOT return:
 * - Reports against them (for security)
 * - Internal moderator notes
 * - Details about what action was taken on their reports
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { secret } = req.body;

  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ message: 'Authentication required' });
  }

  try {
    // Find user by secret
    const user = await User.findOne({ secret });
    if (!user) {
      return res.status(401).json({ message: 'Invalid authentication' });
    }

    const accountId = user._id.toString();

    // 1. Get ELO refunds from UserStats
    const eloRefunds = await UserStats.find({
      userId: accountId,
      triggerEvent: 'elo_refund'
    })
      .sort({ timestamp: -1 })
      .limit(100)
      .lean();

    // Format ELO refunds for frontend
    const formattedRefunds = eloRefunds.map(refund => ({
      id: refund._id,
      amount: refund.eloRefundDetails?.amount || 0,
      bannedUsername: refund.eloRefundDetails?.bannedUsername || 'Unknown',
      date: refund.timestamp,
      newElo: refund.elo
    }));

    // 2. Get moderation actions against this user (public info only)
    const moderationHistory = await ModerationLog.find({
      'targetUser.accountId': accountId
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Format moderation history - only show public information
    const formattedModerationHistory = moderationHistory.map(log => {
      // Determine a user-friendly action description
      let actionDescription;
      switch (log.actionType) {
        case 'ban_permanent':
          actionDescription = 'Account suspended';
          break;
        case 'ban_temporary':
          actionDescription = 'Account temporarily suspended';
          break;
        case 'unban':
          actionDescription = 'Account suspension lifted';
          break;
        case 'force_name_change':
          actionDescription = 'Username change required';
          break;
        case 'name_change_approved':
          actionDescription = 'Username change approved';
          break;
        case 'name_change_rejected':
          actionDescription = 'Username change rejected';
          break;
        case 'warning':
          actionDescription = 'Warning issued';
          break;
        default:
          actionDescription = 'Moderation action';
      }

      return {
        id: log._id,
        actionType: log.actionType,
        actionDescription,
        publicNote: log.notes || null, // Only the public note, never the internal reason
        date: log.createdAt,
        expiresAt: log.expiresAt || null, // For temp bans
        durationString: log.durationString || null
      };
    });

    // 3. Get reports submitted by this user
    const submittedReports = await Report.find({
      'reportedBy.accountId': accountId
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Format submitted reports - only show basic status, no details
    const formattedReports = submittedReports.map(report => {
      // Simplified status for users
      let displayStatus;
      switch (report.status) {
        case 'pending':
        case 'reviewed': // Still being reviewed
          displayStatus = 'open';
          break;
        case 'dismissed':
          displayStatus = 'ignored';
          break;
        case 'action_taken':
          displayStatus = 'action_taken';
          break;
        default:
          displayStatus = 'open';
      }

      return {
        id: report._id,
        reportedUsername: report.reportedUser.username,
        reason: report.reason,
        status: displayStatus,
        date: report.createdAt
        // Intentionally NOT including: description, actionTaken, moderatorNotes
      };
    });

    // Calculate summary stats
    const totalEloRefunded = formattedRefunds.reduce((sum, r) => sum + r.amount, 0);
    const reportsResultingInAction = formattedReports.filter(r => r.status === 'action_taken').length;

    return res.status(200).json({
      eloRefunds: formattedRefunds,
      totalEloRefunded,
      moderationHistory: formattedModerationHistory,
      submittedReports: formattedReports,
      reportStats: {
        total: formattedReports.length,
        open: formattedReports.filter(r => r.status === 'open').length,
        ignored: formattedReports.filter(r => r.status === 'ignored').length,
        actionTaken: reportsResultingInAction
      }
    });

  } catch (error) {
    console.error('User moderation data error:', error);
    return res.status(500).json({ 
      message: 'An error occurred', 
      error: error.message 
    });
  }
}

