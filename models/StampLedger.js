import mongoose from 'mongoose';

// Append-only audit trail for every stamp (soft currency) movement — earn,
// spend, refund, admin grant. This is the SOURCE OF TRUTH for where currency
// came from and where it went; User.stamps is only the running total.
//
// NEVER add a TTL index to this collection. Expiring rows would erase the only
// record of where a user's currency came from, which makes fraud review, refund
// disputes and balance reconstruction impossible. It grows forever on purpose.
//
// WRITE ORDER (do not invert): the ledger row is inserted with applied:false
// FIRST, then the balance moves ($inc on User) and the row is flipped to
// applied:true. If the process dies between the two steps the user is
// UNDER-paid, which a sweeper can repair from the applied:false rows. The
// reverse order (balance first, ledger second) fails as a DOUBLE-pay, which is
// unrepairable because there is no record that the credit already happened.
const stampLedgerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Signed: positive credits, negative debits. Never store an unsigned amount
  // plus a direction flag — that splits the truth across two fields.
  delta: {
    type: Number,
    required: true,
  },
  // Free-form grant/spend cause, e.g. 'ranked_win', 'daily_quest', 'bot_game',
  // 'shop_purchase', 'admin_grant', 'refund'. Kept as a plain String rather than
  // an enum so a new earn source can ship without a schema migration.
  reason: {
    type: String,
    required: true,
  },
  // THE idempotency guard. Deterministically derived by the caller from the
  // event that justifies the movement (e.g. `${userId}:ranked_win:${gameId}`),
  // so a retry, a duplicate socket message or a double-fired cron collapses
  // onto the same key and the unique index below rejects the second insert.
  idempotencyKey: {
    type: String,
    required: true,
  },
  applied: {
    type: Boolean,
    default: false,
  },
  claimedAt: {
    type: Date,
    default: null,
  },
  appliedAt: {
    type: Date,
    default: null,
  },
  // ADVISORY ONLY — a debugging aid, never a value to read back as truth.
  // Concurrent $inc from other paths (a purchase landing between this row's
  // insert and its $inc) means the number recorded here can be stale the moment
  // it is written. The authoritative balance is always User.stamps.
  balanceAfter: {
    type: Number,
    default: null,
  },
  meta: {
    gameId: { type: String },
    sku: { type: String },
    tier: { type: Number },
    periodKey: { type: String },
    myElo: { type: Number },
    opponentElo: { type: Number },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// THE idempotency guard — a duplicate grant attempt fails on insert with a
// duplicate-key error, which the caller treats as "already paid, nothing to do".
stampLedgerSchema.index({ idempotencyKey: 1 }, { unique: true });
// User-facing transaction history, newest first.
stampLedgerSchema.index({ userId: 1, createdAt: -1 });
// Filtered history / per-source audits ("all ranked_win grants for this user").
stampLedgerSchema.index({ userId: 1, reason: 1, createdAt: -1 });
// "What did this ONE game pay me" — the receipt rebuilt when a player opens a
// finished game from their history (serverUtils/stamps/gameReceipt.js). Without
// it that lookup rides the {userId, createdAt} index and then filters every row
// the account has ever accumulated, on a collection documented above as growing
// forever. Sparse: only earn rows carry meta.gameId, spends and admin grants
// have no game and do not belong in this index.
stampLedgerSchema.index({ userId: 1, 'meta.gameId': 1 }, { sparse: true });
// Repair sweeper: find stranded applied:false rows oldest-first.
stampLedgerSchema.index({ applied: 1, createdAt: 1 });

const StampLedger = mongoose.models.StampLedger || mongoose.model('StampLedger', stampLedgerSchema);

export default StampLedger;
