import { describe, it, expect } from 'vitest';
import {
  careerRankedGames,
  isOgAccount,
  grinderStamps,
  leagueStarterStamps,
  milestoneStamps,
  milestoneBreakdown,
  floorTopUpStamps,
  resolvePeakElo,
  planGrants,
  floorOnlyPlan,
  GRINDER_STAMPS_CAP,
  TOP100_BONUS_STAMPS,
  MINIMUM_TOTAL_STAMPS,
  LEAGUE_STARTER_STAMPS,
} from '../scripts/grantSeason1Compensation.js';

// ===========================================================================
// WHY THIS FILE EXISTS
// ===========================================================================
// scripts/grantSeason1Compensation.js moves currency. Stamps go through the
// ledger under stable idempotency keys, and a key is burned at its first
// NON-ZERO amount: if a run pays `a:season1:X:league` 100 and a later run
// computes 250, the second write is a duplicate and the 150 difference is never
// paid. So the calculators have to be right the first time, and they carry two
// guarantees that this file exists to hold:
//
//   1. PURITY. Every number is a function of PRE-migration fields only, which is
//      what makes the dry run an exact rehearsal of the apply run, and what lets
//      the first-login modal display the same numbers the script paid.
//   2. TOTALITY. They run over 2M documents written across eight years of schema
//      changes. A NaN reaching grantStamps throws inside assertReason and takes
//      the batch with it. So every calculator must return a finite, non-negative
//      integer for literally any input — that is the last describe() block
//      below, and it is the one that must never be relaxed.
//
// The XP grant this script used to pay (veteranXp / eloConversionXp /
// ogTenureXp, up to 2,350,000 per account) was cut before it ever ran in
// production. Its tests went with it. See the script header for why.
// ===========================================================================

const utc = (...args) => new Date(Date.UTC(...args));

describe('careerRankedGames', () => {
  it('sums the three duel counters', () => {
    expect(careerRankedGames({ duels_wins: 40, duels_losses: 20, duels_tied: 9 })).toBe(69);
    expect(careerRankedGames({ duels_wins: 3000, duels_losses: 1500, duels_tied: 500 })).toBe(5000);
  });

  it('treats missing counters as 0 rather than NaN', () => {
    expect(careerRankedGames({})).toBe(0);
    expect(careerRankedGames({ duels_wins: 10 })).toBe(10);
    expect(careerRankedGames(null)).toBe(0);
    expect(careerRankedGames(undefined)).toBe(0);
  });
});

describe('isOgAccount', () => {
  it('badges accounts created strictly before 2025-08-01', () => {
    expect(isOgAccount(utc(2019, 5, 5))).toBe(true);
    expect(isOgAccount(Date.UTC(2025, 7, 1) - 1)).toBe(true);
    expect(isOgAccount(Date.UTC(2025, 7, 1))).toBe(false);
    expect(isOgAccount(utc(2026, 0, 1))).toBe(false);
  });

  it('accepts Date objects, ISO strings and epoch millis alike', () => {
    const iso = '2024-08-01T00:00:00.000Z';
    expect(isOgAccount(iso)).toBe(true);
    expect(isOgAccount(new Date(iso))).toBe(true);
    expect(isOgAccount(Date.parse(iso))).toBe(true);
  });

  it('FAILS CLOSED on a missing or unparseable created_at', () => {
    expect(isOgAccount(undefined)).toBe(false);
    expect(isOgAccount(null)).toBe(false);
    expect(isOgAccount('')).toBe(false);
    expect(isOgAccount('yesterday')).toBe(false);
    expect(isOgAccount(new Date('nope'))).toBe(false);
  });
});

describe('grinderStamps', () => {
  it('pays one stamp per five career ranked games', () => {
    expect(grinderStamps(0)).toBe(0);
    expect(grinderStamps(2)).toBe(0);
    expect(grinderStamps(3)).toBe(1);   // rounds
    expect(grinderStamps(5)).toBe(1);
    expect(grinderStamps(30)).toBe(6);
    expect(grinderStamps(500)).toBe(100);
    expect(grinderStamps(2500)).toBe(500);
  });

  it('caps at 1,000 stamps, reached at exactly 5,000 games', () => {
    expect(grinderStamps(4999)).toBe(1000);   // rounds to the cap
    expect(grinderStamps(5000)).toBe(GRINDER_STAMPS_CAP);
    expect(grinderStamps(50000)).toBe(GRINDER_STAMPS_CAP);
    expect(grinderStamps(1e9)).toBe(GRINDER_STAMPS_CAP);
    expect(GRINDER_STAMPS_CAP).toBe(1000);
  });
});

