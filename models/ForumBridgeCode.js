import mongoose from 'mongoose';

// One-time codes that carry a game session from the CrazyGames embed
// (partitioned storage) to top-level worldguessr.com so forum SSO works.
// Codes are single-use (deleted on exchange) and expire via TTL index.
const forumBridgeCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
  },
  secret: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 120, // seconds — Mongo TTL sweep; exchange also enforces its own cutoff
  },
});

export default mongoose.models.ForumBridgeCode ||
  mongoose.model('ForumBridgeCode', forumBridgeCodeSchema);
