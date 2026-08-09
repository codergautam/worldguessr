import User from '../../models/User.js';
import StampLedger from '../../models/StampLedger.js';
import { STAMPS_ENABLED } from './config.js';
import { assertReason } from './reasons.js';

// THE single writer for the stamps economy. Nothing else may $inc User.stamps
// except the reconciliation sweep in cron.js, which exists only to finish work
// this function started.
//
// DESIGN CONTRACT — LEDGER FIRST, BALANCE SECOND
// ----------------------------------------------
// This repo has ZERO mongoose transactions, so a grant is two writes that can
// be interrupted between them. That leaves exactly one choice to make: which
// half do we do first, and therefore which way do we fail?
//
//   ledger first (this order): a crash between the two steps leaves a durable
//   applied:false row and an UNDER-paid user. The row records everything
//   needed to finish the job, and cron.js's sweep does exactly that.
//
//   user first: a crash between the two steps leaves a paid user and no
//   record. A retry re-pays them. That is a DOUBLE-pay, and it is
//   unrecoverable — nothing anywhere says the credit already happened.
//
// Under-payment is a bug with a repair. Double-payment is currency minted out
// of nothing. Hence: ledger first, always. Do not "optimise" the order.
//
// The idempotency stop is the ledger insert itself (unique index on
// idempotencyKey), and it happens BEFORE any balance moves — so a retried
// grant collapses onto the duplicate-key error and returns without touching
// the balance at all.
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

  // 4. Move the balance.
  let balanceAfter = null;
  if (delta >= 0) {
    // CREDIT — unconditional $inc. findOneAndUpdate rather than updateOne only
    // so the post-update balance comes back for the advisory balanceAfter
    // stamp below; the update itself is the same unconditional increment.
    const credited = await User.findOneAndUpdate(
      { _id: userId },
      { $inc: { stamps: delta } },
      { new: true, projection: { stamps: 1 } },
    );
    balanceAfter = credited?.stamps ?? null;
  } else {
    // DEBIT — this filter is the ONLY thing standing between the economy and a
    // negative balance (schema `min: 0` is not enforced on update operators —
    // see models/User.js) AND, via extraFilter, the only thing standing between
    // a double click and a double charge. A null result means the document no
    // longer satisfies one of them.
    const debited = await User.findOneAndUpdate(
      { _id: userId, stamps: { $gte: -delta }, ...(opts.extraFilter || {}) },
      { $inc: { stamps: delta }, ...(opts.extraUpdate || {}) },
      { new: true },
    );
    if (!debited) {
      // Nothing moved, so the row must not survive: leaving it would hand the
      // reconciliation sweep an applied:false row and it would happily apply
      // the debit the funds check just refused.
      await StampLedger.deleteOne({ _id: row._id });
      // WHICH condition failed is the caller's question, not this function's.
      // It knows only that the document did not match; a caller that supplied an
      // extraFilter has to re-read to tell "no funds" from "already owns it"
      // (api/stampShop.js does exactly that). Reporting `insufficient` for both
      // would tell a player with 4,000 Stamps that they cannot afford a 100
      // Stamp emote.
      const blocked = !!opts.extraFilter;
      return { applied: false, duplicate: false, insufficient: !blocked, blocked, balance: null };
    }
    balanceAfter = debited.stamps ?? null;
  }

  // 5. Close the row out. balanceAfter is ADVISORY (a concurrent grant can
  //    land between the $inc and this write) — User.stamps stays the truth.
  await StampLedger.updateOne(
    { _id: row._id },
    { $set: { applied: true, appliedAt: new Date(), balanceAfter } },
  );

  return { applied: true, duplicate: false, insufficient: false, balance: balanceAfter };
}

export default grantStamps;
