import mongoose from 'mongoose';

// Shape mirrors DailyChallengeScore.rounds — keeps the claim migration
// path a straight copy.
const guestRoundSchema = new mongoose.Schema({
  score: { type: Number, required: true },
  distance: { type: Number, default: null },
  timeMs: { type: Number, default: null },
  guessLat: { type: Number, default: null },
  guessLng: { type: Number, default: null },
  country: { type: String, default: null },
}, { _id: false });

const guestScoreSchema = new mongoose.Schema({
  guestId: { type: String, required: true },
  date: { type: String, required: true },
  score: { type: Number, required: true },
  totalTime: { type: Number, default: 0 },
  rounds: { type: [guestRoundSchema], default: [] },
  // Mirrors DailyChallengeScore — locks the (guestId, date) slot for DQ runs
  // without putting them on the leaderboard or in distribution stats.
  disqualified: { type: Boolean, default: false },
  submittedAt: { type: Date, default: Date.now },
});

// Replay prevention — one submission per guest per date.
guestScoreSchema.index({ guestId: 1, date: 1 }, { unique: true });

// TTL — 30 days. Aligned with the 30-entry cap on User.dailyHistory;
// anything older can't contribute to a streak claim anyway.
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;
guestScoreSchema.index({ submittedAt: 1 }, { expireAfterSeconds: THIRTY_DAYS_SECONDS });

export default mongoose.models.GuestScore ||
  mongoose.model('GuestScore', guestScoreSchema);
