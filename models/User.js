import mongoose from 'mongoose';
// Re-exported so the many callers that already import User do not each need a
// second import for the one constant they use beside it. The definition and the
// reasoning live in components/utils/ratingFlags.js.
import { STARTING_ELO } from '../components/utils/ratingFlags.js';
export { STARTING_ELO };

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
  // LIFETIME daily-days-played counter. dailyHistory above is a rolling
  // 30-entry display window, so history.length saturates at 30 — deriving
  // "days played" from it produced impossible stats (30 days played, 36
  // streak). Incremented once per locked date by /submit (both the played
  // and DQ branches — a DQ advances the streak, so it must count as a day
  // played or the impossibility recurs); legacy users are seeded there from
  // max(window length, streaks) on their next submit.
  dailyDaysPlayed: {
    type: Number,
    default: 0,
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
  // Ranked-queue preference (Voyager+ only, enforced at queue time): after the
  // 10s ELO-range widening, only widen down to the Voyager floor instead of
  // everyone — the player is matched exclusively with Voyagers and Nomads.
  // Default ON (user ruling July 27): every Voyager+ gets the protected pool
  // unless they opt out. Safe to default for the whole collection because the
  // queue stamp requires elo >= voyager.min — for everyone below, the stored
  // true is inert until they rank up, at which point it arms itself.
  strictMatchmaking: {
    type: Boolean,
    default: true
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
  // RETIRED: the paid supporter tier was discontinued and has zero members.
  // Every read/render/transport path for it is gone (API responses, websocket
  // payloads, web + mobile UI); the Ad-Free Pass (adFreeUntil) replaces it.
  // The field is left dormant on purpose so a rollback never has to restore a
  // column. Slated for removal in a later cleanup once that window closes.
  supporter: {
    type: Boolean,
    default: false,
  },
  elo: {
    type: Number,
    default: STARTING_ELO,
    // 0 is falsy and voids the ranked elo/save gates (ws.js, Game.js);
    // every write path clamps to >= 1, this backstops document validation.
    //
    // Deliberately still 1 and NOT the v2 RATING_FLOOR (100): mongoose runs
    // this validator on document saves, and tightening it would start
    // rejecting saves of any legacy doc that predates the migration rather
    // than fixing it. The real v2 floor is enforced at every write path by
    // clampRating().
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

  // ===== RANKED SEASON / ECONOMY FIELDS =====
  // Count of RATED HUMAN games only. Drives both the K-factor schedule and the
  // placement trigger. Deliberately NOT duels_played — that counter includes bot
  // games and the entire legacy era, so it would mis-classify veterans.
  // The migration backfills this to min(duels_wins + duels_losses + duels_tied, 70).
  // A default of 0 landing on an EXISTING account would make that account
  // placement-eligible again and destroy its migrated rating, so the backfill
  // must cover every pre-existing doc before placements go live.
  ratedGames: {
    type: Number,
    default: 0,
  },
  lastRankedAt: {
    type: Date,
    default: null,
  },
  // Pre-migration ELO snapshot: the rollback anchor. Never written after the
  // one-time migration stamps it.
  elo_s0: {
    type: Number,
    default: null,
  },
  seasonPeakElo: {
    type: Number,
    default: null,
  },
  seasonPeakLeague: {
    type: String,
    default: null,
  },
  // Season 1 first-login notice bookkeeping. null = the account has never been
  // shown the migration modal. Stamped ONCE by api/eloNoticeAck.js when the user
  // dismisses it, and that stamp is what makes the modal a once-per-account
  // event rather than a once-per-device one.
  //
  // Deliberately a Date and not a Boolean: it doubles as the "when did this
  // account first come back after migration" signal for the 14-day monitoring
  // window, and a re-run of the notice for a later season only needs the field
  // cleared, not re-typed.
  //
  // The read path (api/googleAuth.js) also requires elo_s0 != null, so a null
  // here on an account created AFTER migration never produces a notice.
  eloNoticeSeenAt: {
    type: Date,
    default: null,
  },
  // Permanent "was here before the saved ranked era" badge, stamped once by
  // scripts/grantSeason1Compensation.js for accounts created before 2025-08-01.
  //
  // MUST be declared here. The grant script writes it via bulkWrite $set, and
  // mongoose runs bulkWrite under strict mode by default, so an undeclared path
  // is stripped from the update SILENTLY: the script would report badges it
  // never wrote and the notice modal's OG line would never render, with no
  // error anywhere. Both the grant script and the modal abort on its absence.
  ogAccount: {
    type: Boolean,
    default: false,
  },
  // Soft currency balance. min: 0 is a DOCUMENT-VALIDATION backstop only and is
  // BYPASSED by updateOne($inc) — mongoose does not run schema validators on
  // update operators. The real guard against going negative is the conditional
  // { stamps: { $gte: price } } filter on the debit path's findOneAndUpdate.
  stamps: {
    type: Number,
    default: 0,
    min: 0,
  },
  cosmetics: {
    owned: { type: [String], default: [] },
    equipped: {
      background: { type: String, default: null },
      nameGlow: { type: String, default: null },
      markerSkin: { type: String, default: null },
    },
    emoteOrder: { type: [String], default: [] },
  },
  adFreeUntil: {
    type: Date,
    default: null,
  },
  // ===== END RANKED SEASON / ECONOMY FIELDS =====

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

// Export collation config for consistent usage across queries
export const USERNAME_COLLATION = { locale: 'en', strength: 2 };

// ===== LEADERBOARD PERFORMANCE INDEXES =====
// All-time XP leaderboard - critical for sorting millions of users by XP
userSchema.index({ totalXp: -1 });
// All-time ELO leaderboard - critical for sorting millions of users by ELO
userSchema.index({ elo: -1 });
// Compound indexes for filtering banned/pending users while sorting (covers common query patterns)
userSchema.index({ banned: 1, pendingNameChange: 1, totalXp: -1 });
// ELO board index, ESR order (equality: banned+pendingNameChange, sort: elo,
// range: lastRankedAt). The trailing lastRankedAt exists for the ranked
// activity window (api/leaderboard.js activeRankedFilter, live 14 days after
// MIGRATION_AT): the top-100 walk and the "better users" count both filter on
// it, and without it in the index every dormant high-elo account forces a
// document fetch — at millions of users that walks past maxTimeMS(5000).
// Every prefix query the old {banned, pendingNameChange, elo:-1} index served
// is served identically by this one; drop the old index from the DB manually
// (mongoose never auto-drops).
userSchema.index({ banned: 1, pendingNameChange: 1, elo: -1, lastRankedAt: 1 });

// ===== ACCOUNT DELETION INDEXES =====
// Background purge query: { scheduledDeletionAt: { $ne: null, $lte: now } }
userSchema.index({ scheduledDeletionAt: 1 });
// Reverse-friendship lookups — the deletion cascade $pulls a user out of every
// other user's friends/sentReq/receivedReq arrays; without these multikey indexes
// each $pull full-scans the entire Users collection (a primary delete-timeout cause).
userSchema.index({ friends: 1 });
userSchema.index({ sentReq: 1 });
userSchema.index({ receivedReq: 1 });

// ===== COSMETICS INDEX =====
// Multikey index for ownership checks ("who owns this sku") and for the equip
// path's "does this user already own it" guard.
// NOTE: deliberately NO index on `stamps` — no leaderboard sorts by it, and User
// is the hottest collection in the deployment (~2M docs); every extra index is
// paid on every write.
userSchema.index({ 'cosmetics.owned': 1 });

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
