import { describe, it, expect } from 'vitest';
import { AUTO_BAN, isSuspectGuess, scoreAccount } from '../serverUtils/autoBan5k.js';

const LOC = { lat: 48.8584, long: 2.2945 };
const ME = 'acc1';

// 1 degree of latitude is about 111 km, so 0.00001 is about 1.1 m.
const guess = (metersNorth, timeTaken, accountId = ME) => ({
  accountId,
  guessLat: LOC.lat + metersNorth / 111000,
  guessLong: LOC.long,
  timeTaken
});

const game = (gameId, guesses) => ({
  gameId,
  rounds: guesses.map(g => ({ location: LOC, playerGuesses: [g, guess(0, 1, 'other')] }))
});

describe('isSuspectGuess', () => {
  it('needs both the distance and the speed', () => {
    expect(isSuspectGuess(LOC, guess(2, 3))).toBe(true);
    expect(isSuspectGuess(LOC, guess(0, 0))).toBe(true);
    expect(isSuspectGuess(LOC, guess(2, 30))).toBe(false);
    expect(isSuspectGuess(LOC, guess(60, 3))).toBe(false);
  });

  it('ignores a round with no guess', () => {
    expect(isSuspectGuess(LOC, { accountId: ME, guessLat: null, guessLong: null, timeTaken: 60 })).toBe(false);
  });
});

describe('scoreAccount', () => {
  const cheatRounds = (n) => Array.from({ length: n }, () => guess(1, 2));
  const cleanRounds = (n) => Array.from({ length: n }, () => guess(40000, 25));

  it('flags an account that passes the count and the rate', () => {
    const stats = scoreAccount([
      game('g1', cheatRounds(AUTO_BAN.minRounds)),
      game('g2', cleanRounds(5))
    ], ME);
    expect(stats.suspect).toBe(AUTO_BAN.minRounds);
    expect(stats.rounds).toBe(AUTO_BAN.minRounds + 5);
    expect(stats.gameIds).toEqual(['g1']);
    expect(stats.flagged).toBe(true);
  });

  it('does not flag below the round count', () => {
    expect(scoreAccount([game('g1', cheatRounds(AUTO_BAN.minRounds - 1))], ME).flagged).toBe(false);
  });

  it('does not flag a heavy player below the rate', () => {
    const stats = scoreAccount([
      game('g1', cheatRounds(AUTO_BAN.minRounds)),
      game('g2', cleanRounds(AUTO_BAN.minRounds * 20))
    ], ME);
    expect(stats.flagged).toBe(false);
  });

  it('does not flag fast far guesses or slow exact guesses', () => {
    const slowExact = Array.from({ length: 40 }, () => guess(1, 30));
    const fastFar = Array.from({ length: 40 }, () => guess(500, 2));
    expect(scoreAccount([game('g1', slowExact), game('g2', fastFar)], ME).flagged).toBe(false);
  });

  it('counts only the account asked for', () => {
    expect(scoreAccount([game('g1', cleanRounds(20))], ME).suspect).toBe(0);
    expect(scoreAccount([game('g1', cleanRounds(20))], 'other').suspect).toBe(20);
  });
});
