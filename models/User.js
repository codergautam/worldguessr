import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: false,
  },
  appleId: {
    type: String,
    required: false,
  },
  secret: {
    type: String,
    required: true,
    unique: true,
  },
  // Google profile picture (captured at Google login; used for forum avatar)
  avatarUrl: {
    type: String,
    default: null,
  },
  username: {
    type: String,
    required: false,
  },
  // Forum-normalized username, set ONLY on grandfathered accounts whose name
  // Discourse rewrites (underscore prefix/suffix/runs) so new-name claims can
  // detect forum-level collisions. Names claimed after 2026-07 must be
  // forum-stable (serverUtils/forumUsername.js) and never set this; renames
  // clear it. Backfill: scripts/backfillUsernameNorm.js.
  usernameNorm: {
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
  countryCode: {
    type: String,
    default: null,
    validate: {
      validator: function(v) {
        // Allow null or empty string (user opted out) or valid ISO 3166-1 alpha-2 country codes
        if (v === null || v === '') return true;
        return /^[A-Z]{2}$/.test(v);
      },
      message: props => `${props.value} is not a valid ISO 3166-1 alpha-2 country code`
    }
  },
  streak: {
    type: Number,
    default: 0,
  },
  dailyStreak: {
    type: Number,
    default: 0,
  },
  dailyStreakBest: {
    type: Number,
    default: 0,
  },
  lastDailyDate: {
    type: String,
    default: null,
  },
  dailyGraceUsedDates: {
    type: [String],
    default: [],
  },
  dailyHistory: {
    type: [{
      date: { type: String },
      score: { type: Number },
      rank: { type: Number, default: null },
    }],
    default: [],
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  // Written on ws connect AND disconnect — powers the friends list
  // "Offline · last seen Xh ago" (unlike lastLogin, which only marks session
  // start and feeds the streak logic — do not conflate the two).
  // Deliberately NO default: mongoose applies defaults at hydration, so a
  // Date.now default makes every legacy user read "last seen just now" on
  // every query. Absent ⇒ sendFriendData falls back to lastLogin.
  lastSeen: {
    type: Date
  },
  // Privacy opt-out (profile view setting): friends see plain "Offline"
  // instead of the last-seen time. Enforced server-side in sendFriendData.
  hideLastSeen: {
    type: Boolean,
    default: false
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
    // 0 is falsy and voids the ranked elo/save gates (ws.js, Game.js);
    // every write path clamps to >= 1, this backstops document validation.
    min: 1,
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
  // 2v2 team mode stats (unranked, no ELO). Defaults keep all existing docs valid.
  team2v2_wins: {
    type: Number,
    default: 0,
  },
  team2v2_losses: {
    type: Number,
    default: 0,
  },
  team2v2_tied: {
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
  },

  // ===== SELF-SERVICE ACCOUNT DELETION (30-day grace period) =====
  // When a user requests deletion, scheduledDeletionAt is set to (now + 30 days)
  // and the user is logged out instantly. Re-login within the window offers a
  // "Restore" prompt (api/cancelDeletion.js). The cron purge (cron.js ->
  // serverUtils/purgeUserCascade.js) hard-deletes the account + all associated
  // data once scheduledDeletionAt has passed. null = not pending.
  // WARNING: do NOT turn this into a TTL index (expireAfterSeconds) — a TTL would
  // drop ONLY the User row and orphan every other collection. The purge MUST run
  // the full cascade.
  scheduledDeletionAt: {
    type: Date,
    default: null
  },
  deletionRequestedAt: {
    type: Date,
    default: null
  }
});

// Index for email lookups during Google OAuth login
userSchema.index({ email: 1 });
// Index for Apple Sign In lookups
userSchema.index({ appleId: 1 });
// Index for finding users with expired temp bans
userSchema.index({ banned: 1, banType: 1, banExpiresAt: 1 });
// Index for finding users with pending name changes
userSchema.index({ pendingNameChange: 1 });
// Case-insensitive username index for fast lookups (replaces slow $regex queries)
// Use with .collation({ locale: 'en', strength: 2 }) on queries
userSchema.index({ username: 1 }, { collation: { locale: 'en', strength: 2 } });
// Plain case-sensitive index for queries that don't use collation (fallback)
userSchema.index({ username: 1 });
// Sparse: only the ~31k grandfathered accounts with forum-unstable names carry
// usernameNorm, so this index is tiny despite the collection size
userSchema.index({ usernameNorm: 1 }, { sparse: true });

// Export collation config for consistent usage across queries
export const USERNAME_COLLATION = { locale: 'en', strength: 2 };

// ===== LEADERBOARD PERFORMANCE INDEXES =====
// All-time XP leaderboard - critical for sorting millions of users by XP
userSchema.index({ totalXp: -1 });
// All-time ELO leaderboard - critical for sorting millions of users by ELO
userSchema.index({ elo: -1 });
// Compound indexes for filtering banned/pending users while sorting (covers common query patterns)
userSchema.index({ banned: 1, pendingNameChange: 1, totalXp: -1 });
userSchema.index({ banned: 1, pendingNameChange: 1, elo: -1 });

// ===== ACCOUNT DELETION INDEXES =====
// Background purge query: { scheduledDeletionAt: { $ne: null, $lte: now } }
userSchema.index({ scheduledDeletionAt: 1 });
// Reverse-friendship lookups — the deletion cascade $pulls a user out of every
// other user's friends/sentReq/receivedReq arrays; without these multikey indexes
// each $pull full-scans the entire Users collection (a primary delete-timeout cause).
userSchema.index({ friends: 1 });
userSchema.index({ sentReq: 1 });
userSchema.index({ receivedReq: 1 });

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
