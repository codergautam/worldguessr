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
  submittedAt: { type: Date, default: Date.now },
});

dailyChallengeScoreSchema.index({ date: 1, userId: 1 }, { unique: true });
dailyChallengeScoreSchema.index({ date: 1, score: -1 });

export default mongoose.models.DailyChallengeScore ||
  mongoose.model('DailyChallengeScore', dailyChallengeScoreSchema);
