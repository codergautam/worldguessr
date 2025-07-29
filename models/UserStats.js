import mongoose from 'mongoose';

const userStatsSchema = new mongoose.Schema({
  // User identification
  userId: { 
    type: String, 
    required: true,
    index: true // For efficient user queries
  },
  
  // Timestamp for this data point
  timestamp: { 
    type: Date, 
    required: true,
    index: true // For time-based queries
  },
  
  // XP data
  totalXp: { 
    type: Number, 
    required: true,
    min: 0
  },
  xpRank: { 
    type: Number, 
    required: true,
    min: 1
  },
  
  // ELO data
  elo: { 
    type: Number, 
    required: true,
    min: 0,
    default: 1200 // Standard starting ELO
  },
  eloRank: { 
    type: Number, 
    required: true,
    min: 1
  },
  
  // Additional context (optional)
  triggerEvent: {
    type: String,
    enum: ['game_completed'],
    default: 'game_completed'
  },
  
  // Reference to the game that triggered this update (if applicable)
  gameId: {
    type: String,
    default: null
  },
  
  // Metadata
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Compound indexes for efficient querying
userStatsSchema.index({ userId: 1, timestamp: -1 }); // User's stats over time (descending)
userStatsSchema.index({ userId: 1, timestamp: 1 });  // User's stats over time (ascending)
userStatsSchema.index({ timestamp: -1, xpRank: 1 });  // Leaderboard snapshots by XP
userStatsSchema.index({ timestamp: -1, eloRank: 1 }); // Leaderboard snapshots by ELO

// Static methods for common queries
userStatsSchema.statics = {
  
  // Get user's stats progression over time
  async getUserProgression(userId, timeframe = '30d') {
    const timeframeDays = parseInt(timeframe.replace('d', ''));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeframeDays);
    
    return this.find({
      userId: userId,
      timestamp: { $gte: startDate }
    }).sort({ timestamp: 1 }).lean();
  },
  
  // Get user's latest stats
  async getLatestStats(userId) {
    return this.findOne({ userId: userId })
      .sort({ timestamp: -1 })
      .lean();
  },
  
  // Get multiple users' latest stats
  async getLatestStatsForUsers(userIds) {
    const pipeline = [
      { $match: { userId: { $in: userIds } } },
      { $sort: { userId: 1, timestamp: -1 } },
      { 
        $group: {
          _id: '$userId',
          latestStats: { $first: '$$ROOT' }
        }
      },
      { $replaceRoot: { newRoot: '$latestStats' } }
    ];
    
    return this.aggregate(pipeline);
  },
  
  // Get rank distribution at a specific time
  async getRankDistributionAt(timestamp, type = 'xp') {
    const rankField = type === 'xp' ? 'xpRank' : 'eloRank';
    const scoreField = type === 'xp' ? 'totalXp' : 'elo';
    
    return this.aggregate([
      { 
        $match: { 
          timestamp: { 
            $gte: new Date(timestamp.getTime() - 60000), // 1 minute window
            $lte: new Date(timestamp.getTime() + 60000)
          }
        }
      },
      {
        $group: {
          _id: `$${rankField}`,
          count: { $sum: 1 },
          avgScore: { $avg: `$${scoreField}` }
        }
      },
      { $sort: { _id: 1 } }
    ]);
  },
  
  // Get top performers over time period
  async getTopPerformers(timeframe = '7d', type = 'xp', limit = 10) {
    const timeframeDays = parseInt(timeframe.replace('d', ''));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeframeDays);
    
    const scoreField = type === 'xp' ? 'totalXp' : 'elo';
    
    const pipeline = [
      { $match: { timestamp: { $gte: startDate } } },
      { $sort: { userId: 1, timestamp: -1 } },
      { 
        $group: {
          _id: '$userId',
          latestStats: { $first: '$$ROOT' },
          earliestStats: { $last: '$$ROOT' }
        }
      },
      {
        $project: {
          userId: '$_id',
          currentScore: `$latestStats.${scoreField}`,
          previousScore: `$earliestStats.${scoreField}`,
          improvement: { 
            $subtract: [`$latestStats.${scoreField}`, `$earliestStats.${scoreField}`] 
          },
          currentRank: type === 'xp' ? '$latestStats.xpRank' : '$latestStats.eloRank'
        }
      },
      { $sort: { improvement: -1 } },
      { $limit: limit }
    ];
    
    return this.aggregate(pipeline);
  }
};

// Instance methods
userStatsSchema.methods.getProgressionSince = function(days) {
  const startDate = new Date(this.timestamp);
  startDate.setDate(startDate.getDate() - days);
  
  return this.constructor.find({
    userId: this.userId,
    timestamp: { $gte: startDate, $lte: this.timestamp }
  }).sort({ timestamp: 1 });
};

const UserStats = mongoose.model('UserStats', userStatsSchema);

export default UserStats;