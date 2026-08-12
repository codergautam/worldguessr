import User from '../../models/User.js';
import StampLedger from '../../models/StampLedger.js';
import { STAMPS_ENABLED } from './config.js';
import { assertReason } from './reasons.js';

// THE single writer for the stamps economy. Nothing else may $inc User.stamps
// except the reconciliation sweep in cron.js, which exists only to finish work
// this function started.
//
// DESIGN CONTRACT — LEDGER FIRST, THEN CLAIM-BEFORE-PAY
// -----------------------------------------------------
// The ledger insert (applied:false) comes first: it is the idempotency stop,
// and a row that commits with no balance move is exactly the state cron.js's
// sweep exists to finish.
//
// THE INVARIANT EVERYTHING RESTS ON: applied:false MEANS THE BALANCE DID NOT
// MOVE. cron.js's sweep repairs precisely the applied:false rows, so if that
// ever becomes false the sweep pays a second time.
//
// This ran as ONE Mongo transaction (balance move + applied:true flip)
// until the production mongod turned out to be a STANDALONE, where
// transactions are rejected outright: every grant since the stamps launch
// inserted a row and then threw, so the economy paid nobody. Transactions
// are gone; the invariant is not.
//
// What replaced it, for CREDITS, is ORDER plus a compare-and-set:
//
//   1. flip applied:false -> applied:true, CONDITIONAL on it still being
//      false. Exactly one actor can win that CAS — this call or the sweep,
//      never both. THIS IS THE CLAIM, and it is what the transaction used to
//      provide.
//   2. only the winner moves the balance.
//
// Because the flip happens BEFORE the money, applied:false still means the
// balance never moved, so the sweep's bargain holds unchanged and a credit
// can never be paid twice.
//
// THE COST, STATED PLAINLY: a crash between the flip and the $inc leaves a
// row marked applied whose money never moved — a silent UNDER-payment that
// the sweep will not repair, because it only looks at applied:false. That is
// the deliberate trade. Under-payment is detectable (reconcile the sum of
// applied deltas against balances) and repayable; the double-payment this
// ordering rules out is neither. The prior two-bare-writes version had the
// ordering backwards, which is exactly why it minted credits twice and took
// debits twice — see the emote_party rows at 06:16:51.193 and .228.
//
// DEBITS keep the charge in a single findOneAndUpdate, which is atomic
// per-document with no transaction needed: the funds guard, the extraFilter
// and the extraUpdate delivery all land or none do. Only the applied:true
// flip is now a second write, so a crash between them strands an
// applied:false row for a charge that DID happen. The sweep cancels such
// rows (it cannot replay the delivery), which costs the audit trail for that
// purchase but moves no money — the charge and the item stay consistent.
//
// RESTORING THE TRANSACTION: put mongod on a replica set and this file can go
// back to withTransaction, which is strictly stronger. Nothing else has to
// change; the CAS is harmless there too.
//
// opts.extraUpdate exists so a purchase can fuse the debit and the delivery of
// what was bought into ONE atomic document update: without it, "take the
// stamps" and "give the cosmetic" are two writes with a window between them
// where the player has paid and owns nothing.
//
// opts.extraFilter IS THE OTHER HALF OF THAT FUSE, and it was missing. The
// debit's filter used to test the BALANCE alone, so every other precondition a
// caller had — "you do not already own this" above all — was checked earlier,
// against a user document read at the top of the request. Two presses 35ms
// apart both read "not owned", both passed, and both debited: the player paid
// twice and $addToSet handed them one item. That is not theoretical; it is in
// the ledger (emote_party, 06:16:51.193 and .228).
//
// Conditions that decide whether a charge may happen MUST be conditions on the
// document, evaluated by the same findOneAndUpdate that moves the money.
// Anything checked before it is advice, not a guard.
//
// @param {ObjectId|string} userId
// @param {number} delta            signed: >0 credits, <0 debits
// @param {string} reason           must exist in STAMP_REASONS
// @param {string} idempotencyKey   deterministic; the same event must derive the same key
// @param {object} meta             audit breadcrumbs (gameId / periodKey / tier / elos / sku)
// @param {object} opts             { extraUpdate, extraFilter } — extra $-operators
//                                  fused into the debit, and extra conditions the
//                                  document must still satisfy when it lands
// @returns {Promise<{applied:boolean, duplicate:boolean, insufficient:boolean, balance:number|null, disabled?:boolean}>}
export async function grantStamps(userId, delta, reason, idempotencyKey, meta = {}, opts = {}) {
  // 1. VALIDATE — and let it throw. Checked before the kill switch on purpose,
  //    so that a disabled process still rejects an unregistered reason (or a
  //    wrong sign / oversized amount) instead of returning a clean-looking
  //    { disabled: true } and deferring the crash to whenever the switch comes
  //    back on. A loud crash on the first call is the cheap version of that
  //    discovery. This mattered more when STAMPS_ENABLED defaulted OFF and so
  //    was off across all of development; it now defaults ON
  //    (serverUtils/stamps/config.js) and the window has narrowed to an
  //    explicitly killed process, but the ordering is still the right one.
  assertReason(reason, delta);

  // 2. Kill switch. No DB contact whatsoever.
  if (!STAMPS_ENABLED) {
    return { applied: false, duplicate: false, insufficient: false, balance: null, disabled: true };
  }

  // 3. Ledger row FIRST, applied:false. This insert is the idempotency stop.
  let row;
  try {
    row = await StampLedger.create({
      userId,
      delta,
      reason,
      idempotencyKey,
      applied: false,
      meta,
    });
  } catch (err) {
    // Duplicate key on idempotencyKey = this exact event was already paid.
    // Nothing to do, and critically nothing was moved.
    if (err?.code === 11000) {
      return { applied: false, duplicate: true, insufficient: false, balance: null };
    }
    throw err;
  }

  // 4+5. Claim the row, then move the balance. See the header for why the
  //      order is what it is.
  let balanceAfter = null;

  if (delta >= 0) {
    // CREDIT — CLAIM FIRST. This CAS is the mutual exclusion the transaction
    // used to provide: `applied: false` in the FILTER means only one actor can
    // ever win it, so this call and the sweep can race freely and exactly one
    // of them pays.
    const claimed = await StampLedger.findOneAndUpdate(
      { _id: row._id, applied: false },
      { $set: { applied: true, appliedAt: new Date() } },
      { new: true },
    );
    if (!claimed) {
      // The sweep got here first and has already paid (or is paying) this row.
      // Reported as a duplicate because that is what it is: the event is paid.
      return { applied: false, duplicate: true, insufficient: false, balance: null };
    }

    // findOneAndUpdate rather than updateOne only so the post-update balance
    // comes back for the advisory balanceAfter stamp below.
    const credited = await User.findOneAndUpdate(
      { _id: userId },
      { $inc: { stamps: delta } },
      { new: true, projection: { stamps: 1 } },
    );
    balanceAfter = credited?.stamps ?? null;
  } else {
    // DEBIT — this filter is the ONLY thing standing between the economy
    // and a negative balance (schema `min: 0` is not enforced on update
    // operators — see models/User.js) AND, via extraFilter, the only
    // thing standing between a double click and a double charge. A null
    // result means the document no longer satisfies one of them.
    //
    // Single-document update: charge and delivery are atomic here with no
    // transaction involved, which is the guarantee that actually mattered.
    const debited = await User.findOneAndUpdate(
      { _id: userId, stamps: { $gte: -delta }, ...(opts.extraFilter || {}) },
      { $inc: { stamps: delta }, ...(opts.extraUpdate || {}) },
      { new: true },
    );
    if (!debited) {
      // Nothing moved, so the row must not survive: leaving it would hand
      // the reconciliation sweep an applied:false row for a debit the
      // funds check just refused.
      await StampLedger.deleteOne({ _id: row._id });
      // WHICH condition failed is the caller's question, not this
      // function's. It knows only that the document did not match; a
      // caller that supplied an extraFilter has to re-read to tell "no
      // funds" from "already owns it" (api/stampShop.js does exactly
      // that). Reporting `insufficient` for both would tell a player with
      // 4,000 Stamps that they cannot afford a 100 Stamp emote.
      const blocked = !!opts.extraFilter;
      return { applied: false, duplicate: false, insufficient: !blocked, blocked, balance: null };
    }
    balanceAfter = debited.stamps ?? null;
  }

  // Close the row out. balanceAfter is ADVISORY (a concurrent grant can land
  // between the $inc and this write) — User.stamps stays the truth. On the
  // credit path `applied` is already true from the claim; re-setting it keeps
  // one write here instead of branching.
  await StampLedger.updateOne(
    { _id: row._id },
    { $set: { applied: true, appliedAt: new Date(), balanceAfter } },
  );

  return { applied: true, duplicate: false, insufficient: false, balance: balanceAfter };
}

export default grantStamps;
