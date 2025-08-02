import UserStats from '../../models/UserStats.js';
import User from '../../models/User.js';

class UserStatsService {
  
  /**
   * Record user stats after a game completion
   * @param {string} userId - User's account ID
   * @param {string} gameId - Game ID that triggered this update
   * @param {object} gameData - Additional game context
   */
  static async recordGameStats(userId, gameId, gameData = {}) {
    try {
      // Get user's current stats from User model
      const user = await User.findOne({ _id: userId });
      if (!user) {
        console.warn(`User not found for stats recording: ${userId}`);
        return null;
      }

      // Get current rankings
      const xpRank = await this.calculateXPRank(user.totalXp);
      const eloRank = await this.calculateELORank(user.elo || 1000);

      // Record the stats snapshot
      const statsEntry = await UserStats.create({
        userId: userId,
        timestamp: new Date(),
        totalXp: user.totalXp || 0,
        xpRank: xpRank,
        elo: user.elo || 1000,
        eloRank: eloRank,
        triggerEvent: 'game_completed',
        gameId: gameId
      });

      return statsEntry;
    } catch (error) {
      console.error('Error recording game stats:', error);
      return null;
    }
  }


  /**
   * Calculate user's XP rank among all users
   */
  static async calculateXPRank(userXP) {
    try {
      const higherXPCount = await User.countDocuments({
        totalXp: { $gt: userXP },
        banned: { $ne: true }
      });
      return higherXPCount + 1;
    } catch (error) {
      console.error('Error calculating XP rank:', error);
      return 1;
    }
  }

  /**
   * Calculate user's ELO rank among all users
   */
  static async calculateELORank(userElo) {
    try {
      const higherEloCount = await User.countDocuments({
        elo: { $gt: userElo },
        banned: { $ne: true }
      });
      return higherEloCount + 1;
    } catch (error) {
      console.error('Error calculating ELO rank:', error);
      return 1;
    }
  }

  /**
   * Get user's stats progression for charts
   */
  static async getUserProgression(userId, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const progression = await UserStats.find({
        userId: userId,
        timestamp: { $gte: startDate }
      }).sort({ timestamp: 1 }).lean();

      // Add calculated fields for frontend
      return progression.map((stat, index, arr) => {
        const prevStat = index > 0 ? arr[index - 1] : null;
        
        return {
          ...stat,
          xpGain: prevStat ? stat.totalXp - prevStat.totalXp : 0,
          eloChange: prevStat ? stat.elo - prevStat.elo : 0,
          rankImprovement: prevStat ? prevStat.xpRank - stat.xpRank : 0 // Positive = better rank
        };
      });
    } catch (error) {
      console.error('Error getting user progression:', error);
      return [];
    }
  }

  /**
   * Get leaderboard with recent changes
   */
  static async getLeaderboardWithChanges(type = 'xp', limit = 100) {
    try {
      const scoreField = type === 'xp' ? 'totalXp' : 'elo';
      const rankField = type === 'xp' ? 'xpRank' : 'eloRank';

      // Get latest stats for all users
      const pipeline = [
        { $sort: { userId: 1, timestamp: -1 } },
        {
          $group: {
            _id: '$userId',
            latestStats: { $first: '$$ROOT' },
            previousStats: { $nth: ['$$ROOT', 1] } // Second most recent
          }
        },
        { $sort: { [`latestStats.${rankField}`]: 1 } },
        { $limit: limit },
        {
          $project: {
            userId: '$_id',
            currentScore: `$latestStats.${scoreField}`,
            currentRank: `$latestStats.${rankField}`,
            previousRank: `$previousStats.${rankField}`,
            rankChange: {
              $subtract: ['$previousStats.' + rankField, '$latestStats.' + rankField]
            },
            lastUpdated: '$latestStats.timestamp'
          }
        }
      ];

      const leaderboard = await UserStats.aggregate(pipeline);

      // Enrich with user info
      const userIds = leaderboard.map(entry => entry.userId);
      const users = await User.find({
        secret: { $in: userIds }
      }).select('secret username').lean();

      const userMap = new Map(users.map(u => [u.secret, u.username]));

      return leaderboard.map(entry => ({
        ...entry,
        username: userMap.get(entry.userId) || 'Unknown User',
        rankChangeIcon: entry.rankChange > 0 ? '📈' : entry.rankChange < 0 ? '📉' : '➡️'
      }));

    } catch (error) {
      console.error('Error getting leaderboard with changes:', error);
      return [];
    }
  }

  /**
   * Clean up old stats data (keep last 365 days)
   */
  static async cleanupOldStats(daysToKeep = 365) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await UserStats.deleteMany({
        timestamp: { $lt: cutoffDate }
      });

      console.log(`Cleaned up ${result.deletedCount} old stats entries`);
      return result.deletedCount;
    } catch (error) {
      console.error('Error cleaning up old stats:', error);
      return 0;
    }
  }

  /**
   * Get stats summary for a user
   */
  static async getUserStatsSummary(userId) {
    try {
      // Get latest stats
      const latestStats = await UserStats.findOne({ userId })
        .sort({ timestamp: -1 })
        .lean();

      if (!latestStats) {
        return null;
      }

      // Get stats from 7 days ago for comparison
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const weekAgoStats = await UserStats.findOne({
        userId,
        timestamp: { $lte: weekAgo }
      }).sort({ timestamp: -1 }).lean();

      // Get stats from 30 days ago
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);

      const monthAgoStats = await UserStats.findOne({
        userId,
        timestamp: { $lte: monthAgo }
      }).sort({ timestamp: -1 }).lean();

      return {
        current: latestStats,
        weeklyChange: weekAgoStats ? {
          xp: latestStats.totalXp - weekAgoStats.totalXp,
          elo: latestStats.elo - weekAgoStats.elo,
          xpRank: weekAgoStats.xpRank - latestStats.xpRank,
          eloRank: weekAgoStats.eloRank - latestStats.eloRank
        } : null,
        monthlyChange: monthAgoStats ? {
          xp: latestStats.totalXp - monthAgoStats.totalXp,
          elo: latestStats.elo - monthAgoStats.elo,
          xpRank: monthAgoStats.xpRank - latestStats.xpRank,
          eloRank: monthAgoStats.eloRank - latestStats.eloRank
        } : null
      };
    } catch (error) {
      console.error('Error getting user stats summary:', error);
      return null;
    }
  }
}

export default UserStatsService;