import { describe, expect, it } from 'vitest';
import {
  canJoinUnrankedRound,
  UNRANKED_JOIN_MIN_REMAINING_MS,
  UNRANKED_ROUND_TIME_MS,
} from '../ws/unrankedMatchmaking.js';

const NOW = 1_800_000_000_000;

describe('public unranked matchmaking rules', () => {
  it('uses a 45-second round timer', () => {
    expect(UNRANKED_ROUND_TIME_MS).toBe(45_000);
  });

  it('allows joining with exactly 15 seconds remaining', () => {
    expect(canJoinUnrankedRound({
      state: 'guess',
      nextEvtTime: NOW + UNRANKED_JOIN_MIN_REMAINING_MS,
    }, NOW)).toBe(true);
  });

  it('refuses joining with less than 15 seconds remaining', () => {
    expect(canJoinUnrankedRound({
      state: 'guess',
      nextEvtTime: NOW + UNRANKED_JOIN_MIN_REMAINING_MS - 1,
    }, NOW)).toBe(false);
  });

  it('allows seating players outside the active guessing phase', () => {
    expect(canJoinUnrankedRound({ state: 'getready', nextEvtTime: NOW }, NOW)).toBe(true);
  });

  it('fails closed when an active round has no valid deadline', () => {
    expect(canJoinUnrankedRound({ state: 'guess', nextEvtTime: null }, NOW)).toBe(false);
  });
});
