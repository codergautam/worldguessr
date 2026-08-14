import { describe, it, expect, afterEach } from 'vitest';
import {
  leagues,
  leaguesV2,
  getLeague,
  getLeagueBelow,
  getLeagueRange,
  setLeagueConfig,
  getActiveLeagues,
  clearLeagueConfig,
  getStrictFloor,
  STRICT_TIER_NAME,
} from '../components/utils/leagues.js';

// setLeagueConfig installs MODULE-LEVEL state. Every suite here must hand the
// module back in the state it found it, or an unrelated file's expectations
// start depending on test execution order.
afterEach(() => {
  clearLeagueConfig();
});

// Silence + capture the deliberate console.warn on a rejected config, so the
// rejection can be asserted instead of merely scrolling past.
function captureWarnings(fn) {
  const original = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const result = fn();
    return { result, warnings };
  } finally {
    console.warn = original;
  }
}

// The v2 tier table as a RatingConfig `tiers` array.
const V2_TIERS = [
  { name: 'Trekker', min: 0, max: 799 },
  { name: 'Explorer', min: 800, max: 999 },
  { name: 'Voyager', min: 1000, max: 1299 },
  { name: 'Nomad', min: 1300, max: 1799 },
  { name: 'Legend', min: 1800, max: Infinity, emoji: '👑', color: '#dc143c' },
];

// RATING_V2 is now hardcoded `true` (components/utils/ratingFlags.js): the
// rollout flag is spent, so with no config doc installed the ACTIVE table is
// v2, not v1. These assertions used to describe the flag-off default and are
// re-pointed at v2 rather than deleted, because "what does an unconfigured
// process bucket a rating as" is exactly the question that must stay covered.
// The v1 table is still exported and still asserted below, since the Season 0
// Hall of Fame derives its league names from it.
describe('default behaviour with no config doc installed (v2 is active)', () => {
  it('never throws on an unknown league name, it falls back to the lowest tier', () => {
    expect(() => getLeagueRange('nope')).not.toThrow();
    expect(getLeagueRange('nope')).toEqual([0, 799]);
    expect(getLeagueRange(undefined)).toEqual([0, 799]);
    expect(getLeagueRange(null)).toEqual([0, 799]);
    expect(getLeagueRange('')).toEqual([0, 799]);
  });

  it('resolves a known name on the v2 cutoffs', () => {
    expect(getLeagueRange('Voyager')).toEqual([1000, 1299]);
  });

  it('buckets a rating on the v2 scale', () => {
    expect(getLeague(0).name).toBe('Trekker');
    expect(getLeague(799).name).toBe('Trekker');
    expect(getLeague(800).name).toBe('Explorer');
    expect(getLeague(1000).name).toBe('Voyager');
    expect(getLeague(1300).name).toBe('Nomad');
    expect(getLeague(1800).name).toBe('Legend');
  });

  it('exposes the v2 table as the active one', () => {
    expect(getActiveLeagues()).toBe(leaguesV2);
  });

  // The v1 table has to survive as DATA even though it is no longer active:
  // scripts/exportSeason0HallOfFame.js derives Season 0 league names from these
  // cutoffs, and a Season 0 peak badge is meaningless on the v2 scale.
  it('still exports the Season 0 table with its original cutoffs', () => {
    const byName = Object.values(leagues).reduce((a, l) => ({ ...a, [l.name]: l }), {});
    expect(byName.Trekker.max).toBe(1999);
    expect(byName.Explorer.min).toBe(2000);
    expect(byName.Voyager.min).toBe(5000);
    expect(byName.Nomad.max).toBe(20000);
  });
});

