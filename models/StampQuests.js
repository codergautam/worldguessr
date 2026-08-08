import mongoose from 'mongoose';

// Per-period DERIVED COUNTERS for the quest system. These are progress numbers,
// NOT money — no balance and no "already paid" flag lives here.
//
// The TTL index below is SAFE precisely because of that. Whether a grant lands
// is decided solely by StampLedger's unique idempotencyKey index, so a period
// doc expiring (or being manually deleted) can never cause a double-pay: the
// ledger still holds the key and still rejects the duplicate insert.
//
// This deliberately has NO questsAwarded / firstWinAwarded fields. Payment state
// belongs to exactly one collection. Two sources of truth for "was this paid"
// would eventually disagree, and reconciling them costs more than the field
// saves.
const stampQuestsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  periodType: {
    type: String,
    required: true,
    enum: ['day', 'week'],
  },
  // UTC period identifier, e.g. '2026-08-06' for a day or '2026-W32' for a week.
  periodKey: {
    type: String,
    required: true,
  },
  gamesPlayed: {
    type: Number,
    default: 0,
  },
  gamesWon: {
    type: Number,
    default: 0,
  },
  botGamesPlayed: {
    type: Number,
    default: 0,
  },
  // Stamps already handed out for bot games this period — the cap counter, so a
  // player cannot farm bots indefinitely inside one period.
  botStampsAwarded: {
    type: Number,
    default: 0,
  },
  // Beat a higher-rated opponent at least once this period.
  upset: {
    type: Boolean,
    default: false,
  },
  // Distinct UTC day keys touched inside this period (weekly "play N days" quest).
  daysPlayed: {
    type: [String],
    default: [],
  },
  expiresAt: {
    type: Date,
  },
}, {
  // minimize: false — keep zero-valued/empty sub-objects on disk instead of
  // letting mongoose strip them, so an upsert never has to distinguish "field
  // absent" from "field is zero".
  minimize: false,
});

// The upsert target: one doc per (user, period type, period).
stampQuestsSchema.index({ userId: 1, periodType: 1, periodKey: 1 }, { unique: true });
// Period-wide sweeps and analytics ("everyone active this week").
stampQuestsSchema.index({ periodType: 1, periodKey: 1 });
// TTL — safe, see the header comment.
stampQuestsSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const StampQuests = mongoose.models.StampQuests || mongoose.model('StampQuests', stampQuestsSchema);

export default StampQuests;
