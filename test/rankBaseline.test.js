import { describe, it, expect } from 'vitest';
import { rankQueryRating, RANK_BASELINE_RATING, RATING_FLOOR, clampRating } from '../components/utils/eloSystem.js';
import { buildEloRankMap } from '../serverUtils/eloRankQuery.js';

describe('rankQueryRating', () => {
  it('floors every sub-baseline rating at the baseline', () => {
    expect(rankQueryRating(669)).toBe(RANK_BASELINE_RATING);
    expect(rankQueryRating(500)).toBe(RANK_BASELINE_RATING);
    expect(rankQueryRating(RATING_FLOOR)).toBe(RANK_BASELINE_RATING);
    expect(rankQueryRating(RANK_BASELINE_RATING)).toBe(RANK_BASELINE_RATING);
  });

  it('leaves ratings above the baseline untouched', () => {
    expect(rankQueryRating(671)).toBe(671);
    expect(rankQueryRating(1500)).toBe(1500);
  });

  it('treats a missing or broken rating as sub-baseline rather than NaN', () => {
    // A NaN would make `elo: { $gt: NaN }` match nothing and return rank 1 —
    // the exact opposite of the bug, and just as wrong.
    expect(rankQueryRating(undefined)).toBe(RANK_BASELINE_RATING);
    expect(rankQueryRating(null)).toBe(RANK_BASELINE_RATING);
    expect(rankQueryRating(NaN)).toBe(RANK_BASELINE_RATING);
    expect(rankQueryRating('nonsense')).toBe(RANK_BASELINE_RATING);
  });

  it('NEVER changes the stored rating: clampRating keeps its own floor', () => {
    // The baseline is a RANK-COMPARISON floor only. A real rating may sit
    // below it, and clampRating (RATING_FLOOR 100) is the only rating floor.
    expect(clampRating(120)).toBe(120);
    expect(clampRating(50)).toBe(RATING_FLOOR);
    expect(RATING_FLOOR).toBeLessThan(RANK_BASELINE_RATING);
  });
});

describe('the cliff this removes', () => {
  // Models the population: a big tie block at the baseline plus players above.
  const ABOVE = 474_000;   // accounts strictly above 670
  const MASS = 3_700_000;  // accounts at exactly 670

  const rankOf = (elo, floored) => {
    const compared = floored ? rankQueryRating(elo) : elo;
    let above = 0;
    if (compared < RANK_BASELINE_RATING) above = ABOVE + MASS;
    else if (compared === RANK_BASELINE_RATING) above = ABOVE;
    else above = ABOVE - 1;
    return above + 1;
  };

  it('used to drop a player millions of ranks for one lost game', () => {
    const before = rankOf(RANK_BASELINE_RATING, false);
    const after = rankOf(RANK_BASELINE_RATING - 10, false);
    expect(after - before).toBeGreaterThan(3_000_000);
  });

  it('now holds them at the tie block: the lowest rank is the 670 tie', () => {
    const before = rankOf(RANK_BASELINE_RATING, true);
    const after = rankOf(RANK_BASELINE_RATING - 10, true);
    expect(after).toBe(before);
    expect(after).toBe(ABOVE + 1);
  });
});

// The REAL cron path, not a copy of it: buildEloRankMap is what cron.js
// calls, so these assertions guard the shipped code.
describe('buildEloRankMap (cron weekly snapshot)', () => {
  const users = [
    { _id: 'a', elo: 1200 },
    { _id: 'b', elo: 800 },
    { _id: 'c', elo: 670 },
    { _id: 'd', elo: 670 },
    { _id: 'e', elo: 660 }, // below baseline
    { _id: 'f', elo: 300 }, // far below
  ];

  it('gives every sub-baseline account the same rank as the 670 block', () => {
    const r = buildEloRankMap(users);
    expect(r.get('a')).toBe(1);
    expect(r.get('b')).toBe(2);
    expect(r.get('c')).toBe(3);
    expect(r.get('d')).toBe(3); // competition ranking: ties share a rank
    expect(r.get('e')).toBe(3); // floored into the block, not 5
    expect(r.get('f')).toBe(3); // floored into the block, not 6
  });

  it('agrees with the per-game formula for every player', () => {
    // computeEloRank is count(elo > rankQueryRating(yours)) + 1. The weekly
    // snapshot and the per-game snapshot write into the SAME graph, so any
    // disagreement here is a visible step on a user's profile.
    const weekly = buildEloRankMap(users);
    for (const u of users) {
      const perGame = users.filter((o) => o.elo > rankQueryRating(u.elo)).length + 1;
      expect(weekly.get(u._id)).toBe(perGame);
    }
  });

  it('handles a missing rating without producing NaN ranks', () => {
    const r = buildEloRankMap([{ _id: 'x', elo: 900 }, { _id: 'y', elo: undefined }]);
    expect(r.get('y')).toBe(2);
  });
});