describe('getLeagueBelow', () => {
  it('returns the tier directly beneath each one', () => {
    expect(getLeagueBelow(leaguesV2.explorerV2).name).toBe('Trekker');
    expect(getLeagueBelow(leaguesV2.voyagerV2).name).toBe('Explorer');
    expect(getLeagueBelow(leaguesV2.nomadV2).name).toBe('Voyager');
    expect(getLeagueBelow(leaguesV2.legendV2).name).toBe('Nomad');
  });

  it('returns null for the bottom tier', () => {
    expect(getLeagueBelow(leaguesV2.trekkerV2)).toBeNull();
  });

  it('returns null rather than throwing on junk', () => {
    expect(getLeagueBelow(null)).toBeNull();
    expect(getLeagueBelow(undefined)).toBeNull();
    expect(getLeagueBelow({})).toBeNull();
    expect(getLeagueBelow({ min: NaN })).toBeNull();
  });

  it('reads the ceiling of a GAPPED config table, not min - 1', () => {
    // setLeagueConfig only requires the next floor to clear the previous
    // ceiling, so tiers may leave a hole. The boundary grace has to key off the
    // neighbour's real ceiling (799), which is where players actually sit.
    expect(setLeagueConfig([
      { name: 'Trekker', min: 0, max: 799 },
      { name: 'Explorer', min: 850, max: 999 },
    ])).toBe(true);
    const explorer = Object.values(getActiveLeagues()).find((l) => l.name === 'Explorer');
    expect(getLeagueBelow(explorer).max).toBe(799);
  });

  it('follows a config re-anchor instead of the built-in table', () => {
    expect(setLeagueConfig([
      { name: 'Trekker', min: 0, max: 499 },
      { name: 'Explorer', min: 500, max: 1499 },
      { name: 'Voyager', min: 1500, max: 2999 },
    ])).toBe(true);
    const voyager = Object.values(getActiveLeagues()).find((l) => l.name === 'Voyager');
    expect(getLeagueBelow(voyager).max).toBe(1499);
  });
});

describe('v2 tier table installed via setLeagueConfig', () => {
  it('installs and buckets on the v2 cutoffs', () => {
    expect(setLeagueConfig(V2_TIERS)).toBe(true);

    expect(getLeague(0).name).toBe('Trekker');
    expect(getLeague(799).name).toBe('Trekker');
    expect(getLeague(800).name).toBe('Explorer');
    expect(getLeague(999).name).toBe('Explorer');
    expect(getLeague(1000).name).toBe('Voyager');
    expect(getLeague(1299).name).toBe('Voyager');
    expect(getLeague(1300).name).toBe('Nomad');
    expect(getLeague(1799).name).toBe('Nomad');
    expect(getLeague(1800).name).toBe('Legend');
    expect(getLeague(99999).name).toBe('Legend');
  });

  it('matches the hardcoded leaguesV2 bounds exactly', () => {
    setLeagueConfig(V2_TIERS);
    for (const tier of Object.values(leaguesV2)) {
      expect(getLeagueRange(tier.name)).toEqual([tier.min, tier.max]);
    }
  });

  it('backfills cosmetics a bounds-only config omits', () => {
    // A bounds-only doc must never render an undefined colour or a missing
    // emoji, and Trekker's `light` (not `lightColor`) drives the name glow.
    expect(setLeagueConfig([{ name: 'Trekker', min: 0, max: 799 }])).toBe(true);
    const trekker = getLeague(100);

    expect(trekker.emoji).toBe('🥾');
    expect(trekker.color).toBe('#808080');
    expect(trekker.light).toBe('#d3d3d3');
  });

  it('still falls back rather than throwing on an unknown name', () => {
    setLeagueConfig(V2_TIERS);
    expect(() => getLeagueRange('Bronze III')).not.toThrow();
    expect(getLeagueRange('Bronze III')).toEqual([0, 799]);
  });
});

describe('malformed configs are REJECTED and the previous table survives', () => {
  const cases = [
    ['not an array', 'nope'],
    ['null', null],
    ['undefined', undefined],
    ['an object', { trekker: { min: 0, max: 100 } }],
    ['empty', []],
    ['a non-object tier', [null]],
    ['a tier with no name', [{ min: 0, max: 100 }]],
    ['a tier with a blank name', [{ name: '   ', min: 0, max: 100 }]],
    ['a non-numeric min', [{ name: 'A', min: null, max: 100 }]],
    ['a non-numeric max', [{ name: 'A', min: 0, max: undefined }]],
    ['a NaN bound', [{ name: 'A', min: NaN, max: 100 }]],
    ['max < min', [{ name: 'A', min: 100, max: 0 }]],
    ['overlapping ranges', [{ name: 'A', min: 0, max: 100 }, { name: 'B', min: 50, max: 200 }]],
    ['touching ranges', [{ name: 'A', min: 0, max: 100 }, { name: 'B', min: 100, max: 200 }]],
    ['out-of-order ranges', [{ name: 'A', min: 500, max: 900 }, { name: 'B', min: 0, max: 100 }]],
  ];

  for (const [label, tiers] of cases) {
    it(`rejects ${label} without throwing, keeping the live table`, () => {
      expect(setLeagueConfig(V2_TIERS)).toBe(true);
      const before = getActiveLeagues();

      const { result, warnings } = captureWarnings(() => setLeagueConfig(tiers));

      expect(result).toBe(false);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('rejected league config');

      // The v2 table installed above is still the one every reader sees.
      expect(getActiveLeagues()).toBe(before);
      expect(getLeague(0).name).toBe('Trekker');
      expect(getLeague(1800).name).toBe('Legend');
      expect(getLeagueRange('Nomad')).toEqual([1300, 1799]);
    });
  }

  it('rejects a bad config against the DEFAULT table too', () => {
    const { result } = captureWarnings(() => setLeagueConfig([]));
    expect(result).toBe(false);
    // The surviving table is the v2 default, not v1: RATING_V2 is hardcoded on.
    expect(getActiveLeagues()).toBe(leaguesV2);
    expect(getLeague(1500).name).toBe('Nomad'); // v2 bounds intact
  });
});

