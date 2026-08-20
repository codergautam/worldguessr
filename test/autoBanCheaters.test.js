import { describe, it, expect } from 'vitest';
import {
  TEMP_BAN_DAYS,
  TEMP_BAN_DURATION_MS,
  WORKFLOW_NAME,
  getEffectiveBanStatus,
  checkRepeatOffender,
  shouldSkipSuspect,
  buildTempBanReason,
  buildPermBanReason
} from '../serverUtils/autoBanLogic.js';

describe('autoBanLogic constants', () => {
  it('has 14 day temp ban', () => {
    expect(TEMP_BAN_DAYS).toBe(14);
    expect(TEMP_BAN_DURATION_MS).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it('workflow name is autoBanCheaters', () => {
    expect(WORKFLOW_NAME).toBe('autoBanCheaters');
  });
});

describe('getEffectiveBanStatus', () => {
  const now = new Date('2024-06-01T12:00:00Z');

  it('returns not banned for unbanned user', () => {
    const result = getEffectiveBanStatus({ banned: false }, now);
    expect(result.effectivelyBanned).toBe(false);
    expect(result.effectiveBanType).toBe('none');
  });

  it('returns not banned for null user', () => {
    const result = getEffectiveBanStatus(null, now);
    expect(result.effectivelyBanned).toBe(false);
  });

  it('detects expired temp ban', () => {
    const user = {
      banned: true,
      banType: 'temporary',
      banExpiresAt: new Date('2024-05-01T12:00:00Z') // before now
    };
    const result = getEffectiveBanStatus(user, now);
    expect(result.effectivelyBanned).toBe(false);
    expect(result.expired).toBe(true);
  });

  it('detects active temp ban', () => {
    const user = {
      banned: true,
      banType: 'temporary',
      banExpiresAt: new Date('2024-06-10T12:00:00Z') // after now
    };
    const result = getEffectiveBanStatus(user, now);
    expect(result.effectivelyBanned).toBe(true);
    expect(result.effectiveBanType).toBe('temporary');
  });

  it('detects permanent ban', () => {
    const user = { banned: true, banType: 'permanent' };
    const result = getEffectiveBanStatus(user, now);
    expect(result.effectivelyBanned).toBe(true);
    expect(result.effectiveBanType).toBe('permanent');
  });
});

describe('checkRepeatOffender', () => {
  const now = new Date('2024-06-15T12:00:00Z');

  it('returns not repeat when no previous bans', () => {
    const result = checkRepeatOffender([], now, new Date());
    expect(result.isRepeat).toBe(false);
    expect(result.previousTempBan).toBe(null);
  });

  it('returns not repeat when previous ban missing expiresAt', () => {
    const bans = [{ createdAt: new Date(), expiresAt: null }];
    const result = checkRepeatOffender(bans, now, new Date());
    expect(result.isRepeat).toBe(false);
    expect(result.reason).toContain('missing expiresAt');
  });

  it('returns not repeat when previous ban not yet expired', () => {
    const bans = [{ expiresAt: new Date('2024-06-20T12:00:00Z') }];
    const result = checkRepeatOffender(bans, now, new Date('2024-06-16T12:00:00Z'));
    expect(result.isRepeat).toBe(false);
    expect(result.reason).toContain('not yet expired');
  });

  it('returns not repeat when no game after expiry', () => {
    const bans = [{ expiresAt: new Date('2024-06-01T12:00:00Z') }];
    const lastSeen = new Date('2024-05-20T12:00:00Z'); // before expiry
    const result = checkRepeatOffender(bans, now, lastSeen);
    expect(result.isRepeat).toBe(false);
    expect(result.reason).toContain('No cheating game after');
  });

  it('returns repeat when game after expiry and ban expired', () => {
    const expiresAt = new Date('2024-06-01T12:00:00Z');
    const bans = [{ expiresAt }];
    const lastSeen = new Date('2024-06-05T12:00:00Z'); // after expiry
    const result = checkRepeatOffender(bans, now, lastSeen);
    expect(result.isRepeat).toBe(true);
    expect(result.refundSince).toEqual(expiresAt);
    expect(result.previousTempBan).toEqual(bans[0]);
  });

  it('handles string dates for lastSeen', () => {
    const expiresAt = new Date('2024-06-01T12:00:00Z');
    const bans = [{ expiresAt }];
    const result = checkRepeatOffender(bans, now, '2024-06-10T12:00:00Z');
    expect(result.isRepeat).toBe(true);
  });

  it('uses most recent temp ban when multiple', () => {
    const older = { expiresAt: new Date('2024-01-01T12:00:00Z'), id: 'older' };
    const newer = { expiresAt: new Date('2024-06-01T12:00:00Z'), id: 'newer' };
    // Sorted desc by createdAt, so newer first
    const bans = [newer, older];
    const result = checkRepeatOffender(bans, now, new Date('2024-06-05T12:00:00Z'));
    expect(result.isRepeat).toBe(true);
    expect(result.previousTempBan.id).toBe('newer');
  });
});

describe('shouldSkipSuspect', () => {
  it('skips when user not found', () => {
    const result = shouldSkipSuspect(null, { effectivelyBanned: false }, 0);
    expect(result.skip).toBe(true);
    expect(result.reason).toBe('User not found');
  });

  it('skips staff', () => {
    const result = shouldSkipSuspect({ staff: true }, { effectivelyBanned: false }, 0);
    expect(result.skip).toBe(true);
    expect(result.reason).toBe('Staff member');
  });

  it('skips permanently banned', () => {
    const result = shouldSkipSuspect({ username: 'a' }, { effectivelyBanned: true, effectiveBanType: 'permanent' }, 0);
    expect(result.skip).toBe(true);
    expect(result.reason).toContain('permanently banned');
  });

  it('skips currently temp banned', () => {
    const result = shouldSkipSuspect({ username: 'a' }, { effectivelyBanned: true, effectiveBanType: 'temporary' }, 0);
    expect(result.skip).toBe(true);
    expect(result.reason).toContain('temporarily banned');
  });

  it('skips if already perm banned by autoBan', () => {
    const result = shouldSkipSuspect({ username: 'a' }, { effectivelyBanned: false }, 1);
    expect(result.skip).toBe(true);
    expect(result.reason).toContain('autoBanCheaters');
  });

  it('does not skip valid suspect', () => {
    const result = shouldSkipSuspect({ username: 'a' }, { effectivelyBanned: false }, 0);
    expect(result.skip).toBe(false);
  });
});

describe('buildTempBanReason / buildPermBanReason', () => {
  const suspect = {
    highRounds: 15,
    avgPointsHigh: 4980,
    gameCount: 3,
    highRoundPct: 75,
    lastSeen: new Date('2024-06-10T12:00:00Z')
  };
  const filters = { days: 30, minPoints: 4950, minRounds: 10 };

  it('builds temp ban reason with workflow tag', () => {
    const reason = buildTempBanReason(suspect, filters);
    expect(reason).toContain('[autoBanCheaters]');
    expect(reason).toContain('First offense');
    expect(reason).toContain('15');
    expect(reason).toContain('4950');
  });

  it('builds perm ban reason with expiry and repeat tag', () => {
    const prevExpiry = new Date('2024-06-01T12:00:00Z');
    const reason = buildPermBanReason(suspect, filters, prevExpiry);
    expect(reason).toContain('[autoBanCheaters]');
    expect(reason).toContain('Repeat offense');
    expect(reason).toContain(prevExpiry.toISOString());
    expect(reason).toContain('15');
  });
});

describe('autoBan workflow integration logic', () => {
  it('first offense -> temp, repeat after expiry -> perm', () => {
    const now1 = new Date('2024-06-01T12:00:00Z');
    // First time: no previous bans
    let check1 = checkRepeatOffender([], now1, new Date('2024-06-01T10:00:00Z'));
    expect(check1.isRepeat).toBe(false);

    // Simulate temp ban created, expires 14 days later
    const expiresAt = new Date(now1.getTime() + TEMP_BAN_DURATION_MS);
    expect(expiresAt.getTime() - now1.getTime()).toBe(14 * 24 * 60 * 60 * 1000);

    // Before expiry, not repeat
    const nowBeforeExpiry = new Date('2024-06-10T12:00:00Z');
    let check2 = checkRepeatOffender([{ expiresAt }], nowBeforeExpiry, new Date('2024-06-10T10:00:00Z'));
    expect(check2.isRepeat).toBe(false);
    expect(check2.reason).toContain('not yet expired');

    // After expiry, with game after expiry -> repeat
    const nowAfterExpiry = new Date('2024-06-20T12:00:00Z');
    let check3 = checkRepeatOffender([{ expiresAt }], nowAfterExpiry, new Date('2024-06-18T10:00:00Z'));
    expect(check3.isRepeat).toBe(true);
    expect(check3.refundSince).toEqual(expiresAt);

    // After expiry, but game was before expiry -> not repeat
    let check4 = checkRepeatOffender([{ expiresAt }], nowAfterExpiry, new Date('2024-06-10T10:00:00Z'));
    expect(check4.isRepeat).toBe(false);
  });

  it('refund window should be from temp ban expiry to catch time', () => {
    const expiresAt = new Date('2024-06-01T12:00:00Z');
    const now = new Date('2024-06-20T12:00:00Z');
    const check = checkRepeatOffender([{ expiresAt }], now, new Date('2024-06-18T10:00:00Z'));
    expect(check.refundSince).toEqual(expiresAt);
    // The endpoint should query games with endedAt >= refundSince
    // This ensures opponents who lost after expiry get refunded, not before
    const refundSince = check.refundSince;
    const gameBefore = new Date('2024-05-20T12:00:00Z');
    const gameAfter = new Date('2024-06-10T12:00:00Z');
    expect(gameBefore >= refundSince).toBe(false);
    expect(gameAfter >= refundSince).toBe(true);
  });
});
