import { describe, it, expect } from 'vitest';
import { buildRankTable, season0Rank, season0RankOf, hasSeason0 } from '../shared/season0/rank.js';
import { assignRanks } from '../scripts/exportSeason0HallOfFame.js';

/** The empty table shipped in shared/season0/rankTable.js before an export. */
const EMPTY = { ranks: {} };

describe('buildRankTable', () => {
  it('ranks descending, highest rating first', () => {
    const { ranks } = buildRankTable([[1200, 1], [900, 1], [1500, 1]]);
    expect(ranks).toEqual({ 1500: 1, 1200: 2, 900: 3 });
  });

  it('gives tied ratings the HIGHER rank and skips the next one', () => {
    // 3 players on 1200 are all #2. The next distinct rating is #5, not #3.
    const { ranks } = buildRankTable([[2000, 1], [1200, 3], [800, 1]]);
    expect(ranks).toEqual({ 2000: 1, 1200: 2, 800: 5 });
  });

  it('counts every account, not every distinct rating', () => {
    const built = buildRankTable([[1000, 1_500_000], [20000, 1]]);
    expect(built.eligibleAccounts).toBe(1_500_001);
    expect(built.distinctRatings).toBe(2);
    expect(built.ranks[1000]).toBe(2);
  });

  it('ignores junk entries rather than poisoning the ladder', () => {
    const { ranks, eligibleAccounts } = buildRankTable([
      [1500, 1], [NaN, 5], [1200, 0], [1000, -3], ['900', 1],
    ]);
    expect(ranks).toEqual({ 1500: 1, 900: 2 });
    expect(eligibleAccounts).toBe(2);
  });

  it('agrees with the Hall of Fame board on every shared row', () => {
    // Same population, two different code paths: the board sorts, the table
    // counts. They must land on the same numbers or a profile and the board
    // would quote different places for the same player.
    const players = [
      { username: 'a', elo_s0: 2000 },
      { username: 'b', elo_s0: 1200 },
      { username: 'c', elo_s0: 1200 },
      { username: 'd', elo_s0: 800 },
    ];
    const { ranks } = buildRankTable([[2000, 1], [1200, 2], [800, 1]]);
    for (const row of assignRanks(players)) {
      expect(ranks[String(row.elo_s0)]).toBe(row.rank);
    }
  });
});

describe('season0Rank', () => {
  const table = { ranks: buildRankTable([[2000, 1], [1200, 2], [800, 1]]).ranks };

  it('looks a rating up, rounding first', () => {
    expect(season0Rank(1200, table)).toBe(2);
    expect(season0Rank(1200.4, table)).toBe(2);
    expect(season0Rank('2000', table)).toBe(1);
  });

  it('returns null for anything it cannot answer', () => {
    expect(season0Rank(1201, table)).toBe(null);   // rating nobody finished on
    expect(season0Rank(null, table)).toBe(null);
    expect(season0Rank(undefined, table)).toBe(null);
    expect(season0Rank('nope', table)).toBe(null);
    expect(season0Rank(1200, EMPTY)).toBe(null);   // table not exported yet
  });

  it('does not answer from the prototype chain', () => {
    expect(season0Rank('constructor', table)).toBe(null);
    expect(season0Rank('toString', table)).toBe(null);
  });
});

describe('season0RankOf', () => {
  it('is null for accounts the Hall of Fame excludes', () => {
    // The shipped table is empty, so these assert the exclusion, not a number:
    // what matters is that a banned account can never resolve to a place.
    expect(season0RankOf({ elo_s0: 1200, banned: true })).toBe(null);
    expect(season0RankOf({ elo_s0: 1200, pendingNameChange: true })).toBe(null);
    expect(season0RankOf(null)).toBe(null);
    expect(season0RankOf({})).toBe(null);
  });
});

describe('hasSeason0 (the OG badge)', () => {
  it('grants the badge to every account with a Season 0 snapshot', () => {
    expect(hasSeason0({ elo_s0: 1000 })).toBe(true);
    expect(hasSeason0({ elo_s0: 17342, ogAccount: false })).toBe(true);
  });

  it('still honours the stamped grant on its own', () => {
    expect(hasSeason0({ ogAccount: true })).toBe(true);
    expect(hasSeason0({ ogAccount: true, elo_s0: null })).toBe(true);
  });

  it('refuses accounts created after the migration', () => {
    expect(hasSeason0({ elo_s0: null })).toBe(false);
    expect(hasSeason0({})).toBe(false);
    expect(hasSeason0(null)).toBe(false);
    // Nothing but a real boolean true, and nothing but a real rating.
    expect(hasSeason0({ ogAccount: 'true' })).toBe(false);
    expect(hasSeason0({ elo_s0: 'veteran' })).toBe(false);
    expect(hasSeason0({ elo_s0: 0 })).toBe(false);
  });
});
