import mongoose from 'mongoose';

/**
 * ModerationLog - Permanent record of all moderation actions
 *
 * This model stores:
 * - Ban actions (permanent and temporary)
 * - Unban actions
 * - Force name change actions
 * - Name change approvals/rejections
 *
 * NOTHING IS EVER DELETED - all records are permanent for audit purposes
 */
const moderationLogSchema = new mongoose.Schema({
  // The user who was moderated
  targetUser: {
    accountId: { type: String, required: true },
    username: { type: String, required: true } // Username at time of action
  },

  // The moderator who took the action
  moderator: {
    accountId: { type: String, required: true },
    username: { type: String, required: true }
  },

  // Type of action taken
  actionType: {
    type: String,
    required: true,
    enum: [
      'ban_permanent',      // Permanent ban
      'ban_temporary',      // Temporary ban with duration
      'unban',              // Lifted a ban
      'force_name_change',  // Force user to change name
      'name_change_approved', // Approved a pending name change
      'name_change_rejected', // Rejected a pending name change
      'name_change_manual',   // User-initiated name change (voluntary)
      'report_ignored',     // Report was ignored (counts against reporter)
      'report_resolved',    // Report was resolved without action (neutral)
      'warning'             // Warning issued (future use)
    ]
  },

  // Duration for temporary bans (in milliseconds)
  duration: {
    type: Number,
    default: null
  },

  // Human-readable duration string
  durationString: {
    type: String,
    default: null // e.g., "7 days", "30 days", "1 hour"
  },

  // When the action expires (for temp bans)
  expiresAt: {
    type: Date,
    default: null
  },

  // Internal reason (only visible to staff)
  reason: {
    type: String,
    required: true
  },

  // Related report ID(s) if action was taken due to report
  relatedReports: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Report'
  }],

  // For name changes - store the old and new names
  nameChange: {
    oldName: { type: String, default: null },
    newName: { type: String, default: null }
  },

  // Additional notes from moderator
  notes: {
    type: String,
    default: ''
  },

  // ELO refund details (for bans)
  eloRefund: {
    totalRefunded: { type: Number, default: 0 },
    opponentsAffected: { type: Number, default: 0 },
    gamesProcessed: { type: Number, default: 0 },
    refundDetails: { type: Map, of: Number, default: {} } // { accountId: refundAmount }
  },

  // Timestamp
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for efficient querying
moderationLogSchema.index({ 'targetUser.accountId': 1, createdAt: -1 });
moderationLogSchema.index({ 'moderator.accountId': 1, createdAt: -1 });
moderationLogSchema.index({ actionType: 1, createdAt: -1 });
moderationLogSchema.index({ createdAt: -1 });

const ModerationLog = mongoose.models.ModerationLog || mongoose.model('ModerationLog', moderationLogSchema);

export default ModerationLog;

