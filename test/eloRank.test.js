import { describe, it, expect } from 'vitest';
import { duelCounterIncs } from '../api/eloRank.js';

// NOTE ON THE IMPORT: api/eloRank.js pulls in mongoose and models/User.js. It
// was verified to be importable here with NO database connection and NO
// lingering handles — model registration alone is side-effect-free, and the
// only connect() call lives inside the request handler. The one visible cost is
// a mongoose "duplicate schema index on {username: 1}" warning on stdout, which
// comes from models/User.js declaring the index twice (once via `index: true`,
// once via schema.index()). Nothing is mocked below.

describe('duelCounterIncs', () => {
  it('books a win', () => {
    expect(duelCounterIncs({ winner: true })).toEqual({
      duels_wins: 1, duels_losses: 0, duels_tied: 0, ratedGames: 1,
    });
  });

  it('books a loss', () => {
    expect(duelCounterIncs({ winner: false })).toEqual({
      duels_wins: 0, duels_losses: 1, duels_tied: 0, ratedGames: 1,
    });
  });

  it('THE DRAW REGRESSION: a draw books a tie and NOT a loss', () => {
    // A draw arrives as {draw: true} with no `winner` key at all. Reading
    // `winner` first makes undefined falsy and books the draw as a loss as well
    // as a tie, permanently inflating duels_losses. `draw` must be tested first.
    const incs = duelCounterIncs({ draw: true });

    expect(incs.duels_tied).toBe(1);
    expect(incs.duels_losses).toBe(0);
    expect(incs.duels_wins).toBe(0);
  });

  it('draw wins over an explicitly false winner', () => {
    expect(duelCounterIncs({ winner: false, draw: true })).toEqual({
      duels_wins: 0, duels_losses: 0, duels_tied: 1, ratedGames: 1,
    });
  });

  it('draw wins over a truthy winner too — a game is never both', () => {
    expect(duelCounterIncs({ winner: true, draw: true })).toEqual({
      duels_wins: 0, duels_losses: 0, duels_tied: 1, ratedGames: 1,
    });
  });

  it('defaults a game with neither flag to a loss', () => {
    expect(duelCounterIncs({})).toEqual({
      duels_wins: 0, duels_losses: 1, duels_tied: 0, ratedGames: 1,
    });
  });

  it('counts rated games by default', () => {
    expect(duelCounterIncs({ winner: true }).ratedGames).toBe(1);
    expect(duelCounterIncs({ winner: true, rated: true }).ratedGames).toBe(1);
  });

  it('does NOT count an unrated (bot) game toward ratedGames', () => {
    // ratedGames drives the K schedule and the placement gate, so a bot game
    // leaking into it would age an account out of K_NEW for free.
    expect(duelCounterIncs({ winner: true, rated: false }).ratedGames).toBe(0);
    expect(duelCounterIncs({ winner: false, rated: false }).ratedGames).toBe(0);
    expect(duelCounterIncs({ draw: true, rated: false }).ratedGames).toBe(0);
  });

  it('still books the win/loss/tie counters for an unrated game', () => {
    expect(duelCounterIncs({ winner: true, rated: false })).toEqual({
      duels_wins: 1, duels_losses: 0, duels_tied: 0, ratedGames: 0,
    });
  });

  it('always emits exactly one game across the three outcome counters', () => {
    const cases = [
      { winner: true }, { winner: false }, { draw: true },
      { winner: true, rated: false }, { draw: true, winner: true }, {},
    ];
    for (const c of cases) {
      const i = duelCounterIncs(c);
      expect(i.duels_wins + i.duels_losses + i.duels_tied, JSON.stringify(c)).toBe(1);
    }
  });
});
