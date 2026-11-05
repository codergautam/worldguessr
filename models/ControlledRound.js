import mongoose from 'mongoose';

// Round ownership and lifecycle are adapted from Matheus Brito's #150 work
// (commit 5734f1538fbcb3aad3153e29bc50592eb2b52b84).
const controlledRoundSchema = new mongoose.Schema({
  roundId: { type: String, required: true, unique: true },
  ownerId: { type: String, required: true },
  gameId: { type: String, required: true },
  mode: { type: String, required: true },
  answer: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  maxDist: { type: Number, required: true },
  hintUsed: { type: Boolean, default: false },
  status: { type: String, enum: ['open', 'guessed', 'replaced'], default: 'open' },
  revision: { type: Number, default: 0 },
  createdAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  result: { type: mongoose.Schema.Types.Mixed, default: null },
}, { versionKey: false });

export default mongoose.models.ControlledRound || mongoose.model('ControlledRound', controlledRoundSchema);
