import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  // Reporter information
  reportedBy: {
    // MongoDB _id of user who reported. null for an automatic report (`auto`)
    // and for a reporter whose account was deleted (purgeUserCascade).
    accountId: { type: String, default: null },
    username: { type: String, required: true }
  },

  // Filed by serverUtils/autoBan5k.js together with an automatic temp ban.
  // Sorts first in the mod queue. No default: human reports do not carry it.
  auto: { type: Boolean },

  // Reported user information
  reportedUser: {
    accountId: { type: String, required: true }, // MongoDB _id of reported user
    username: { type: String, required: true }
  },

  // Report details
  reason: {
    type: String,
    required: true,
    enum: ['inappropriate_username', 'cheating', 'other']
  },

  description: {
    type: String,
    required: true,
    maxlength: 500 // roughly 100 words
  },

  // Context - the game where the incident occurred
  gameId: {
    type: String,
    required: true
  },

  gameType: {
    type: String,
    required: true,
    enum: ['ranked_duel', 'unranked_multiplayer', 'private_multiplayer', '2v2']
  },

  // Team games only: was the reporter the reported player's teammate or
  // opponent? Stamped at submit time from the game doc (durable even if the
  // game is later purged) — triage signal for mods (teammate report reads as
  // griefing context, opponent report as cheating). null for 1v1/legacy.
  relationship: {
    type: String,
    default: null,
    enum: [null, 'teammate', 'opponent']
  },

  // Status tracking
  status: {
    type: String,
    default: 'pending',
    enum: ['pending', 'reviewed', 'dismissed', 'action_taken']
  },

  // Action taken on this report
  actionTaken: {
    type: String,
    default: null,
    enum: [
      null,
      'ignored',             // Report was ignored (counts against reporter)
      'resolved_no_action',  // Report was resolved but no action needed (neutral - doesn't affect reporter)
      'ban_permanent',       // User was permanently banned
      'ban_temporary',       // User was temporarily banned
      'force_name_change',   // User was forced to change name
      'user_deleted',        // Reported user deleted their account — auto-closed + reported games refunded (see purgeUserCascade)
      'warning'              // Warning issued (future use)
    ]
  },

  // Reference to the moderation log entry for this action
  moderationLogId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ModerationLog',
    default: null
  },

  // Moderator notes (for internal use)
  moderatorNotes: {
    type: String,
    default: ''
  },

  reviewedBy: {
    accountId: { type: String, default: null },
    username: { type: String, default: null }
  },

  reviewedAt: {
    type: Date,
    default: null
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for efficient querying
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ 'reportedUser.accountId': 1, createdAt: -1 });
reportSchema.index({ 'reportedUser.accountId': 1, status: 1 }); // For grouping pending reports by user
reportSchema.index({ 'reportedBy.accountId': 1, createdAt: -1 });
reportSchema.index({ gameId: 1 });

const Report = mongoose.models.Report || mongoose.model('Report', reportSchema);

export default Report;