describe('leagueStarterStamps', () => {
  it('pays by Season 0 peak league', () => {
    expect(leagueStarterStamps('Trekker')).toBe(100);
    expect(leagueStarterStamps('Explorer')).toBe(150);
    expect(leagueStarterStamps('Voyager')).toBe(250);
    expect(leagueStarterStamps('Nomad')).toBe(500);
  });

  it('adds the top-100 bonus on top of the league amount', () => {
    expect(leagueStarterStamps('Nomad', true)).toBe(500 + TOP100_BONUS_STAMPS);
    expect(leagueStarterStamps('Trekker', true)).toBe(100 + TOP100_BONUS_STAMPS);
    // Only an explicit true. A truthy accident must not mint 300 stamps.
    expect(leagueStarterStamps('Nomad', 1)).toBe(500);
    expect(leagueStarterStamps('Nomad', 'yes')).toBe(500);
  });

  it('pays 0 for an unbudgeted league name instead of guessing', () => {
    // run() refuses to APPLY while any in-scope account has one of these, so a
    // real player can never be silently underpaid by this branch. A 0 also
    // writes no ledger row, so it stays repayable by a corrected run.
    expect(leagueStarterStamps('Legend')).toBe(0);
    expect(leagueStarterStamps('trekker')).toBe(0);  // case matters
    expect(leagueStarterStamps(null)).toBe(0);
    expect(leagueStarterStamps(undefined)).toBe(0);
  });
});

describe('milestoneStamps', () => {
  it('is CUMULATIVE — every tier cleared pays, not just the highest', () => {
    expect(milestoneStamps(99)).toBe(0);
    expect(milestoneStamps(100)).toBe(20);
    expect(milestoneStamps(500)).toBe(20 + 60);
    expect(milestoneStamps(1000)).toBe(20 + 60 + 120);
    expect(milestoneStamps(5000)).toBe(20 + 60 + 120 + 400);
    expect(milestoneStamps(5000)).toBe(600);
  });

  it('holds a tier until the next threshold is actually reached', () => {
    expect(milestoneStamps(499)).toBe(20);
    expect(milestoneStamps(999)).toBe(80);
    expect(milestoneStamps(4999)).toBe(200);
    expect(milestoneStamps(50000)).toBe(600);
  });

  it('breaks the tiers out for per-tier ledger keys', () => {
    expect(milestoneBreakdown(99).map((t) => t.games)).toEqual([]);
    expect(milestoneBreakdown(1000).map((t) => t.games)).toEqual([100, 500, 1000]);
    expect(milestoneBreakdown(5000).map((t) => t.games)).toEqual([100, 500, 1000, 5000]);
  });
});

describe('floorTopUpStamps', () => {
  it('lifts a short earned total to the floor and never further', () => {
    expect(MINIMUM_TOTAL_STAMPS).toBe(100);
    expect(floorTopUpStamps(0)).toBe(100);
    expect(floorTopUpStamps(1)).toBe(99);
    expect(floorTopUpStamps(99)).toBe(1);
    expect(floorTopUpStamps(100)).toBe(0);
    expect(floorTopUpStamps(2400)).toBe(0);
  });

  it('never goes negative, whatever the earned total claims to be', () => {
    expect(floorTopUpStamps(-500)).toBe(100);
    expect(floorTopUpStamps(-Infinity)).toBe(100);
  });

  it('pays the FULL floor for an unusable earned total, not zero', () => {
    // An earned total that is not a usable number reads as 0, so the account is
    // over-paid by at most the floor rather than under-paid. Unreachable in
    // practice (the earned total is a sum of capped integers) — this pins the
    // direction the failure falls in.
    expect(floorTopUpStamps(Infinity)).toBe(100);
    expect(floorTopUpStamps(NaN)).toBe(100);
    expect(floorTopUpStamps(undefined)).toBe(100);
  });
});

describe('resolvePeakElo', () => {
  it('prefers the peak and falls back to the closing rating', () => {
    expect(resolvePeakElo({ seasonPeakElo: 15000, elo_s0: 12000 })).toBe(15000);
    expect(resolvePeakElo({ seasonPeakElo: null, elo_s0: 12000 })).toBe(12000);
    expect(resolvePeakElo({ elo_s0: 12000 })).toBe(12000);
    expect(resolvePeakElo({ seasonPeakElo: NaN, elo_s0: 12000 })).toBe(12000);
  });

  it('does NOT let a null peak collapse to 0', () => {
    // Number(null) === 0, so a naive Number.isFinite() check would read a null
    // peak as a real rating of 0 instead of falling back to elo_s0.
    expect(resolvePeakElo({ seasonPeakElo: null, elo_s0: 20000 })).toBe(20000);
    expect(resolvePeakElo({ seasonPeakElo: 0, elo_s0: 20000 })).toBe(0); // a real 0 is kept
  });

  it('returns null when there is nothing to key on, so the account is skipped', () => {
    expect(resolvePeakElo({})).toBe(null);
    expect(resolvePeakElo({ seasonPeakElo: null, elo_s0: null })).toBe(null);
    expect(resolvePeakElo(null)).toBe(null);
  });
});

