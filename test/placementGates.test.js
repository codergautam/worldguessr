import { describe, it, expect } from 'vitest';
import { isPlacementEligible, backfillRatedGames } from '../components/utils/placementGates.js';

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

  it('sums the historical duel counters', () => {
    expect(backfillRatedGames(user(0, 0, 0))).toBe(0);
    expect(backfillRatedGames(user(1, 0, 0))).toBe(1);
    expect(backfillRatedGames(user(40, 20, 9))).toBe(69);
    expect(backfillRatedGames(user(40, 20, 10))).toBe(70);
  });

  it('caps at 70 so a legacy veteran lands in the K_VET bucket', () => {
    expect(backfillRatedGames(user(71, 0, 0))).toBe(70);
    expect(backfillRatedGames(user(5000, 0, 0))).toBe(70);
    expect(backfillRatedGames(user(3000, 1500, 500))).toBe(70);
  });

  it('treats missing counters as 0 rather than NaN', () => {
    expect(backfillRatedGames({})).toBe(0);
    expect(backfillRatedGames({ duels_wins: undefined, duels_losses: undefined, duels_tied: undefined })).toBe(0);
    expect(backfillRatedGames(undefined)).toBe(0);
    expect(backfillRatedGames(null)).toBe(0);
  });

  it('is idempotent — re-running the migration cannot inflate the count', () => {
    const doc = { duels_wins: 30, duels_losses: 20, duels_tied: 5 };
    const first = backfillRatedGames(doc);
    doc.ratedGames = first; // what the migration writes
    const second = backfillRatedGames(doc);
    doc.ratedGames = second;
    const third = backfillRatedGames(doc);

    expect(first).toBe(55);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('is idempotent for a capped veteran too', () => {
    const doc = { duels_wins: 4000, duels_losses: 3000, duels_tied: 100 };
    const first = backfillRatedGames(doc);
    doc.ratedGames = first;
    expect(first).toBe(70);
    expect(backfillRatedGames(doc)).toBe(70);
  });
});

describe('isPlacementEligible', () => {
  it('THE VETERAN GUARD: an old account with ratedGames 0 is NOT eligible', () => {
    // If this ever returns true, migration day destroys every pre-v2 rating on
    // the ladder. This is the assertion that must never be relaxed.
    expect(isPlacementEligible({ ratedGames: 0, created_at: BEFORE }, MIGRATION)).toBe(false);
  });

  it('rejects an old account that already has rated games', () => {
    expect(isPlacementEligible({ ratedGames: 70, created_at: BEFORE }, MIGRATION)).toBe(false);
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

    expect(veteran.ratedGames).toBe(70);
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
