import mongoose from 'mongoose';

// Per-period counters for bot-earn and consumable-purchase limits. These are
// progress numbers, NOT money — no balance or payment state lives here.
//
// The TTL index below is SAFE precisely because of that. Whether a grant lands
// is decided solely by StampLedger's unique idempotencyKey index, so a period
// doc expiring (or being manually deleted) can never cause a double-pay: the
// ledger still holds the key and still rejects the duplicate insert.
//
// Payment state belongs exclusively to StampLedger. Two sources of truth for
// "was this paid" would eventually disagree.
const stampQuestsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // 'day' is the only type anything writes. The weekly quests were removed with
  // the rest of the quest system, so 'week' is no longer valid to CREATE — but
  // leftover week documents are still queried by cron.js's legacy drain until
  // the TTL takes them. That works because `enum` is a document validator, not
  // a query cast: filtering on a value the enum no longer allows is fine.
  periodType: {
    type: String,
    required: true,
    enum: ['day'],
  },
  // UTC period identifier, e.g. '2026-08-13'.
  periodKey: {
    type: String,
    required: true,
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
  // Ad-free passes purchased this period (api/stampShop.js). Claimed
  // atomically BEFORE the charge and released if the charge does not land, so
  // concurrent purchases can never exceed the daily cap.
  adFreePassesAwarded: {
    type: Number,
    default: 0,
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
// Period-wide expiry sweeps and analytics.
stampQuestsSchema.index({ periodType: 1, periodKey: 1 });
// TTL — safe, see the header comment.
stampQuestsSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const StampQuests = mongoose.models.StampQuests || mongoose.model('StampQuests', stampQuestsSchema);

export default StampQuests;