describe('clearLeagueConfig', () => {
  it('restores the default table', () => {
    // Install a DIFFERENT table so clearing it is observable. The v2 tiers are
    // already the default, so installing those would prove nothing.
    setLeagueConfig([
      { name: 'Trekker', min: 0, max: 499 },
      { name: 'Legend', min: 500, max: Infinity },
    ]);
    expect(getLeague(1500).name).toBe('Legend');
    expect(getLeagueRange('Trekker')).toEqual([0, 499]);

    clearLeagueConfig();

    expect(getLeague(1500).name).toBe('Nomad');   // back to the v2 default
    expect(getLeagueRange('Trekker')).toEqual([0, 799]);
    expect(getActiveLeagues()).toBe(leaguesV2);
  });

  it('is idempotent', () => {
    clearLeagueConfig();
    clearLeagueConfig();
    expect(getActiveLeagues()).toBe(leaguesV2);
  });
});

// ===========================================================================
// getStrictFloor — the constant that killed a whole feature
// ===========================================================================
// "Avoid lower skill duels" gated on `leagues.voyager.min` at five call sites:
// two in ws.js, one in web settings, one in mobile settings, and the queue
// stamp. That constant is 5,000 on the RETIRED Season 0 scale. A v2 rating
// tops out around 1,600, so every one of those comparisons was false for every
// account on the ladder: the toggle was hidden on both clients, the queue entry
// was never stamped, and the server would have refused it anyway — while the
// User field, the wire message and the "5000+ ELO" copy all kept shipping.
//
// Resolving from the ACTIVE table is also what makes a seasonal re-anchor free:
// move the tiers and the strict floor moves with them, no deploy, no release.
describe('getStrictFloor', () => {
  afterEach(() => clearLeagueConfig());

  it('returns the Voyager floor from the live v2 table, not the retired 5000', () => {
    expect(getStrictFloor()).toBe(leaguesV2.voyagerV2.min);
    expect(getStrictFloor()).not.toBe(leagues.voyager.min);
  });

  it('sits inside the actual rating range, which the v1 constant did not', () => {
    // The regression in one assertion: a floor above the top of the ladder can
    // never be cleared, so the setting is unreachable for everybody.
    const topOfLadder = leaguesV2.nomadV2.max;
    expect(getStrictFloor()).toBeLessThan(topOfLadder);
    expect(leagues.voyager.min).toBeGreaterThan(topOfLadder);
  });

  it('follows a seasonal re-anchor installed from a config doc', () => {
    setLeagueConfig([
      { name: 'Trekker', min: 0, max: 899 },
      { name: 'Explorer', min: 900, max: 1099 },
      { name: STRICT_TIER_NAME, min: 1100, max: 1399 },
      { name: 'Nomad', min: 1400, max: 1799 },
      { name: 'Legend', min: 1800, max: 100000 },
    ]);
    expect(getStrictFloor()).toBe(1100);
  });

  it('fails CLOSED on a table with no Voyager tier', () => {
    // Infinity means "nobody is eligible, nobody is filtered". A 0 would read as
    // "everyone is eligible", which silently turns the setting into a no-op for
    // every player who deliberately enabled it — the worse of the two failures.
    setLeagueConfig([
      { name: 'Bronze', min: 0, max: 999 },
      { name: 'Silver', min: 1000, max: 1999 },
    ]);
    expect(getStrictFloor()).toBe(Infinity);
  });

  it('is unaffected by a rejected config and keeps the previous table', () => {
    const before = getStrictFloor();
    expect(setLeagueConfig([{ name: 'Broken', min: 'nope', max: 10 }])).toBe(false);
    expect(getStrictFloor()).toBe(before);
  });
});
