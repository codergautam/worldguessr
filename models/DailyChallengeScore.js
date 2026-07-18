import mongoose from 'mongoose';

const roundSchema = new mongoose.Schema({
  score: { type: Number, required: true },
  distance: { type: Number, default: null },
  timeMs: { type: Number, default: null },
  guessLat: { type: Number, default: null },
  guessLng: { type: Number, default: null },
  country: { type: String, default: null },
}, { _id: false });

const dailyChallengeScoreSchema = new mongoose.Schema({
  date: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: { type: String, required: true },
  score: { type: Number, required: true },
  totalTime: { type: Number, default: 0 },
  rounds: { type: [roundSchema], default: [] },
  // Tab-switched mid-game: record exists to lock the date (one play per day),
  // but the run is excluded from the leaderboard and not counted in stats.
  disqualified: { type: Boolean, default: false },
  // Moderation shadow: set when the owner is banned — at submit time for new
  // runs, or by takeAction's ban-time scrub for pre-ban rows. The run stays
  // real to its owner (score, rounds, streak, game history all stand) but
  // never surfaces on the public top-10, even after an unban.
  hidden: { type: Boolean, default: false },
  submittedAt: { type: Date, default: Date.now },
});

dailyChallengeScoreSchema.index({ date: 1, userId: 1 }, { unique: true });
// One compound index for every daily read path: the { date, score desc,
// submittedAt asc } prefix fully orders the leaderboard sort, and every
// field the exact-rank counts touch (serverUtils/dailyRank.js — score and
// submittedAt bounds, disqualified/hidden, the fresh-submit userId $ne)
// lives in the key, so countDocuments resolves from index keys without
// fetching documents. Supersedes { date: 1, score: -1 } — drop the old
// date_1_score_-1 index manually, but ONLY after this one exists in prod
// (autoIndex builds it on boot, never removes the old one; dropping first
// would leave the leaderboard and rank counts scanning the collection).
dailyChallengeScoreSchema.index({ date: 1, score: -1, submittedAt: 1, disqualified: 1, hidden: 1, userId: 1 });
// Deletion cascade: per-user purge. The {date,userId} prefix can't serve a
// userId-only deleteMany, so this avoids a full collection scan.
dailyChallengeScoreSchema.index({ userId: 1 });

export default mongoose.models.DailyChallengeScore ||
  mongoose.model('DailyChallengeScore', dailyChallengeScoreSchema);