describe('planGrants — the three accounts the modal copy was written against', () => {
  it('a 20,000-elo, 5,000-game, 2y+ veteran', () => {
    const plan = planGrants({
      seasonPeakElo: 20000,
      seasonPeakLeague: 'Nomad',
      elo_s0: 20000,
      duels_wins: 3000, duels_losses: 1500, duels_tied: 500,
      created_at: utc(2021, 0, 1),
    }, { isTop100: true });

    expect(plan.games).toBe(5000);
    expect(plan.ogAccount).toBe(true);
    expect(plan.grinderStamps).toBe(1000);
    expect(plan.leagueStarterStamps).toBe(800); // 500 Nomad + 300 top-100
    expect(plan.milestoneStamps).toBe(600);
    expect(plan.stampsTotal).toBe(2400);
  });

  it('a median 1,317-elo, 30-game player', () => {
    const plan = planGrants({
      seasonPeakElo: 1317,
      seasonPeakLeague: 'Trekker',
      elo_s0: 1200,
      duels_wins: 14, duels_losses: 15, duels_tied: 1,
      created_at: utc(2025, 0, 15),
    });

    expect(plan.games).toBe(30);
    expect(plan.ogAccount).toBe(true);
    expect(plan.grinderStamps).toBe(6);
    expect(plan.leagueStarterStamps).toBe(100);
    expect(plan.milestoneStamps).toBe(0);
    expect(plan.stampsTotal).toBe(106);
  });

  it('a fresh 1,000-elo account with no ranked games', () => {
    const plan = planGrants({
      seasonPeakElo: 1000,
      seasonPeakLeague: 'Trekker',
      elo_s0: 1000,
      duels_wins: 0, duels_losses: 0, duels_tied: 0,
      created_at: utc(2026, 6, 20),
    });

    expect(plan.games).toBe(0);
    expect(plan.ogAccount).toBe(false);
    expect(plan.grinderStamps).toBe(0);
    expect(plan.leagueStarterStamps).toBe(100);
    expect(plan.milestoneStamps).toBe(0);
    expect(plan.stampsTotal).toBe(100);
  });

  it('grants NO XP — the field does not exist on a plan any more', () => {
    // The migration used to pay up to 2,350,000 XP here. If any of these come
    // back defined, the XP grant has been re-added and every XP graph on the
    // site is about to grow a vertical cliff. See the script header.
    const plan = planGrants({
      seasonPeakElo: 20000, seasonPeakLeague: 'Nomad', elo_s0: 20000,
      duels_wins: 1e6, duels_losses: 1e6, duels_tied: 1e6,
      created_at: utc(2015, 0, 1),
    }, { isTop100: true });

    expect(plan.xpTotal).toBeUndefined();
    expect(plan.veteranXp).toBeUndefined();
    expect(plan.eloConversionXp).toBeUndefined();
    expect(plan.ogTenureXp).toBeUndefined();
  });

  it('no account can be planned above 2,400 stamps', () => {
    // 1,000 grinder + 500 Nomad + 300 top-100 + 600 milestones. Everything is
    // capped, so a grind farm and a corrupt counter plan the same maximum.
    const maxed = planGrants({
      seasonPeakElo: 999999,
      seasonPeakLeague: 'Nomad',
      duels_wins: 1e9, duels_losses: 1e9, duels_tied: 1e9,
      created_at: utc(2015, 0, 1),
    }, { isTop100: true });

    expect(maxed.stampsTotal).toBe(2400);
  });

  it('returns null for an account with no rating, so run() falls back to the floor', () => {
    // run() does `planGrants(u, ...) || floorOnlyPlan(u)`: nothing here can be
    // keyed on a league or a peak that does not exist, but the account is still
    // paid MINIMUM_TOTAL_STAMPS.
    expect(planGrants({ duels_wins: 500, created_at: utc(2020, 0, 1) })).toBe(null);
    expect(planGrants(null)).toBe(null);
    expect(planGrants(undefined)).toBe(null);
  });

  it('is pure — the same document always plans the same grant', () => {
    const doc = {
      seasonPeakElo: 8123, seasonPeakLeague: 'Nomad', elo_s0: 7000,
      duels_wins: 601, duels_losses: 402, duels_tied: 11,
      created_at: utc(2023, 3, 9),
    };
    const a = planGrants(doc);
    const b = planGrants(doc);
    expect(b).toEqual(a);
    // and it never reads a field the script writes
    doc.totalXp = 9999999;
    doc.stamps = 5000;
    doc.ogAccount = true;
    expect(planGrants(doc)).toEqual(a);
  });
});

