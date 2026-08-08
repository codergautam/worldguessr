import { describe, it, expect } from 'vitest';
import { STAMP_REASON_KEYS, mergeStampLines } from '../shared/stamps/receipt.js';

// The receipt row is the one surface in the app where a player counts currency,
// so the rules that decide what it SAYS are pinned here. Everything below is a
// statement about honesty, not about formatting.

describe('mergeStampLines', () => {
  it('collapses repeated reasons into one line', () => {
    // The real shape of a game that crosses several daily-ladder tiers at once:
    // the ladder re-evaluates EVERY tier on EVERY game (that is what back-pays
    // a grant lost to a crash), so four rows for one reason is correct data and
    // wrong presentation.
    const merged = mergeStampLines([
      { reason: 'game_base', amount: 2 },
      { reason: 'game_win', amount: 1 },
      { reason: 'daily_ladder', amount: 5 },
      { reason: 'daily_ladder', amount: 10 },
      { reason: 'daily_ladder', amount: 15 },
    ]);

    expect(merged).toEqual([
      { reason: 'game_base', amount: 2 },
      { reason: 'game_win', amount: 1 },
      { reason: 'daily_ladder', amount: 30 },
    ]);
  });

  it('preserves first-seen order, not the order of the last occurrence', () => {
    const merged = mergeStampLines([
      { reason: 'daily_ladder', amount: 5 },
      { reason: 'game_base', amount: 2 },
      { reason: 'daily_ladder', amount: 10 },
    ]);

    expect(merged.map((l) => l.reason)).toEqual(['daily_ladder', 'game_base']);
    expect(merged[0].amount).toBe(15);
  });

  it('never invents a total: the merged sum equals the input sum', () => {
    const lines = [
      { reason: 'game_base', amount: 2 },
      { reason: 'game_win', amount: 1 },
      { reason: 'first_win_day', amount: 5 },
      { reason: 'weekly_upset', amount: 10 },
    ];
    const sum = (rows) => rows.reduce((acc, r) => acc + r.amount, 0);

    expect(sum(mergeStampLines(lines))).toBe(sum(lines));
  });

  it('DROPS malformed entries rather than coercing them to zero', () => {
    // A NaN or a reason-less row must vanish. Rendering it as "+0" would make
    // the player read a payout they did not get and then hunt for it.
    const merged = mergeStampLines([
      { reason: 'game_base', amount: 2 },
      { reason: 'game_win', amount: undefined },
      { reason: '', amount: 5 },
      { amount: 7 },
      null,
      { reason: 'weekly_win10', amount: '25' }, // numeric string is still a number
    ]);

    expect(merged).toEqual([
      { reason: 'game_base', amount: 2 },
      { reason: 'weekly_win10', amount: 25 },
    ]);
  });

  it('is total for non-array input', () => {
    expect(mergeStampLines(undefined)).toEqual([]);
    expect(mergeStampLines(null)).toEqual([]);
    expect(mergeStampLines({})).toEqual([]);
    expect(mergeStampLines([])).toEqual([]);
  });
});

describe('STAMP_REASON_KEYS', () => {
  it('covers every reason the server can pay out from a finished game', () => {
    // Mirrors the payout table in ws/classes/Game.js (STAMP_DAILY_LADDER,
    // STAMP_WEEKLY_QUESTS and the flat per-game grants). A reason added there
    // without a key here renders as a bare unlabelled amount — which is the
    // designed degradation, but it should be a DECISION, so this test is the
    // reminder to make it.
    const paidByGameFinish = [
      'game_base',
      'game_win',
      'bot_game',
      'first_win_day',
      'daily_ladder',
      'weekly_play20',
      'weekly_win10',
      'weekly_upset',
      'weekly_days4',
    ];

    for (const reason of paidByGameFinish) {
      expect(STAMP_REASON_KEYS[reason], `missing locale key for "${reason}"`).toBeTruthy();
    }
  });

  it('maps no reason the game-finish path cannot pay', () => {
    // `purchase`, `refund` and `admin_adjust` are real ledger reasons but can
    // never appear on an end screen. A key for one of them would mean somebody
    // started rendering the wallet's history here by accident.
    for (const reason of ['purchase', 'refund', 'admin_adjust']) {
      expect(STAMP_REASON_KEYS[reason]).toBeUndefined();
    }
  });
});
