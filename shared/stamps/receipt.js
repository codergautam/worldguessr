// Presentation rules for a stamps receipt — the "you earned +8" row on the end
// screen. ONE copy, imported by web (components/roundOverScreen.js) and mobile
// (@shared/stamps/receipt, via the Metro alias), because the two platforms
// showing a player different breakdowns for the same game is exactly the class
// of drift a shared module exists to prevent.
//
// PURE. No imports, no process, no clock, no React, no react-native. That is
// what lets both bundlers take it and what lets test/stampsReceipt.test.js pin
// the merge rule below without a DOM.
//
// This file decides how a receipt READS. It never decides what anything is
// worth: the amounts come off the wire exactly as the ledger applied them (ws
// Game.js grantGameStamps), and nothing here may invent, round or top up a
// number. In the one place in the app where a player counts currency, the
// screen is a report, not an estimate.

/**
 * Wire reason -> locale key, for the breakdown lines.
 *
 * An unmapped reason is DELIBERATELY not an error and not a fallback string: the
 * renderers drop the label and show the bare amount, so shipping a new earn
 * source server-side degrades to "+5" with no label instead of leaking a raw
 * slug like `weekly_upset` onto the screen or crashing on a missing key.
 *
 * Keys live in public/locales/<lang>/common.json, which mobile reads verbatim
 * through the @locales alias — one edit covers both platforms.
 */
export const STAMP_REASON_KEYS = {
  game_base: 'stampsReasonGameBase',
  game_win: 'stampsReasonGameWin',
  bot_game: 'stampsReasonBotGame',
};

/**
 * Collapse repeated reasons into one line each, first-seen order preserved.
 *
 * WHY THIS IS NEEDED AT ALL: historical receipts can contain several rows for
 * one reason, and future earn sources may do the same. Rendering those rows
 * separately looks like a duplicate-payment bug; one merged line is the same
 * truth, said once.
 *
 * The total is NOT recomputed from this: callers render the server's `total`,
 * which is the sum of what the ledger applied. Summing the merged lines instead
 * would make a dropped/unmappable line silently shrink the headline number.
 *
 * Malformed entries (no reason, non-numeric amount) are skipped rather than
 * coerced — a receipt is currency, and a NaN in it must disappear, never render
 * as a zero the player has to interpret.
 *
 * @param {Array<{reason: string, amount: number}>} lines Raw wire lines.
 * @returns {Array<{reason: string, amount: number}>} One entry per reason.
 */
export function mergeStampLines(lines) {
  if (!Array.isArray(lines)) return [];
  const order = [];
  const totals = new Map();
  for (const line of lines) {
    const amount = Number(line?.amount);
    if (!line?.reason || !Number.isFinite(amount)) continue;
    if (!totals.has(line.reason)) {
      order.push(line.reason);
      totals.set(line.reason, 0);
    }
    totals.set(line.reason, totals.get(line.reason) + amount);
  }
  return order.map((reason) => ({ reason, amount: totals.get(reason) }));
}
