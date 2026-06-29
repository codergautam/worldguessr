import mongoose from 'mongoose';

// Shape mirrors User.dailyHistory entries so the claim merge is a straight
// copy with no field renaming.
const guestHistoryEntrySchema = new mongoose.Schema({
  date: { type: String, required: true },
  score: { type: Number, required: true },
  rank: { type: Number, default: null },
}, { _id: false });

// Daily namespace for the guest profile. Held under `daily.*` so future
// features (achievements, general stats) can be added in sibling namespaces
// without migrating the existing fields.
const guestDailySchema = new mongoose.Schema({
  streak: { type: Number, default: 0 },
  streakBest: { type: Number, default: 0 },
  lastDate: { type: String, default: null },
  history: { type: [guestHistoryEntrySchema], default: [] },
}, { _id: false });

const guestProfileSchema = new mongoose.Schema({
  guestId: { type: String, required: true, unique: true },
  daily: { type: guestDailySchema, default: () => ({}) },
  claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  claimedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  // TTL anchor — bumped to (now + 180d) on every write so active profiles
  // don't expire. Follows the pattern in models/DailyLeaderboard.js.
  expiresAt: { type: Date, required: true },
});

guestProfileSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const GUEST_PROFILE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

export default mongoose.models.GuestProfile ||
  mongoose.model('GuestProfile', guestProfileSchema);
