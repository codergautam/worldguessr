import { describe, it, expect } from 'vitest';
import { isPlacementEligible, backfillRatedGames, RATED_GAMES_BACKFILL_CAP } from '../components/utils/placementGates.js';
import { kFactor, K_VET, K_MID_UNTIL } from '../components/utils/eloSystem.js';

// ===========================================================================
// WHY THIS FILE EXISTS
// ===========================================================================
// Placements OVERWRITE a rating outright: finish placements and the account is
// stamped at placementSeed(), somewhere in 500..800.
//
// The trigger for "needs placements" is ratedGames === 0. Every account that
// existed before the v2 migration has ratedGames 0, because the field did not
// exist when those documents were written. So without BOTH gates, on migration
// day EVERY veteran on the ladder is placement-eligible, plays a handful of
// games, and has its carefully migrated rating bulldozed by a 500-800 bot seed.
// A 2400-rated account becomes 640, and there is no undo: the pre-migration
// value only survives in elo_s0.
//
//   Gate A (isPlacementEligible's created_at check): only accounts created AT
//   OR AFTER the migration instant may ever be placed. Account age is the one
//   signal a missing field cannot fake. This gate ALONE saves every veteran,
//   which is why the `{ratedGames: 0, created before migration} -> false` case
//   below is the single most important assertion in this file.
//
//   Gate B (backfillRatedGames): seeds ratedGames from historical duel counters
//   so veterans are not sitting at 0 in the first place, and so their K-factor
//   reflects real experience instead of treating a 5000-game veteran as a
//   rookie at K 40.
//
// Both gates FAIL CLOSED. No migration timestamp, no created_at, an unparseable
// date: not eligible. The cost of a wrong "yes" is a destroyed rating; the cost
// of a wrong "no" is that one player keeps their entry rating a while longer.
// ===========================================================================

const MIGRATION = new Date('2026-08-01T00:00:00.000Z');
const BEFORE = new Date('2024-03-15T12:00:00.000Z');
const AFTER = new Date('2026-09-02T09:30:00.000Z');

