// The complete list of ways stamps can enter or leave a balance. Pure — no
// imports, no env, no I/O.
//
// Stamps are currency. This table is the mint, and assertReason is the lock on
// it: every ledger write goes through it, and it THROWS rather than clamping or
// logging. Throwing loudly is the whole guarantee. If a new game mode, a new
// bonus or a copy-pasted reward path can hand out stamps with a reason nobody
// budgeted, or ten times the intended amount, or the wrong sign, it will do so
// silently and forever until someone notices the economy is broken. A crash in
// staging on the first call is the cheap version of that discovery.
//
// Each entry:
//   sign:   1 = credit only, -1 = debit only, 0 = either (admin escape hatch).
//   maxAbs: hard per-write magnitude ceiling for this reason.
//
// Adding a reason is a deliberate act. Do not widen maxAbs to make a caller
// pass; fix the caller, or budget the new number on purpose.
export const STAMP_REASONS = {
  // Per-game trickle.
  game_base:     { sign: 1,  maxAbs: 2 },
  game_win:      { sign: 1,  maxAbs: 1 },
  bot_game:      { sign: 1,  maxAbs: 1 },
  first_win_day: { sign: 1,  maxAbs: 5 },

  // Periodic ladders and quests (keyed by serverUtils/stamps/periods.js).
  daily_ladder:  { sign: 1,  maxAbs: 20 },
  weekly_play20: { sign: 1,  maxAbs: 25 },
  weekly_win10:  { sign: 1,  maxAbs: 25 },
  // Legacy only: retained so historical ledger entries remain valid/readable.
  weekly_upset:  { sign: 1,  maxAbs: 10 },
  weekly_days4:  { sign: 1,  maxAbs: 15 },

  // Shop.
  purchase:      { sign: -1, maxAbs: 5000 },
  refund:        { sign: 1,  maxAbs: 5000 },

  // Manual correction. Either direction, but the ceiling still applies so a
  // fat-fingered admin cannot mint a million.
  admin_adjust:  { sign: 0,  maxAbs: 100000 },
};

/**
 * Validate one ledger write. Returns true, or THROWS — never returns false,
 * because a caller that can ignore the result is a caller that will.
 */
export function assertReason(reason, delta) {
  const rule = STAMP_REASONS[reason];
  if (!rule) {
    throw new Error(`[stamps] unknown reason "${reason}" — add it to STAMP_REASONS with a budgeted sign and maxAbs`);
  }
  if (!Number.isInteger(delta)) {
    throw new Error(`[stamps] reason "${reason}" got a non-integer delta ${delta} — stamps are whole units`);
  }
  if (rule.sign !== 0 && Math.sign(delta) !== rule.sign) {
    throw new Error(`[stamps] reason "${reason}" requires sign ${rule.sign}, got delta ${delta}`);
  }
  if (Math.abs(delta) > rule.maxAbs) {
    throw new Error(`[stamps] reason "${reason}" exceeds maxAbs ${rule.maxAbs}, got delta ${delta}`);
  }
  return true;
}
