import { describe, it, expect } from 'vitest';
import { dayKeyUTC, weekKeyUTC, startOfUtcDay } from '../serverUtils/stamps/periods.js';
import { STAMP_REASONS, assertReason } from '../serverUtils/stamps/reasons.js';

// These keys are the de-duplication primitive for every periodic payout: same
// user + same reason + same period key is a duplicate and the writer rejects
// it. A key that rolls at the wrong instant either double-pays or swallows a
// payout, and both are silent.

describe('startOfUtcDay', () => {
  it('returns midnight UTC of the containing day', () => {
    const d = startOfUtcDay(Date.parse('2026-08-06T17:43:11.123Z'));
    expect(d.toISOString()).toBe('2026-08-06T00:00:00.000Z');
  });

  it('is idempotent and already-midnight-safe', () => {
    const midnight = Date.parse('2026-08-06T00:00:00.000Z');
    expect(startOfUtcDay(midnight).toISOString()).toBe('2026-08-06T00:00:00.000Z');
    expect(startOfUtcDay(startOfUtcDay(midnight).getTime()).toISOString()).toBe('2026-08-06T00:00:00.000Z');
  });
});

describe('dayKeyUTC', () => {
  it('formats YYYY-MM-DD with zero padding', () => {
    expect(dayKeyUTC(Date.parse('2026-08-06T12:00:00.000Z'))).toBe('2026-08-06');
    expect(dayKeyUTC(Date.parse('2026-01-05T12:00:00.000Z'))).toBe('2026-01-05');
    expect(dayKeyUTC(Date.parse('2026-12-31T23:00:00.000Z'))).toBe('2026-12-31');
  });

  it('rolls exactly at 00:00 UTC, not a millisecond earlier', () => {
    expect(dayKeyUTC(Date.parse('2026-08-06T23:59:59.999Z'))).toBe('2026-08-06');
    expect(dayKeyUTC(Date.parse('2026-08-07T00:00:00.000Z'))).toBe('2026-08-07');
  });

  it('rolls the year at the same instant', () => {
    expect(dayKeyUTC(Date.parse('2026-12-31T23:59:59.999Z'))).toBe('2026-12-31');
    expect(dayKeyUTC(Date.parse('2027-01-01T00:00:00.000Z'))).toBe('2027-01-01');
  });

  it('is UTC-only — a local-time key would hand UTC+13 a second "today"', () => {
    // 2026-08-07T11:00+13:00 is still 2026-08-06 in UTC.
    expect(dayKeyUTC(Date.parse('2026-08-07T11:00:00.000+13:00'))).toBe('2026-08-06');
  });

  it('matches the day the Date object reports', () => {
    for (const iso of ['2024-02-29T00:00:00.000Z', '2025-03-01T00:00:00.000Z', '2026-11-09T09:09:09.000Z']) {
      const d = new Date(iso);
      const expected = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      expect(dayKeyUTC(d.getTime())).toBe(expected);
    }
  });
});

describe('weekKeyUTC', () => {
  it('is Monday-anchored: Monday through Sunday share one key', () => {
    // 2026-08-03 is a Monday, 2026-08-09 the Sunday that closes the same week.
    expect(weekKeyUTC(Date.parse('2026-08-03T00:00:00.000Z'))).toBe('2026-W32');
    expect(weekKeyUTC(Date.parse('2026-08-06T13:37:00.000Z'))).toBe('2026-W32');
    expect(weekKeyUTC(Date.parse('2026-08-09T23:59:59.999Z'))).toBe('2026-W32');

    // The Sunday BEFORE belongs to the previous week, not the next one.
    expect(weekKeyUTC(Date.parse('2026-08-02T23:59:59.999Z'))).toBe('2026-W31');
    // ...and the following Monday opens the next.
    expect(weekKeyUTC(Date.parse('2026-08-10T00:00:00.000Z'))).toBe('2026-W33');
  });

  it('zero-pads the week number', () => {
    expect(weekKeyUTC(Date.parse('2026-01-05T00:00:00.000Z'))).toBe('2026-W02');
    expect(weekKeyUTC(Date.parse('2026-01-01T00:00:00.000Z'))).toBe('2026-W01');
    expect(weekKeyUTC(Date.parse('2026-03-02T00:00:00.000Z'))).toBe('2026-W10');
  });

  it('uses the ISO week-numbering YEAR, not the calendar year (2027-01-01)', () => {
    // 2027-01-01 is a Friday, and its ISO week belongs to 2026 — week 53.
    // Deriving the year from getUTCFullYear() would key it 2027-W53 and collide
    // with a different real week, silently swallowing a payout.
    expect(weekKeyUTC(Date.parse('2027-01-01T00:00:00.000Z'))).toBe('2026-W53');
    expect(weekKeyUTC(Date.parse('2027-01-03T23:59:59.999Z'))).toBe('2026-W53'); // Sunday
    expect(weekKeyUTC(Date.parse('2027-01-04T00:00:00.000Z'))).toBe('2027-W01'); // Monday
  });

  it('uses the ISO week-numbering YEAR, not the calendar year (2024-12-30)', () => {
    // 2024-12-30 is a Monday whose ISO week is 2025-W01.
    expect(weekKeyUTC(Date.parse('2024-12-30T00:00:00.000Z'))).toBe('2025-W01');
    expect(weekKeyUTC(Date.parse('2024-12-31T00:00:00.000Z'))).toBe('2025-W01');
    expect(weekKeyUTC(Date.parse('2025-01-01T00:00:00.000Z'))).toBe('2025-W01');
    expect(weekKeyUTC(Date.parse('2024-12-29T00:00:00.000Z'))).toBe('2024-W52'); // the Sunday before
  });

  it('produces exactly one key change per week, on Mondays, across a year', () => {
    const start = Date.parse('2026-01-01T00:00:00.000Z');
    const seen = new Map();
    let changes = 0;
    let prev = null;

    for (let day = 0; day < 400; day++) {
      const ts = start + day * 86400000;
      const key = weekKeyUTC(ts);
      if (prev !== null && key !== prev) {
        changes++;
        // A key change may only happen on a Monday.
        expect(new Date(ts).getUTCDay()).toBe(1);
      }
      prev = key;
      seen.set(key, (seen.get(key) || 0) + 1);
    }

    // 400 days spans 57 full weeks plus a tail; every complete key must cover
    // exactly 7 days, and keys must never be revisited after changing.
    expect(changes).toBeGreaterThan(50);
    for (const [key, count] of seen) {
      expect(count, `week ${key} covered ${count} days`).toBeLessThanOrEqual(7);
    }
  });

  it('always matches the YYYY-Www shape', () => {
    for (let day = 0; day < 800; day += 13) {
      const key = weekKeyUTC(Date.parse('2024-01-01T00:00:00.000Z') + day * 86400000);
      expect(key).toMatch(/^\d{4}-W\d{2}$/);
    }
  });
});