describe('backfillRatedGames', () => {
  const user = (wins, losses = 0, tied = 0) => ({ duels_wins: wins, duels_losses: losses, duels_tied: tied });
  const CAP = RATED_GAMES_BACKFILL_CAP;

  it('sums the historical duel counters below the cap', () => {
    expect(backfillRatedGames(user(0, 0, 0))).toBe(0);
    expect(backfillRatedGames(user(1, 0, 0))).toBe(1);
    expect(backfillRatedGames(user(5, 4, 3))).toBe(12);
    expect(backfillRatedGames(user(CAP - 1, 0, 0))).toBe(CAP - 1);
    expect(backfillRatedGames(user(CAP, 0, 0))).toBe(CAP);
  });

  it('caps a legacy veteran at the settling-window value', () => {
    expect(backfillRatedGames(user(CAP + 1, 0, 0))).toBe(CAP);
    expect(backfillRatedGames(user(5000, 0, 0))).toBe(CAP);
    expect(backfillRatedGames(user(3000, 1500, 500))).toBe(CAP);
  });

  // THE CAP IS A K DIAL. It decides how many post-migration games a veteran
  // spends at K_NEW before stepping down, and therefore how fast a ladder that
  // currently ranks PLAY TIME (rho 0.897) re-sorts into one that ranks skill.
  // Pinned as an explicit table so moving it is a deliberate act with a visible
  // diff, not an accident.
  it('walks the boundary cleanly at 0, 1, cap-1, cap, cap+1 and a grinder', () => {
    const table = [[0, 0], [1, 1], [CAP - 1, CAP - 1], [CAP, CAP], [CAP + 1, CAP], [5000, CAP]];
    for (const [career, expected] of table) {
      expect(backfillRatedGames(user(career, 0, 0))).toBe(expected);
    }
  });

  // THE SAFETY PROPERTY, and the reason the cap may never be lowered to 0.
  // ratedGames === 0 is what marks an account as needing placements, and a
  // placement OVERWRITES the rating with a 500-800 seed. Every account with any
  // ranked history must therefore backfill to a non-zero value.
  it('never returns 0 for an account with any career game at all', () => {
    for (const career of [1, 2, 7, CAP - 1, CAP, CAP + 1, 500, 5000]) {
      expect(backfillRatedGames(user(career, 0, 0))).toBeGreaterThan(0);
    }
    // ...and only a genuinely gameless account returns 0.
    expect(backfillRatedGames(user(0, 0, 0))).toBe(0);
  });

  it('puts a capped veteran in K_MID or faster, never straight to K_VET', () => {
    // The cap exists to buy a settling window. If it ever lands at or above
    // K_MID_UNTIL the veteran starts at K_VET and the window is gone.
    expect(kFactor(RATED_GAMES_BACKFILL_CAP)).toBeGreaterThan(K_VET);
    expect(RATED_GAMES_BACKFILL_CAP).toBeLessThan(K_MID_UNTIL);
  });

  it('treats missing counters as 0 rather than NaN', () => {
    expect(backfillRatedGames({})).toBe(0);
    expect(backfillRatedGames({ duels_wins: undefined, duels_losses: undefined, duels_tied: undefined })).toBe(0);
    expect(backfillRatedGames(undefined)).toBe(0);
    expect(backfillRatedGames(null)).toBe(0);
  });

  it('is idempotent — re-running the migration cannot inflate the count', () => {
    // Deliberately BELOW the cap, so this exercises the summing path rather
    // than being saved by min(). The capped case is the next test.
    const doc = { duels_wins: 5, duels_losses: 4, duels_tied: 3 };
    const first = backfillRatedGames(doc);
    doc.ratedGames = first; // what the migration writes
    const second = backfillRatedGames(doc);
    doc.ratedGames = second;
    const third = backfillRatedGames(doc);

    expect(first).toBe(12);
    expect(first).toBeLessThan(RATED_GAMES_BACKFILL_CAP);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('is idempotent for a capped veteran too', () => {
    const doc = { duels_wins: 4000, duels_losses: 3000, duels_tied: 100 };
    const first = backfillRatedGames(doc);
    doc.ratedGames = first;
    expect(first).toBe(RATED_GAMES_BACKFILL_CAP);
    expect(backfillRatedGames(doc)).toBe(RATED_GAMES_BACKFILL_CAP);
  });
});

describe('isPlacementEligible', () => {
  it('THE VETERAN GUARD: an old account with ratedGames 0 is NOT eligible', () => {
    // If this ever returns true, migration day destroys every pre-v2 rating on
    // the ladder. This is the assertion that must never be relaxed.
    expect(isPlacementEligible({ ratedGames: 0, created_at: BEFORE }, MIGRATION)).toBe(false);
  });

  it('rejects an old account that already has rated games', () => {
    expect(isPlacementEligible({ ratedGames: RATED_GAMES_BACKFILL_CAP, created_at: BEFORE }, MIGRATION)).toBe(false);
  });

  it('accepts a genuinely new account with no rated games', () => {
    expect(isPlacementEligible({ ratedGames: 0, created_at: AFTER }, MIGRATION)).toBe(true);
  });

  it('rejects a new account the moment it has played one rated game', () => {
    expect(isPlacementEligible({ ratedGames: 1, created_at: AFTER }, MIGRATION)).toBe(false);
  });

  it('treats a missing ratedGames on a new account as 0', () => {
    expect(isPlacementEligible({ ratedGames: undefined, created_at: AFTER }, MIGRATION)).toBe(true);
    expect(isPlacementEligible({ created_at: AFTER }, MIGRATION)).toBe(true);
  });

  it('accepts an account created exactly AT the migration instant', () => {
    expect(isPlacementEligible({ ratedGames: 0, created_at: MIGRATION }, MIGRATION)).toBe(true);
  });

  it('rejects an account created one millisecond before the migration', () => {
    const justBefore = new Date(MIGRATION.getTime() - 1);
    expect(isPlacementEligible({ ratedGames: 0, created_at: justBefore }, MIGRATION)).toBe(false);
  });

  it('FAILS CLOSED with no created_at', () => {
    expect(isPlacementEligible({ ratedGames: 0 }, MIGRATION)).toBe(false);
    expect(isPlacementEligible({ ratedGames: 0, created_at: null }, MIGRATION)).toBe(false);
    expect(isPlacementEligible({ ratedGames: 0, created_at: '' }, MIGRATION)).toBe(false);
  });

  it('FAILS CLOSED with no migration timestamp', () => {
    expect(isPlacementEligible({ ratedGames: 0, created_at: AFTER }, undefined)).toBe(false);
    expect(isPlacementEligible({ ratedGames: 0, created_at: AFTER }, null)).toBe(false);
    expect(isPlacementEligible({ ratedGames: 0, created_at: AFTER }, '')).toBe(false);
  });

  it('FAILS CLOSED on an unparseable date on either side', () => {
    expect(isPlacementEligible({ ratedGames: 0, created_at: 'not a date' }, MIGRATION)).toBe(false);
    expect(isPlacementEligible({ ratedGames: 0, created_at: AFTER }, 'not a date')).toBe(false);
    expect(isPlacementEligible({ ratedGames: 0, created_at: new Date('nope') }, MIGRATION)).toBe(false);
  });

  it('FAILS CLOSED on a missing user object', () => {
    expect(isPlacementEligible(undefined, MIGRATION)).toBe(false);
    expect(isPlacementEligible(null, MIGRATION)).toBe(false);
    expect(isPlacementEligible({}, MIGRATION)).toBe(false);
  });

  it('accepts ISO strings and epoch millis, not just Date objects', () => {
    expect(isPlacementEligible({ ratedGames: 0, created_at: AFTER.toISOString() }, MIGRATION.toISOString())).toBe(true);
    expect(isPlacementEligible({ ratedGames: 0, created_at: AFTER.getTime() }, MIGRATION.getTime())).toBe(true);
    expect(isPlacementEligible({ ratedGames: 0, created_at: BEFORE.toISOString() }, MIGRATION.toISOString())).toBe(false);
  });

  it('the two gates compose: backfilled veterans are rejected on BOTH counts', () => {
    const veteran = { duels_wins: 900, duels_losses: 800, duels_tied: 40, created_at: BEFORE };
    veteran.ratedGames = backfillRatedGames(veteran);

    expect(veteran.ratedGames).toBe(RATED_GAMES_BACKFILL_CAP);
    expect(isPlacementEligible(veteran, MIGRATION)).toBe(false);
  });
});

// Gate 3: lastRankedAt terminates placement. Without it the gate never closes,
// because a placement win deliberately leaves ratedGames at 0, so the player
// would be re-placed against a throwing bot on every queue join forever.
describe('isPlacementEligible - gate 3 (placement termination)', () => {
  const MIG = new Date('2026-09-01T05:00:00Z');
  const after = new Date('2026-09-10T00:00:00Z');

  it('is eligible before any placement has completed', () => {
    expect(isPlacementEligible({ ratedGames: 0, created_at: after }, MIG)).toBe(true);
  });

  it('is NOT eligible once lastRankedAt is stamped, even with ratedGames still 0', () => {
    expect(isPlacementEligible(
      { ratedGames: 0, created_at: after, lastRankedAt: new Date('2026-09-10T01:00:00Z') },
      MIG,
    )).toBe(false);
  });

  it('stays eligible after a failed placement (no seed landed, so no lastRankedAt)', () => {
    expect(isPlacementEligible(
      { ratedGames: 0, created_at: after, lastRankedAt: null },
      MIG,
    )).toBe(true);
  });
});