// ===========================================================================
// THE 100 STAMP FLOOR. Nobody leaves the migration under it.
// ===========================================================================
describe('the MINIMUM_TOTAL_STAMPS floor', () => {
  it('costs nothing on an ordinary account — the league starter already clears it', () => {
    // The Season 0 starter table's lowest tier IS the floor, and every rating
    // resolves to a tier, so the top-up is 0 for every healthy document.
    expect(Math.min(...Object.values(LEAGUE_STARTER_STAMPS))).toBe(MINIMUM_TOTAL_STAMPS);

    const fresh = planGrants({
      seasonPeakElo: 1000, seasonPeakLeague: 'Trekker', elo_s0: 1000,
      duels_wins: 0, duels_losses: 0, duels_tied: 0,
      created_at: utc(2026, 6, 20),
    });
    expect(fresh.earnedStamps).toBe(100);
    expect(fresh.floorTopUpStamps).toBe(0);
    expect(fresh.stampsTotal).toBe(100);
  });

  it('tops up the account the earned components would pay nothing', () => {
    // An unbudgeted league name pays 0 (run() gates on it, but --allow-unknown-league
    // exists) and 0 games pays 0 grinder and 0 milestones. Pre-floor this account
    // received literally nothing.
    const stranded = planGrants({
      seasonPeakElo: 4200, seasonPeakLeague: 'Legend', elo_s0: 4200,
      duels_wins: 0, duels_losses: 0, duels_tied: 0,
      created_at: utc(2024, 2, 2),
    });
    expect(stranded.earnedStamps).toBe(0);
    expect(stranded.floorTopUpStamps).toBe(MINIMUM_TOTAL_STAMPS);
    expect(stranded.stampsTotal).toBe(MINIMUM_TOTAL_STAMPS);
  });

  it('tops up partially when the earned components fall short', () => {
    const partial = planGrants({
      seasonPeakElo: 4200, seasonPeakLeague: 'Legend', elo_s0: 4200,
      duels_wins: 30, duels_losses: 30, duels_tied: 0,   // 60 games -> 12 grinder
      created_at: utc(2024, 2, 2),
    });
    expect(partial.earnedStamps).toBe(12);
    expect(partial.floorTopUpStamps).toBe(88);
    expect(partial.stampsTotal).toBe(MINIMUM_TOTAL_STAMPS);
  });

  it('never tops up an account that already clears the floor', () => {
    const veteran = planGrants({
      seasonPeakElo: 20000, seasonPeakLeague: 'Nomad', elo_s0: 20000,
      duels_wins: 3000, duels_losses: 1500, duels_tied: 500,
      created_at: utc(2021, 0, 1),
    }, { isTop100: true });
    expect(veteran.floorTopUpStamps).toBe(0);
    expect(veteran.stampsTotal).toBe(2400);  // the cap is unmoved by the floor
  });

  it('holds for every combination of league, games and top-100 status', () => {
    const LEAGUES = ['Trekker', 'Explorer', 'Voyager', 'Nomad', 'Legend', null, undefined, ''];
    const GAMES = [0, 1, 4, 99, 100, 499, 5000, 1e9];
    for (const league of LEAGUES) {
      for (const games of GAMES) {
        for (const isTop100 of [false, true]) {
          const plan = planGrants({
            seasonPeakElo: 1500, elo_s0: 1500, seasonPeakLeague: league,
            duels_wins: games, duels_losses: 0, duels_tied: 0,
            created_at: utc(2023, 0, 1),
          }, { isTop100 });
          expect(plan.stampsTotal, `${league}/${games}/${isTop100}`)
            .toBeGreaterThanOrEqual(MINIMUM_TOTAL_STAMPS);
          expect(plan.stampsTotal).toBe(plan.earnedStamps + plan.floorTopUpStamps);
        }
      }
    }
  });

  it('pays the floor, and only the floor, to an account with no usable rating', () => {
    const plan = floorOnlyPlan({ duels_wins: 500, created_at: utc(2020, 0, 1) });
    expect(plan.noRating).toBe(true);
    expect(plan.stampsTotal).toBe(MINIMUM_TOTAL_STAMPS);
    expect(plan.floorTopUpStamps).toBe(MINIMUM_TOTAL_STAMPS);
    // Every earned component is 0 — a 0 writes no ledger row and burns no
    // idempotency key, so a later run against a repaired document pays them in full.
    expect(plan.earnedStamps).toBe(0);
    expect(plan.grinderStamps).toBe(0);
    expect(plan.leagueStarterStamps).toBe(0);
    expect(plan.milestoneStamps).toBe(0);
    expect(plan.milestones).toEqual([]);
    // The OG badge is created_at only and never depended on a rating.
    expect(plan.ogAccount).toBe(true);
  });

  it('survives a garbage document rather than skipping the payout', () => {
    for (const doc of [null, undefined, {}, { duels_wins: NaN }, { created_at: 'nope' }]) {
      const plan = floorOnlyPlan(doc);
      expect(plan.stampsTotal).toBe(MINIMUM_TOTAL_STAMPS);
      expect(Number.isInteger(plan.games)).toBe(true);
    }
  });
});

