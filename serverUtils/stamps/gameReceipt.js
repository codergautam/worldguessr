import mongoose from 'mongoose';
import StampLedger from '../../models/StampLedger.js';

/* ===========================================================================
 *  The stamps receipt for ONE finished game, rebuilt from the ledger.
 *
 *  WHY THE LEDGER AND NOT A FIELD ON THE GAME DOC. The live end screen gets its
 *  receipt pushed over the socket (ws/classes/Game.js sendStampEarnings) and
 *  nothing was ever written down, so opening the same game from history showed
 *  no stamps row at all — the game paid you and the record of it existed
 *  nowhere the client could reach. Stamping a copy onto the Game document would
 *  fix that for games played from now on and leave every game already played
 *  permanently blank, and it would put a second copy of a number whose SOURCE OF
 *  TRUTH is explicitly StampLedger (see the header on models/StampLedger.js)
 *  next to the original. The ledger already has every grant, already keys them
 *  by game, and already survives forever on purpose. Read it.
 *
 *  APPLIED ROWS ONLY. The write order is insert-as-false, move the balance, flip
 *  to true — so `applied: false` means the grant was interrupted between the two
 *  steps and the player has NOT been paid yet (a sweeper repairs those). Showing
 *  it would be telling someone they earned currency they do not have, in the one
 *  screen where they are counting it.
 *
 *  POSITIVE ROWS ONLY. `delta` is signed and this collection also carries
 *  spends, refunds and admin grants. A receipt says what the GAME paid.
 *
 *  FAILS TO NULL, never throws: the whole history request must not 500 because a
 *  decorative row could not be assembled.
 * ======================================================================== */

/**
 * @param {string|null} accountId Viewer's account id. Guests/bots → null.
 * @param {string|null} gameId    The Game document's `gameId`.
 * @returns {Promise<{total: number, lines: Array<{reason: string, amount: number}>}|null>}
 *   null when nothing was paid — the client renders NO row for that, never a
 *   "+0". Same contract as sendStampEarnings, which does not send for zero.
 */
export async function stampReceiptForGame(accountId, gameId) {
  if (!accountId || !gameId || !mongoose.Types.ObjectId.isValid(accountId)) return null;
  try {
    const rows = await StampLedger.find({
      userId: accountId,
      'meta.gameId': gameId,
      applied: true,
      delta: { $gt: 0 },
    })
      // Oldest first, so the breakdown reads in the order the game paid it —
      // the same order the live receipt arrived in.
      .sort({ createdAt: 1 })
      .select('delta reason')
      .lean()
      .maxTimeMS(2000);

    if (!rows.length) return null;
    // Raw lines, NOT merged. mergeStampLines (shared/stamps/receipt.js) is a
    // PRESENTATION rule and it runs on the client for the live receipt too;
    // collapsing here as well would mean two merge points that can disagree.
    const lines = rows.map((r) => ({ reason: r.reason, amount: r.delta }));
    return { total: lines.reduce((sum, l) => sum + l.amount, 0), lines };
  } catch (e) {
    console.warn('[stampReceipt] ledger read failed (non-critical):', e.message);
    return null;
  }
}
