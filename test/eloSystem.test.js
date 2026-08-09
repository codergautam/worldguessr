import { describe, it, expect } from 'vitest';
import {
  RATING_SCALE,
  K_NEW,
  K_MID,
  K_VET,
  K_NEW_UNTIL,
  K_MID_UNTIL,
  RATING_FLOOR,
  ENTRY_RATING,
  SEED_BASE,
  SEED_SLOPE,
  SEED_MAX,
  WIN_FLOOR,
  expectedScore,
  kFactor,
  pairK,
  clampRating,
  placementSeed,
  calculateTransfer,
} from '../components/utils/eloSystem.js';
import { STARTING_ELO } from '../components/utils/ratingFlags.js';

// Rating v2 is the ladder's mint. Every assertion below exists because the
// corresponding mistake silently prints or burns rating in production, and the
// only place that is cheap to catch is here.

describe('v2 constants', () => {
  it('exports the documented rollout constants', () => {
    expect(RATING_SCALE).toBe(400);
    expect(K_NEW).toBe(40);
    expect(K_MID).toBe(20);
    expect(K_VET).toBe(10);
    expect(K_NEW_UNTIL).toBe(30);
    expect(K_MID_UNTIL).toBe(100);
    expect(RATING_FLOOR).toBe(100);
    expect(ENTRY_RATING).toBe(500);
    expect(SEED_BASE).toBe(500);
    expect(SEED_SLOPE).toBeCloseTo(0.06, 10);
    expect(SEED_MAX).toBe(800);
    expect(WIN_FLOOR).toBe(1);
  });
});

describe('expectedScore', () => {
  it('is 0.5 between equals', () => {
    expect(expectedScore(800, 800)).toBe(0.5);
  });

  it('is ~1/11 for a 400-point underdog', () => {
    expect(expectedScore(800, 1200)).toBeCloseTo(0.0909091, 6);
  });

  it('is ~10/11 for a 400-point favourite', () => {
    expect(expectedScore(1200, 800)).toBeCloseTo(0.909091, 6);
  });

  it('is symmetric: the two sides sum to exactly 1', () => {
    for (const [a, b] of [[800, 800], [800, 1200], [1200, 800], [100, 2000], [1337, 999]]) {
      expect(expectedScore(a, b) + expectedScore(b, a)).toBeCloseTo(1, 12);
    }
  });
});

describe('calculateTransfer — headline arithmetic', () => {
  it('splits 10 points between equals at K=20', () => {
    const r = calculateTransfer({ ratingA: 800, ratingB: 800, outcome: 1, k: 20 });
    expect(r.deltaA).toBe(10);
    expect(r.deltaB).toBe(-10);
    expect(r.transfer).toBe(10);
    expect(r.k).toBe(20);
  });

  it('pays an upset 18 (theoretical 18.18, rounded exactly once)', () => {
    const r = calculateTransfer({ ratingA: 800, ratingB: 1200, outcome: 1, k: 20 });
    expect(r.deltaA).toBe(18);
    expect(r.deltaB).toBe(-18);
  });

  it('pays an expected win 2 (theoretical 1.82)', () => {
    const r = calculateTransfer({ ratingA: 1200, ratingB: 800, outcome: 1, k: 20 });
    expect(r.deltaA).toBe(2);
    expect(r.deltaB).toBe(-2);
  });

  it('is sign-symmetric: describing the same game from either seat agrees', () => {
    // Same game, two descriptions: the 800 player loses to the 1200 player.
    const from800 = calculateTransfer({ ratingA: 800, ratingB: 1200, outcome: 0, k: 20 });
    const from1200 = calculateTransfer({ ratingA: 1200, ratingB: 800, outcome: 1, k: 20 });

    // The 800 player's delta must be the same number in both readings, and so
    // must the 1200 player's. Which seat is "A" is a caller detail.
    expect(from800.deltaA).toBe(from1200.deltaB);
    expect(from800.deltaB).toBe(from1200.deltaA);
    expect(from800.transfer).toBe(from1200.transfer);
  });

  it('reports the k it actually used and A\'s expectation', () => {
    const r = calculateTransfer({ ratingA: 800, ratingB: 1200, ratedGamesA: 0, ratedGamesB: 200, outcome: 1 });
    expect(r.k).toBe(pairK(0, 200));
    expect(r.expectedA).toBeCloseTo(expectedScore(800, 1200), 12);
  });
});

