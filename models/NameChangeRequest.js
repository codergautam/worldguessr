import mongoose from 'mongoose';

/**
 * NameChangeRequest - Queue for users who need to change their username
 * 
 * This is used when a user:
 * 1. Is forced to change name due to inappropriate username report
 * 2. Submits a new name for review
 * 
 * The user cannot play until their new name is approved by a moderator.
 */
const nameChangeRequestSchema = new mongoose.Schema({
  // The user requesting the name change
  user: {
    accountId: { type: String, required: true },
    currentUsername: { type: String, required: true } // Their current (bad) username
  },

  // The new username they want
  requestedUsername: {
    type: String,
    required: true
  },

  // Status of the request
  status: {
    type: String,
    default: 'pending',
    enum: ['pending', 'approved', 'rejected']
  },

  // Why they need to change their name (from the original force change action)
  reason: {
    type: String,
    required: true
  },

  // Reference to the original report that triggered this
  originalReportId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Report',
    default: null
  },

  // Reference to the moderation log entry that forced the name change
  forcedByLogId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ModerationLog',
    default: null
  },

  // Reviewer information (when reviewed)
  reviewedBy: {
    accountId: { type: String, default: null },
    username: { type: String, default: null }
  },

  reviewedAt: {
    type: Date,
    default: null
  },

  // If rejected, the reason
  rejectionReason: {
    type: String,
    default: null
  },

  // How many times this user has had a name rejected (for this session)
  rejectionCount: {
    type: Number,
    default: 0
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp on save
nameChangeRequestSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Indexes for efficient querying
nameChangeRequestSchema.index({ status: 1, createdAt: 1 }); // For review queue (oldest first)
nameChangeRequestSchema.index({ 'user.accountId': 1, status: 1 });
nameChangeRequestSchema.index({ createdAt: -1 });

const NameChangeRequest = mongoose.models.NameChangeRequest || mongoose.model('NameChangeRequest', nameChangeRequestSchema);

export default NameChangeRequest;

