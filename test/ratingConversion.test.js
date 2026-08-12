import { describe, it, expect } from 'vitest';
import {
  normalizeConversionTable,
  convertRating,
  convertDelta,
} from '../components/utils/ratingConversion.js';
// NOTE ON THE IMPORT: api/userProgression.js pulls in mongoose, models/User.js
// and utils/rateLimit.js. Same situation as test/eloRank.test.js (which imports
// api/eloRank.js): model registration is side-effect-free, connect() only ever
// runs inside the request handler, and nothing here touches a database.
// sanitizeProgression takes its conversion context as an ARGUMENT, so the real
// shipping code path is driven below with no map file and no env at all.
import { sanitizeProgression } from '../api/userProgression.js';

// ===========================================================================
// WHY THIS FILE EXISTS
// ===========================================================================
// Rating history is converted at READ time: api/userProgression.js runs every
// pre-migration UserStats point through the same frozen table the migration
// wrote with, so the graph has no cliff from 12,000 to 1,300.
//
// The failure mode that a code review does NOT catch is the delta:
//
//     newChange = f(elo) - f(elo - oldChange)     <-- correct
//     newChange = f(oldChange)                    <-- garbage, and it "looks fine"
//
// f is nonlinear and its domain is ABSOLUTE ratings. Feeding it a delta returns
// "the new rating of a player rated 60", a number with no meaning, which then
// renders in a tooltip as the amount the player won. The trap assertion below
// pins the two apart by more than an order of magnitude so nobody can quietly
// "simplify" the derivation back into a direct map.
// ===========================================================================

// A stand-in for data/elo-conversion-map.json (which lives on the DB box and is
// frozen before migration day). Shape-accurate, not value-accurate: old 0..20,000
// compressed onto the v2 100..1600 scale by a concave curve, so a fixed old-scale
// step is worth much less at the top of the ladder than at the bottom. That
// concavity is the ONLY property the delta rule depends on.
const OLD_MAX = 20000;
const NEW_MIN = 100;
const NEW_MAX = 1600;

function buildCurveValues() {
  const values = new Array(OLD_MAX + 1);
  for (let old = 0; old <= OLD_MAX; old++) {
    values[old] = Math.round(NEW_MIN + (NEW_MAX - NEW_MIN) * Math.pow(old / OLD_MAX, 0.55));
  }
  return values;
}

const CURVE = normalizeConversionTable(buildCurveValues());

describe('normalizeConversionTable — one on-disk format, the migration\'s', () => {
  // scripts/migrateRatingV2.js accepts these four shapes. If this file accepted a
  // different set, the migration and the read path could disagree about what the
  // same JSON file means, and the "same f(), no seam" guarantee would be a lie.
  const asArray = [100, 150, 220, 400];
  const asOffsetTable = { offset: 0, table: [100, 150, 220, 400] };
  const asKeyed = { 0: 100, 1: 150, 2: 220, 3: 400 };
  const asNestedKeyed = { map: { 0: 100, 1: 150, 2: 220, 3: 400 } };

  it('accepts a bare array, {offset, table}, a dense keyed object and {map:{...}}', () => {
    for (const raw of [asArray, asOffsetTable, asKeyed, asNestedKeyed]) {
      const table = normalizeConversionTable(raw);
      expect(table).not.toBeNull();
      expect(table.size).toBe(4);
      expect(table.minOld).toBe(0);
      expect(table.maxOld).toBe(3);
      expect([0, 1, 2, 3].map((old) => convertRating(old, table))).toEqual([100, 150, 220, 400]);
    }
  });

  it('honours a non-zero offset (index = old elo - offset)', () => {
    const table = normalizeConversionTable({ offset: 1000, table: [300, 310, 320] });
    expect(table.minOld).toBe(1000);
    expect(table.maxOld).toBe(1002);
    expect(convertRating(1001, table)).toBe(310);
  });

  it('derives the offset from a keyed object that does not start at 0', () => {
    const table = normalizeConversionTable({ 500: 250, 501: 255, 502: 260 });
    expect(table.minOld).toBe(500);
    expect(convertRating(502, table)).toBe(260);
  });

  it('counts decreasing steps instead of hiding them (rank consistency depends on it)', () => {
    expect(normalizeConversionTable([100, 200, 300]).nonMonotonicCount).toBe(0);
    expect(normalizeConversionTable([100, 300, 200]).nonMonotonicCount).toBe(1);
  });

  it('returns null (never throws) for junk, sparse keys, and empty input', () => {
    expect(normalizeConversionTable(null)).toBeNull();
    expect(normalizeConversionTable(undefined)).toBeNull();
    expect(normalizeConversionTable('nope')).toBeNull();
    expect(normalizeConversionTable([])).toBeNull();
    expect(normalizeConversionTable({})).toBeNull();
    expect(normalizeConversionTable({ notANumber: 1 })).toBeNull();
    // SPARSE: 0,1,5 spans 6 slots but only 3 are present. Filling the gaps would
    // be inventing a mapping, so the whole table is refused.
    expect(normalizeConversionTable({ 0: 100, 1: 150, 5: 400 })).toBeNull();
    expect(normalizeConversionTable([100, 'x', 300])).toBeNull();
  });
});