// ---------------------------------------------------------------------------
// THE ZERO-SUM INVARIANT
// ---------------------------------------------------------------------------
// v1's bug was that the two sides were computed independently, so the winner's
// gain and the loser's loss did not match and the ladder minted rating out of
// nothing. deltaA + deltaB === 0 is the one property that makes v2 a closed
// economy; if this test ever goes red, ranked writes must be halted.
describe('calculateTransfer — zero-sum grid property', () => {
  it('never creates or destroys rating across the full parameter grid', () => {
    const ratings = [];
    for (let r = 100; r <= 2000; r += 50) ratings.push(r);
    const ratedGames = [0, 5, 29, 30, 31, 99, 100, 101, 500];
    const outcomes = [1, 0, 0.5];
    const decays = [1, 0.75, 0.5, 0.25, 0];

    const failures = [];
    let cells = 0;

    for (const ratingA of ratings) {
      for (const ratingB of ratings) {
        for (const rgA of ratedGames) {
          for (const rgB of ratedGames) {
            for (const outcome of outcomes) {
              for (const decay of decays) {
                // Both orderings of the same match-up. Swapping the players
                // must also swap the outcome, otherwise it is a different game.
                const orderings = [
                  { ratingA, ratingB, ratedGamesA: rgA, ratedGamesB: rgB, outcome, decay },
                  { ratingA: ratingB, ratingB: ratingA, ratedGamesA: rgB, ratedGamesB: rgA, outcome: 1 - outcome, decay },
                ];

                for (const args of orderings) {
                  cells++;
                  const { transfer, deltaA, deltaB } = calculateTransfer(args);
                  const sum = deltaA + deltaB;

                  // Object.is guards the -0 case: -0 === 0 is true but
                  // Object.is(-0, 0) is false, and a -0 leaking into a $inc is
                  // a real (if cosmetic) defect worth naming separately.
                  const zeroSum = sum === 0 && Object.is(sum, 0);
                  const integral = Number.isInteger(transfer) && Number.isInteger(deltaA) && Number.isInteger(deltaB);
                  const opposite = deltaA === -deltaB || (deltaA === 0 && deltaB === 0);

                  if (!zeroSum || !integral || !opposite) {
                    if (failures.length < 10) {
                      failures.push({ ...args, transfer, deltaA, deltaB, sum, zeroSum, integral, opposite });
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    expect(cells).toBe(ratings.length * ratings.length * ratedGames.length * ratedGames.length * outcomes.length * decays.length * 2);
    expect(failures).toEqual([]);
  });
});

describe('calculateTransfer — the RATING_FLOOR cap', () => {
  // A loser may never be pushed under RATING_FLOOR, and the cap is applied
  // LAST, so it beats WIN_FLOOR. That ordering is deliberate (see the source
  // comment): the alternative is either a sub-floor rating or a game that is
  // not zero-sum, and both are worse than a 0-point game.
  it('caps the loss at exactly the distance to the floor', () => {
    // 105 is the favourite here (its opponent sits ON the floor), so the raw
    // magnitude is ~10 and the cap genuinely binds at 5.
    const r = calculateTransfer({ ratingA: 105, ratingB: 100, outcome: 0, k: 20 });
    expect(r.transfer).toBe(5);
    expect(r.deltaA).toBe(-5);
    expect(105 + r.deltaA).toBe(RATING_FLOOR);
    expect(r.deltaB).toBe(5);
  });

  it('transfers 0 when the loser is already sitting on the floor', () => {
    // The floor cap BEATS WIN_FLOOR. This documents a deliberate decision:
    // a player at 100 cannot lose anything, so their opponent gains nothing.
    const r = calculateTransfer({ ratingA: 1500, ratingB: RATING_FLOOR, outcome: 1, k: 20 });
    expect(r.transfer).toBe(0);
    expect(r.deltaA).toBe(0);
    expect(r.deltaB).toBe(0);
    expect(Object.is(r.deltaA, -0)).toBe(false);
  });

  it('does not bind when the loser has room, even at 105 vs 1500', () => {
    // FINDING, recorded rather than asserted away: the brief specified
    // `transfer === 5` for a loser at 105 against a winner at 1500. That is
    // arithmetically unreachable. The 105 player is a ~0.03% underdog there, so
    // the raw magnitude is k * 0.000325 (0.0065 at k=20); WIN_FLOOR lifts it to
    // 1 and min(1, 105-100) leaves it at 1. The cap only binds when the raw
    // magnitude exceeds the distance to the floor, i.e. when the near-floor
    // player was the FAVOURITE (the test above). Actual behaviour:
    const r = calculateTransfer({ ratingA: 1500, ratingB: 105, outcome: 1, k: 20 });
    expect(r.transfer).toBe(1);
    expect(105 + r.deltaB).toBe(104);
  });

  it('never lets a computed loser rating land below the floor', () => {
    for (const loser of [100, 101, 103, 105, 110, 150]) {
      for (const k of [10, 20, 40]) {
        for (const winner of [100, 120, 500, 2000]) {
          const r = calculateTransfer({ ratingA: winner, ratingB: loser, outcome: 1, k });
          expect(loser + r.deltaB).toBeGreaterThanOrEqual(RATING_FLOOR);
        }
      }
    }
  });
});

describe('calculateTransfer — WIN_FLOOR', () => {
  it('lifts a vanishing raw transfer up to 1', () => {
    const r = calculateTransfer({ ratingA: 2000, ratingB: 400, outcome: 1, k: 10 });
    const raw = 10 * (1 - r.expectedA);
    expect(raw).toBeLessThan(0.01); // raw would round to 0
    expect(r.transfer).toBe(WIN_FLOOR);
    expect(r.deltaA).toBe(1);
    expect(r.deltaB).toBe(-1);
    // The floor cap has 300 points of headroom here, so it is not what set the 1.
    expect(400 - RATING_FLOOR).toBeGreaterThan(WIN_FLOOR);
  });

  it('applies to a loss as well as a win', () => {
    // The vanishing-magnitude case for a LOSS is the underdog losing as
    // expected: raw is ~0.001, floored to 1 so the drop is still felt.
    const r = calculateTransfer({ ratingA: 400, ratingB: 2000, outcome: 0, k: 10 });
    expect(10 * r.expectedA).toBeLessThan(0.01);
    expect(r.transfer).toBe(1);
    expect(r.deltaA).toBe(-1);
    expect(r.deltaB).toBe(1);
  });

  it('does NOT flatten a genuine upset — a 2000 losing to a 400 pays ~full K', () => {
    // Guards against "floor everything to 1": the floor may only lift a
    // magnitude that rounded away, never cap one that didn't.
    const r = calculateTransfer({ ratingA: 2000, ratingB: 400, outcome: 0, k: 10 });
    expect(r.transfer).toBe(10);
    expect(r.deltaA).toBe(-10);
  });
});

describe('calculateTransfer — anti-farm decay', () => {
  // Floor before decay: farming the same opponent all day must reach exactly 0.
  const upset = (decay) => calculateTransfer({ ratingA: 800, ratingB: 1200, outcome: 1, k: 20, decay });

  it('scales an 18-point upset down the decay ladder', () => {
    expect(upset(1).transfer).toBe(18);
    expect(upset(0.75).transfer).toBe(14); // 13.64
    expect(upset(0.5).transfer).toBe(9);   // 9.09
    expect(upset(0.25).transfer).toBe(5);  // 4.55
  });

  it('gives exactly 0 at decay 0, and WIN_FLOOR does NOT resurrect it', () => {
    const r = upset(0);
    expect(r.transfer).toBe(0);
    expect(r.deltaA).toBe(0);
    expect(r.deltaB).toBe(0);
    expect(Object.is(r.deltaA, -0)).toBe(false);
  });

  it('zeroes a floored win too — the ordering is floor, THEN decay', () => {
    // Raw here is ~0.001, floored to 1, then decayed to 0. If decay ran before
    // the floor, this would pay 1 and farming would still be profitable.
    const r = calculateTransfer({ ratingA: 2000, ratingB: 400, outcome: 1, k: 10, decay: 0 });
    expect(r.transfer).toBe(0);
    expect(r.deltaA).toBe(0);
  });
});

describe('calculateTransfer — draws', () => {
  it('moves rating from the favourite to the underdog', () => {
    const r = calculateTransfer({ ratingA: 800, ratingB: 1200, outcome: 0.5, k: 20 });
    expect(r.deltaA).toBe(8);   // 20 * (0.5 - 1/11) = 8.18
    expect(r.deltaB).toBe(-8);
    expect(r.deltaA + r.deltaB).toBe(0);
  });

  it('moves nothing between equals', () => {
    const r = calculateTransfer({ ratingA: 800, ratingB: 800, outcome: 0.5, k: 20 });
    expect(r.transfer).toBe(0);
    expect(r.deltaA).toBe(0);
    expect(r.deltaB).toBe(0);
  });

  it('is NEVER floored: a near-equal draw stays at 0 where a win would pay 1', () => {
    const draw = calculateTransfer({ ratingA: 800, ratingB: 810, outcome: 0.5, k: 20 });
    expect(draw.transfer).toBe(0); // raw 0.29, not lifted to WIN_FLOOR

    // Same ratings, decided outcome, tiny raw -> floored to 1. This contrast is
    // the whole point: only decided games are guaranteed to move the ladder.
    const decided = calculateTransfer({ ratingA: 2000, ratingB: 400, outcome: 1, k: 10 });
    expect(decided.transfer).toBe(1);
  });
});

describe('kFactor', () => {
  it('steps at 30 and 100 rated games', () => {
    expect(kFactor(0)).toBe(40);
    expect(kFactor(29)).toBe(40);
    expect(kFactor(30)).toBe(20);
    expect(kFactor(99)).toBe(20);
    expect(kFactor(100)).toBe(10);
    expect(kFactor(101)).toBe(10);
    expect(kFactor(5000)).toBe(10);
  });

  it('treats missing / garbage counts as a brand-new account', () => {
    expect(kFactor(undefined)).toBe(40);
    expect(kFactor(null)).toBe(40);
    expect(kFactor(NaN)).toBe(40);
    expect(kFactor('not a number')).toBe(40);
  });
});

describe('pairK', () => {
  it('averages the two K-factors so both sides share one K', () => {
    expect(pairK(0, 100)).toBe(25);
    expect(pairK(0, 0)).toBe(40);
    expect(pairK(35, 35)).toBe(20);
  });

  it('is order-independent', () => {
    expect(pairK(0, 100)).toBe(pairK(100, 0));
    expect(pairK(29, 500)).toBe(pairK(500, 29));
  });
});

describe('clampRating', () => {
  it('rounds to an integer and never returns below the floor', () => {
    expect(clampRating(1000.4)).toBe(1000);
    expect(clampRating(1000.5)).toBe(1001);
    expect(clampRating(0)).toBe(RATING_FLOOR);
    expect(clampRating(-500)).toBe(RATING_FLOOR);
    expect(clampRating(99.6)).toBe(RATING_FLOOR);
  });
});

describe('placementSeed', () => {
  it('maps average round points onto 500..800', () => {
    expect(placementSeed(0)).toBe(500);
    expect(placementSeed(1000)).toBe(560);
    expect(placementSeed(2500)).toBe(650);
    expect(placementSeed(5000)).toBe(800);
  });

  it('caps above a perfect score instead of running away', () => {
    expect(placementSeed(6000)).toBe(SEED_MAX);
    expect(placementSeed(1e9)).toBe(SEED_MAX);
  });

  it('seeds at the base for garbage input rather than throwing', () => {
    expect(placementSeed(-1)).toBe(SEED_BASE);
    expect(placementSeed(-99999)).toBe(SEED_BASE);
    expect(placementSeed(NaN)).toBe(SEED_BASE);
    expect(placementSeed(undefined)).toBe(SEED_BASE);
    expect(placementSeed(null)).toBe(SEED_BASE); // Number(null) === 0
    expect(placementSeed('nonsense')).toBe(SEED_BASE);
  });
});

describe('calculateTransfer — integrality', () => {
  it('always returns whole numbers', () => {
    const samples = [
      { ratingA: 100, ratingB: 2000, outcome: 1 },
      { ratingA: 1337, ratingB: 999, outcome: 0, ratedGamesA: 7, ratedGamesB: 401 },
      { ratingA: 777, ratingB: 778, outcome: 0.5, decay: 0.75 },
      { ratingA: 101, ratingB: 100, outcome: 0, k: 33 },
    ];
    for (const s of samples) {
      const r = calculateTransfer(s);
      expect(Number.isInteger(r.transfer)).toBe(true);
      expect(Number.isInteger(r.deltaA)).toBe(true);
      expect(Number.isInteger(r.deltaB)).toBe(true);
    }
  });
});

// ===========================================================================
// THE PLACEMENT MUST NEVER BE A DEMOTION
// ===========================================================================
// This shipped broken and it was the first thing a new player ever saw.
//
// models/User.js defaulted `elo` to a hardcoded 1000. Correct on the Season 0
// scale, wrong on v2, where 1000 sits inside VOYAGER (945-1269). Since
// placementSeed() returns 500..800 — ALWAYS below 1000 — the very first ranked
// game a player plays, which the throwing placement bot guarantees they WIN,
// rendered as a red rating loss on web, a downward count and a badge demotion on
// mobile, and was persisted to game history as a defeat.
//
// The invariant that catches it: a placement seed applied to an account sitting
// at the starting rating can never move that rating DOWN.
describe('placement seeding vs the starting rating — the demotion regression', () => {
  it('STARTING_ELO equals ENTRY_RATING, not the retired 1000', () => {
    expect(STARTING_ELO).toBe(ENTRY_RATING);
    expect(STARTING_ELO).not.toBe(1000);
  });

  it('never seeds BELOW the rating a new account starts at, at any round score', () => {
    // 0 through a perfect 5000 average, plus the garbage inputs.
    for (let avg = 0; avg <= 5000; avg += 50) {
      expect(placementSeed(avg)).toBeGreaterThanOrEqual(STARTING_ELO);
    }
    for (const junk of [null, undefined, NaN, -1, 'nonsense']) {
      expect(placementSeed(junk)).toBeGreaterThanOrEqual(STARTING_ELO);
    }
  });

  it('a perfect placement is the biggest possible GAIN, never a loss', () => {
    const delta = placementSeed(5000) - STARTING_ELO;
    expect(delta).toBe(SEED_MAX - ENTRY_RATING); // +300
    expect(delta).toBeGreaterThan(0);
  });

  it('a near-zero placement earns nothing rather than costing something', () => {
    // "Nothing is guaranteed" is the design: a bad game leaves you where you
    // started. It must not leave you WORSE than you started.
    expect(placementSeed(0) - STARTING_ELO).toBe(0);
  });

  it('the seed range sits entirely at or above the entry rating', () => {
    expect(SEED_BASE).toBe(ENTRY_RATING);
    expect(SEED_MAX).toBeGreaterThan(SEED_BASE);
  });
});