// ===========================================================================
// TOTALITY. The block that must never be relaxed.
// ===========================================================================
describe('every calculator is total over garbage input', () => {
  const GARBAGE = [
    undefined, null, NaN, '', 'abc', 'NaN', {}, [], [1, 2], true, false,
    -1, -0, -1e9, -Infinity, Infinity, 1e308, Number.MAX_SAFE_INTEGER,
    Number.MIN_SAFE_INTEGER, 0.5, -0.5, new Date('nope'), () => {},
  ];

  const CALCULATORS = {
    grinderStamps,
    leagueStarterStamps,
    milestoneStamps,
    floorTopUpStamps,
  };

  for (const [name, fn] of Object.entries(CALCULATORS)) {
    it(`${name} returns a finite non-negative integer for anything`, () => {
      for (const value of GARBAGE) {
        const out = fn(value);
        // A NaN here throws inside assertReason and kills the batch mid-flight.
        expect(Number.isFinite(out), `${name}(${String(value)}) = ${out}`).toBe(true);
        expect(Number.isInteger(out), `${name}(${String(value)}) = ${out}`).toBe(true);
        expect(out).toBeGreaterThanOrEqual(0);
      }
    });
  }

  it('the garbage list actually covers the required shapes', () => {
    expect(GARBAGE).toContain(undefined);
    expect(GARBAGE).toContain(null);
    expect(GARBAGE.some(Number.isNaN)).toBe(true);
    expect(GARBAGE).toContain(-Infinity);
    expect(GARBAGE).toContain(Infinity);
    expect(GARBAGE).toContain(1e308);
  });

  it('garbage never produces an oversized payout either', () => {
    for (const value of GARBAGE) {
      expect(grinderStamps(value)).toBeLessThanOrEqual(GRINDER_STAMPS_CAP);
      expect(milestoneStamps(value)).toBeLessThanOrEqual(600);
      expect(leagueStarterStamps(value)).toBeLessThanOrEqual(500);
      expect(floorTopUpStamps(value)).toBeLessThanOrEqual(MINIMUM_TOTAL_STAMPS);
    }
  });

  it('careerRankedGames survives a garbage document', () => {
    for (const value of GARBAGE) {
      const out = careerRankedGames(value);
      expect(Number.isInteger(out)).toBe(true);
      expect(out).toBeGreaterThanOrEqual(0);
      const doc = { duels_wins: value, duels_losses: value, duels_tied: value };
      const summed = careerRankedGames(doc);
      expect(Number.isInteger(summed)).toBe(true);
      expect(summed).toBeGreaterThanOrEqual(0);
    }
  });

  it('grant amounts are integers, which the stamps ledger requires', () => {
    // serverUtils/stamps/reasons.js assertReason THROWS on a non-integer delta.
    for (const games of [0, 3, 7, 99, 501, 4999, 5001]) {
      expect(Number.isInteger(grinderStamps(games))).toBe(true);
      expect(Number.isInteger(milestoneStamps(games))).toBe(true);
    }
  });

  it('every stamp grant stays inside the admin_adjust maxAbs of 100,000', () => {
    // A delta over the ceiling throws mid-batch instead of paying.
    expect(grinderStamps(1e9) + leagueStarterStamps('Nomad', true) + milestoneStamps(1e9))
      .toBeLessThanOrEqual(100000);
  });
});