describe('convertRating — endpoints, midpoint, monotonicity, clamping', () => {
  it('maps the table endpoints', () => {
    expect(convertRating(0, CURVE)).toBe(NEW_MIN);
    expect(convertRating(OLD_MAX, CURVE)).toBe(NEW_MAX);
  });

  it('maps a midpoint to the table entry, not to an interpolation of the ends', () => {
    const mid = OLD_MAX / 2;
    const expected = Math.round(NEW_MIN + (NEW_MAX - NEW_MIN) * Math.pow(0.5, 0.55));
    expect(convertRating(mid, CURVE)).toBe(expected);
    // Concave, so the midpoint sits ABOVE the straight-line average of the ends.
    expect(convertRating(mid, CURVE)).toBeGreaterThan((NEW_MIN + NEW_MAX) / 2);
  });

  it('is non-decreasing across a sampled range (this is what keeps eloRank valid)', () => {
    let previous = -Infinity;
    for (let old = 0; old <= OLD_MAX; old += 37) {
      const value = convertRating(old, CURVE);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('rounds fractional ratings to an integer key', () => {
    expect(convertRating(1000.4, CURVE)).toBe(convertRating(1000, CURVE));
    expect(convertRating(1000.6, CURVE)).toBe(convertRating(1001, CURVE));
  });

  it('clamps below and above the table range to the nearest end', () => {
    expect(convertRating(-5000, CURVE)).toBe(convertRating(0, CURVE));
    expect(convertRating(999999, CURVE)).toBe(convertRating(OLD_MAX, CURVE));

    const offsetTable = normalizeConversionTable({ offset: 1000, table: [300, 310, 320] });
    expect(convertRating(0, offsetTable)).toBe(300);       // below minOld
    expect(convertRating(50000, offsetTable)).toBe(320);   // above maxOld
  });

  it('clamps mapped values into the v2 scale [100, 1600]', () => {
    const outOfScale = normalizeConversionTable([-40, 0, 99, 5000]);
    expect(convertRating(0, outOfScale)).toBe(100);
    expect(convertRating(2, outOfScale)).toBe(100);
    expect(convertRating(3, outOfScale)).toBe(1600);
  });

  it('passes ratings through untouched when the table is missing or empty', () => {
    // A missing map must degrade to TODAY's behaviour, never to a broken endpoint.
    expect(() => convertRating(12345, null)).not.toThrow();
    expect(convertRating(12345, null)).toBe(12345);
    expect(convertRating(12345, undefined)).toBe(12345);
    expect(convertRating(12345, { values: [] })).toBe(12345);
    expect(convertRating(12345, normalizeConversionTable([]))).toBe(12345);
  });
});

describe('convertDelta — THE TRAP: deltas are re-derived, never mapped', () => {
  it('re-derives a delta as f(elo) - f(elo - change), and mapping it directly is wildly wrong', () => {
    const elo = 15000;
    const change = 60;

    const correct = convertDelta(elo, change, CURVE);
    const expected = convertRating(elo, CURVE) - convertRating(elo - change, CURVE);
    expect(correct).toBe(expected);

    // The bug this test exists to prevent: running the DELTA through f().
    const wrong = convertRating(change, CURVE);

    expect(wrong).not.toBe(correct);
    // Not a rounding-level disagreement. f(60) answers "what does a player rated
    // 60 convert to", which is a rating, not a change, and it is ~50x the real
    // step. Rendered in a tooltip it would read as a +160 rating swing on a game
    // that actually moved the player about 3 points.
    expect(Math.abs(wrong)).toBeGreaterThan(Math.abs(correct) * 20);
  });

  it('is nonlinear: the same old-scale step is worth much more at 1,000 than at 15,000', () => {
    const stepHigh = convertDelta(15000, 60, CURVE);
    const stepLow = convertDelta(1000, 60, CURVE);

    expect(stepHigh).toBeGreaterThan(0);
    expect(stepLow).toBeGreaterThan(stepHigh * 2);
    // Which is exactly why one scalar conversion of "+60" cannot exist: the answer
    // depends on WHERE on the ladder the step happened.
  });

  it('keeps the sign of a loss and telescopes across consecutive points', () => {
    expect(convertDelta(12000, -300, CURVE)).toBeLessThan(0);

    // Converted deltas must remain the differences of converted ratings, or the
    // tooltip ("+8") and the curve (a step of 12) tell different stories.
    const series = [900, 980, 1400, 1320, 5000];
    for (let i = 1; i < series.length; i++) {
      const derived = convertDelta(series[i], series[i] - series[i - 1], CURVE);
      expect(derived).toBe(convertRating(series[i], CURVE) - convertRating(series[i - 1], CURVE));
    }
  });

  it('passes deltas through untouched when the table is missing or empty', () => {
    expect(() => convertDelta(15000, 60, null)).not.toThrow();
    expect(convertDelta(15000, 60, null)).toBe(60);
    expect(convertDelta(15000, -60, undefined)).toBe(-60);
    expect(convertDelta(15000, 60, { values: [] })).toBe(60);
  });

  it('never throws on missing/garbage numbers', () => {
    expect(convertDelta(15000, undefined, CURVE)).toBe(0);
    expect(convertDelta(15000, null, CURVE)).toBe(0);
    expect(convertDelta(undefined, 60, CURVE)).toBe(60);
    expect(convertDelta(NaN, NaN, CURVE)).toBe(0);
  });
});

describe('api/userProgression sanitizeProgression — the shipping path', () => {
  // A migration instant, and a history that straddles it exactly like a real
  // account's: several Season 0 games, then the migration, then v2 games.
  const CUTOFF = Date.parse('2026-08-07T00:00:00.000Z');
  const CONVERSION = { table: CURVE, cutoffMs: CUTOFF };

  const day = (n) => new Date(CUTOFF + n * 24 * 60 * 60 * 1000);

  // userStatsService.getUserProgression derives eloChange as a CONSECUTIVE
  // DIFFERENCE, so elo - eloChange is literally the previous row's rating. The
  // last pre-migration rating is 15,000, which the migration converted to
  // f(15000) and wrote as the live rating; the account then won 5 points.
  const migratedLiveRating = convertRating(15000, CURVE);
  const raw = [
    { timestamp: day(-3), elo: 14800, eloChange: 0, eloRank: 40, totalXp: 900000, xpRank: 12, triggerEvent: 'game_completed', userId: 'u1' },
    { timestamp: day(-2), elo: 14940, eloChange: 140, eloRank: 38, totalXp: 900500, xpRank: 12, triggerEvent: 'game_completed', userId: 'u1' },
    { timestamp: day(-1), elo: 15000, eloChange: 60, eloRank: 37, totalXp: 901000, xpRank: 12, triggerEvent: 'game_completed', userId: 'u1' },
    // The first game after the migration. Rating is already the migrated value.
    // The migration itself grants no XP and writes no history row, so totalXp
    // walks on at its normal pace straight across the boundary.
    { timestamp: day(1), elo: migratedLiveRating, eloChange: migratedLiveRating - 15000, eloRank: 37, totalXp: 901400, xpRank: 11, userId: 'u1' },
    { timestamp: day(2), elo: migratedLiveRating + 5, eloChange: 5, eloRank: 36, totalXp: 901900, xpRank: 11, triggerEvent: 'game_completed', userId: 'u1' },
  ];

  it('converts pre-migration ratings and leaves post-migration ones alone', () => {
    const out = sanitizeProgression(raw, true, CONVERSION);

    expect(out.map((p) => p.elo)).toEqual([
      convertRating(14800, CURVE),
      convertRating(14940, CURVE),
      convertRating(15000, CURVE),
      migratedLiveRating,
      migratedLiveRating + 5,
    ]);
  });

  it('closes the seam: the last pre-migration point IS the migrated live rating', () => {
    const out = sanitizeProgression(raw, true, CONVERSION);
    // Same f(), same input, so the step across the migration is +0, not -13,700.
    expect(out[2].elo).toBe(out[3].elo);
    expect(out[3].elo - out[2].elo).toBe(0);
  });

  it('RE-DERIVES pre-migration deltas instead of mapping them', () => {
    const out = sanitizeProgression(raw, true, CONVERSION);

    // Row 3: +60 at 15,000 old-scale.
    expect(out[2].eloChange).toBe(convertRating(15000, CURVE) - convertRating(14940, CURVE));
    // The bug: f(60) instead. Wildly different, and it would be the number the
    // tooltip shows the player.
    expect(out[2].eloChange).not.toBe(convertRating(60, CURVE));
    // Same +60 lower down the ladder is worth MORE — one scalar answer cannot exist.
    expect(convertDelta(1000, 60, CURVE)).toBeGreaterThan(out[2].eloChange);
  });

  it('every converted delta still equals the difference of the converted ratings', () => {
    // If this ever fails, the curve and the tooltips are telling different stories.
    const out = sanitizeProgression(raw, true, CONVERSION);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].eloChange).toBe(out[i].elo - out[i - 1].elo);
    }
    expect(out[0].eloChange).toBe(0);
  });

  it('fixes the boundary step instead of reporting a -13,700 collapse', () => {
    const out = sanitizeProgression(raw, true, CONVERSION);
    // Stored: migratedLiveRating - 15000, a five-figure nonsense delta.
    expect(raw[3].eloChange).toBeLessThan(-13000);
    expect(out[3].eloChange).toBe(0);
    expect(out[4].eloChange).toBe(5);
  });

  it('passes everything through untouched when the map is missing (conversion = null)', () => {
    // The degraded path: identical to the endpoint's behaviour before this change.
    const out = sanitizeProgression(raw, true, null);
    expect(out.map((p) => p.elo)).toEqual(raw.map((r) => r.elo));
    expect(out.map((p) => p.eloChange)).toEqual(raw.map((r) => r.eloChange));
  });

  it('keeps the existing contract: no userId on public requests', () => {
    const publicOut = sanitizeProgression(raw, true, CONVERSION);
    const privateOut = sanitizeProgression(raw, false, CONVERSION);

    expect(publicOut[0].userId).toBeUndefined();
    expect(privateOut[0].userId).toBe('u1');
    // XP is never converted — only ratings changed scale.
    expect(publicOut[3].totalXp).toBe(901400);
    // eloRank is untouched: the map is non-decreasing, so stored ranks stay valid.
    expect(publicOut.map((p) => p.eloRank)).toEqual(raw.map((r) => r.eloRank));
  });

  it('the migration never puts a step in the XP curve', () => {
    // The rating rescale is invisible to XP by construction: the migration
    // writes no history row and grants nothing, so totalXp only ever moves by
    // games played. A jump here means an XP grant has been re-added.
    const out = sanitizeProgression(raw, true, CONVERSION);
    const gains = out.slice(1).map((p, i) => p.totalXp - out[i].totalXp);
    for (const gain of gains) expect(gain).toBeLessThan(10000);
  });

  it('survives rows with missing/garbage ratings without throwing', () => {
    const junk = [
      { timestamp: day(-1), totalXp: 1, xpRank: 1, eloRank: 1 },
      { timestamp: 'not a date', elo: 'abc', eloChange: 'xyz', totalXp: 2, xpRank: 1, eloRank: 1 },
      { timestamp: day(2), elo: 1000, eloChange: 4, totalXp: 3, xpRank: 1, eloRank: 1 },
    ];
    expect(() => sanitizeProgression(junk, true, CONVERSION)).not.toThrow();
  });
});

