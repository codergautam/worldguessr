import mongoose from 'mongoose';

const BUCKET_COUNT = 51;
const ROUNDS_PER_DAY = 5;

const dailyChallengeStatsSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true },
  totalPlays: { type: Number, default: 0 },
  anonPlays: { type: Number, default: 0 },
  totalScore: { type: Number, default: 0 },
  buckets: {
    type: [Number],
    default: () => new Array(BUCKET_COUNT).fill(0),
  },
  // Per-round running sums so we can compute per-round global averages
  // (avg = roundScoreSums[i] / totalPlays).
  roundScoreSums: {
    type: [Number],
    default: () => new Array(ROUNDS_PER_DAY).fill(0),
  },
  updatedAt: { type: Date, default: Date.now },
});

dailyChallengeStatsSchema.index({ date: 1 });

export const DAILY_BUCKET_COUNT = BUCKET_COUNT;
export const DAILY_ROUNDS_PER_DAY = ROUNDS_PER_DAY;
export const DAILY_MAX_SCORE = 25000; // full 5-round daily, 5000 pts/round

export function bucketIndexForScore(score) {
  const clamped = Math.max(0, Math.min(DAILY_MAX_SCORE, score || 0));
  const width = DAILY_MAX_SCORE / (BUCKET_COUNT - 1);
  return Math.min(BUCKET_COUNT - 1, Math.floor(clamped / width));
}

export default mongoose.models.DailyChallengeStats ||
  mongoose.model('DailyChallengeStats', dailyChallengeStatsSchema);
