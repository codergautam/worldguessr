import mongoose from 'mongoose';

const dailyLeaderboardSchema = new mongoose.Schema({
  // Date this leaderboard represents (midnight UTC)
  date: {
    type: Date,
    required: true,
    index: true
  },

  // Mode: 'xp' or 'elo'
  mode: {
    type: String,
    required: true,
    enum: ['xp', 'elo'],
    index: true
  },

  // Pre-computed leaderboard data (top 100 users)
  leaderboard: [{
    userId: { type: String, required: true },
    username: { type: String, required: true },
    delta: { type: Number, required: true }, // XP or ELO gained today
    currentValue: { type: Number, required: true }, // Current total XP or ELO
    rank: { type: Number, required: true },
    countryCode: { type: String },
    supporter: { type: Boolean, default: false }
  }],

  // Total number of users who gained XP/ELO today (for stats)
  totalActiveUsers: {
    type: Number,
    default: 0
  },

  // When this leaderboard was computed
  computedAt: {
    type: Date,
    default: Date.now
  },

  // Cache expiry (for cleanup jobs)
  expiresAt: {
    type: Date,
    index: true
  }
});

// Compound index for fast lookups by date and mode
dailyLeaderboardSchema.index({ date: -1, mode: 1 });

// TTL index - automatically delete leaderboards older than 30 days
dailyLeaderboardSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const DailyLeaderboard = mongoose.models.DailyLeaderboard || mongoose.model('DailyLeaderboard', dailyLeaderboardSchema);

export default DailyLeaderboard;
