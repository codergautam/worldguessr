import mongoose from 'mongoose';

// Singleton config docs, keyed by `key` (e.g. 'leagues' holds the league tier
// table). One doc per config topic, not one doc per tier.
//
// League cutoffs are re-anchored to live population PERCENTILES once per season
// by a cron job, which is why they cannot be hardcoded alone: the rating
// distribution shifts as the player base grows.
//
// READERS MUST FALL BACK, NEVER THROW. If this doc is missing, empty, or
// malformed (an unparseable tiers array, non-numeric bounds, a partial write
// caught mid-update), the reader falls back to the hardcoded tier table in code
// and continues. A config collection must never be able to take down the rank
// display or the matchmaker.
const tierSchema = new mongoose.Schema({
  name: { type: String },
  min: { type: Number },
  max: { type: Number },
  color: { type: String },
  emoji: { type: String },
}, { _id: false });

const ratingConfigSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
  },
  tiers: {
    type: [tierSchema],
    default: [],
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

ratingConfigSchema.index({ key: 1 }, { unique: true });

const RatingConfig = mongoose.models.RatingConfig || mongoose.model('RatingConfig', ratingConfigSchema);

export default RatingConfig;