describe('continuity across the migration instant', () => {
  it('the last pre-migration point lands exactly on the migrated live rating', () => {
    // The migration wrote elo = f(elo_s0). The read path converts the last
    // pre-migration UserStats point with the SAME f(). Same function, same input,
    // so the seam is closed by construction rather than by tuning.
    for (const eloS0 of [0, 137, 1000, 4321, 12000, 15000, 19999, 20000]) {
      const migratedLiveRating = convertRating(eloS0, CURVE);
      const lastHistoryPoint = convertRating(eloS0, CURVE);
      expect(lastHistoryPoint).toBe(migratedLiveRating);
      expect(migratedLiveRating).toBeGreaterThanOrEqual(100);
      expect(migratedLiveRating).toBeLessThanOrEqual(1600);
    }
  });

  it('the boundary step (old-scale previous point, v2 current point) stays sane', () => {
    // The first game after migration stores a v2 elo, while the point before it is
    // old-scale, so the stored delta is nonsense (1305 - 12000 = -10695). The
    // endpoint maps each END on its own scale before subtracting.
    const previousOldScale = 12000;
    const currentV2 = convertRating(previousOldScale, CURVE) + 5; // won 5 points
    const storedChange = currentV2 - previousOldScale;            // the nonsense delta

    const boundaryChange = currentV2 - convertRating(currentV2 - storedChange, CURVE);
    expect(storedChange).toBeLessThan(-10000);
    expect(boundaryChange).toBe(5);
  });
});