describe('assertReason', () => {
  it('accepts a valid grant and returns true', () => {
    expect(assertReason('game_base', 2)).toBe(true);
    expect(assertReason('game_win', 1)).toBe(true);
    expect(assertReason('bot_game', 2)).toBe(true);
    expect(assertReason('purchase', -5000)).toBe(true);
    expect(assertReason('admin_adjust', 100)).toBe(true);
    expect(assertReason('admin_adjust', -100)).toBe(true); // sign 0 = either way
  });

  it('THROWS on an unknown reason', () => {
    // A copy-pasted reward path that invents a reason must crash on its first
    // call, not mint an unbudgeted currency forever.
    expect(() => assertReason('free_money', 1)).toThrow(/unknown reason/);
    expect(() => assertReason(undefined, 1)).toThrow(/unknown reason/);
    expect(() => assertReason('', 1)).toThrow(/unknown reason/);
    expect(() => assertReason(null, 1)).toThrow(/unknown reason/);
  });

  it('rejects removed daily and weekly bonuses', () => {
    for (const reason of [
      'first_win_day',
      'daily_ladder',
      'weekly_play20',
      'weekly_win10',
      'weekly_upset',
      'weekly_days4',
    ]) {
      expect(() => assertReason(reason, 1)).toThrow(/unknown reason/);
    }
  });

  it('still fails closed on an inherited Object.prototype key', () => {
    // FINDING, cosmetic: STAMP_REASONS is a plain object literal, so the
    // `STAMP_REASONS[reason]` lookup resolves inherited keys — 'constructor'
    // and 'toString' find a truthy Function instead of falling into the
    // unknown-reason branch. The write is still REJECTED (it trips the sign
    // check on `rule.sign === undefined`), so this is a misleading error
    // message rather than a hole. A null-prototype table or an
    // Object.hasOwn() guard would make the message say what actually happened.
    expect(() => assertReason('constructor', 1)).toThrow();
    expect(() => assertReason('toString', 1)).toThrow();
    expect(() => assertReason('hasOwnProperty', 1)).toThrow();
  });

  it('THROWS on the wrong sign', () => {
    expect(() => assertReason('game_win', -1)).toThrow(/requires sign 1/);
    expect(() => assertReason('bot_game', -2)).toThrow(/requires sign 1/);
    expect(() => assertReason('purchase', 100)).toThrow(/requires sign -1/);
    expect(() => assertReason('refund', -100)).toThrow(/requires sign 1/);
  });

  it('THROWS on exceeding maxAbs', () => {
    expect(() => assertReason('bot_game', 3)).toThrow(/exceeds maxAbs 2/);
    expect(() => assertReason('game_base', 3)).toThrow(/exceeds maxAbs 2/);
    expect(() => assertReason('purchase', -5001)).toThrow(/exceeds maxAbs 5000/);
    expect(() => assertReason('admin_adjust', 100001)).toThrow(/exceeds maxAbs 100000/);
  });

  it('THROWS on a non-integer delta — stamps are whole units', () => {
    expect(() => assertReason('game_base', 1.5)).toThrow(/non-integer/);
    expect(() => assertReason('game_base', NaN)).toThrow(/non-integer/);
    expect(() => assertReason('game_base', '2')).toThrow(/non-integer/);
    expect(() => assertReason('game_base', Infinity)).toThrow(/non-integer/);
  });

  it('never returns false — every rejection is a throw', () => {
    // A caller that can ignore the result is a caller that will.
    for (const [reason, delta] of [['nope', 1], ['game_win', -1], ['game_base', 99], ['game_base', 0.5]]) {
      let returned = 'did not throw';
      try {
        returned = assertReason(reason, delta);
      } catch {
        returned = 'threw';
      }
      expect(returned).toBe('threw');
    }
  });

  it('every budgeted reason accepts its own boundary and rejects one past it', () => {
    for (const [reason, rule] of Object.entries(STAMP_REASONS)) {
      const positive = rule.sign === -1 ? -rule.maxAbs : rule.maxAbs;
      expect(assertReason(reason, positive), `${reason} at maxAbs`).toBe(true);
      expect(() => assertReason(reason, positive + Math.sign(positive)), `${reason} past maxAbs`).toThrow();
    }
  });
});
