import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: false,
  },
  secret: {
    type: String,
    required: true,
    unique: true,
  },
  username: {
    type: String,
    required: false,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  totalXp: {
    type: Number,
    default: 0,
  },
  totalGamesPlayed: {
    type: Number,
    default: 0,
  },
  
  // ===== MODERATION FIELDS =====
  // Ban status - replaces simple banned: boolean
  banned: {
    type: Boolean,
    default: false,
  },
  banType: {
    type: String,
    enum: ['none', 'permanent', 'temporary'],
    default: 'none'
  },
  banExpiresAt: {
    type: Date,
    default: null // null for permanent bans, date for temp bans
  },
  banReason: {
    type: String,
    default: null // INTERNAL reason, NEVER shown to user - for mod reference only
  },
  banPublicNote: {
    type: String,
    default: null // Public note shown to user explaining their ban
  },
  
  // Pending name change - user must change name before playing
  pendingNameChange: {
    type: Boolean,
    default: false
  },
  pendingNameChangeReason: {
    type: String,
    default: null // INTERNAL reason, NEVER shown to user - for mod reference only
  },
  pendingNameChangePublicNote: {
    type: String,
    default: null // Public note shown to user explaining why they need to change name
  },
  
  // Reporter statistics - track quality of reports
  reporterStats: {
    helpfulReports: { type: Number, default: 0 },   // Reports that led to action
    unhelpfulReports: { type: Number, default: 0 }  // Reports that were ignored/dismissed
  },
  // ===== END MODERATION FIELDS =====
  
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  sentReq: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  receivedReq: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  allowFriendReq: {
    type: Boolean,
    default: true,
  },
  timeZone: {
    type: String,
    default: 'America/Los_Angeles',
  },
  streak: {
    type: Number,
    default: 0,
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  firstLoginComplete: {
    type: Boolean,
    default: false
  },
  hearted_maps: {
    type: Map,
    of: Boolean,
    default: {},
  },
  staff: {
    type: Boolean,
    default: false
  },
  canMakeClues: {
    type: Boolean,
    default: false
  },
  rated_clues: {
    type: Map,
    of: Number,
    default: {},
  },
  instant_accept_maps: {
    type: Boolean,
    default: false,
  },
  crazyGamesId: {
    type: String,
    default: "",
  },
  supporter: {
    type: Boolean,
    default: false,
  },
  elo: {
    type: Number,
    default: 1000,
  },
  elo_today: {
    type: Number,
    default: 0,
  },
  elo_history: {
    type: Array,
    default: [],
  },
  lastEloHistoryUpdate: {
    type: Date,
    default: 0,
  },
  duels_wins: {
    type: Number,
    default: 0,
  },
  duels_losses: {
    type: Number,
    default: 0,
  },
  duels_tied: {
    type: Number,
    default: 0
  },
  lastNameChange: {
    type: Date,
    default: 0
  },
  profileViews: {
    type: Number,
    default: 0
  }
});

// Index for finding users with expired temp bans
userSchema.index({ banned: 1, banType: 1, banExpiresAt: 1 });
// Index for finding users with pending name changes
userSchema.index({ pendingNameChange: 1 });

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
