import mongoose from 'mongoose';

const gameRoundSchema = new mongoose.Schema({
  roundId: { type: String, required: true, unique: true },
  sessionId: { type: String, required: true, index: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  panoId: { type: String, required: true },
  provider: { type: String, default: 'google' },
  country: { type: String, default: null },
  maxDist: { type: Number, default: 20000 },
  official: { type: Boolean, default: false },
  countryGuesser: { type: Boolean, default: false },
  countryGuessrSubMode: { type: String, default: null },
  dailyDate: { type: String, default: null, index: true },
  dailyIndex: { type: Number, default: null },
  dailyMetas: { type: Array, default: null },
  createdAt: { type: Date, required: true, default: Date.now },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  status: { type: String, enum: ['open', 'closed', 'replaced'], default: 'open', index: true },
  guessedAt: { type: Date, default: null },
  guessLat: { type: Number, default: null },
  guessLng: { type: Number, default: null },
  durationMs: { type: Number, default: null },
  distanceKm: { type: Number, default: null },
  score: { type: Number, default: null },
  gameSavedAt: { type: Date, default: null },
  hintUsed: { type: Boolean, default: false },
}, { versionKey: false });

export default mongoose.models.GameRound || mongoose.model('GameRound', gameRoundSchema);
