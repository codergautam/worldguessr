import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  // Reporter information
  reportedBy: {
    accountId: { type: String, required: true }, // MongoDB _id of user who reported
    username: { type: String, required: true }
  },

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
    enum: ['ranked_duel', 'unranked_multiplayer', 'private_multiplayer']
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
      'ignored',           // Report was ignored (counts against reporter)
      'ban_permanent',     // User was permanently banned
      'ban_temporary',     // User was temporarily banned
      'force_name_change', // User was forced to change name
      'warning'            // Warning issued (future use)
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
