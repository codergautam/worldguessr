// Read-time Season 0 -> Season 1 rating conversion.
//
// WHY THIS EXISTS
// ---------------
// Every rating point in UserStats written before the v2 migration is on the old
// 0..20,000 scale. Every point written after it is on the 100..1600 scale. Drawn
// raw, one graph carries both and every veteran sees a cliff from 12,000 to
// 1,300 that reads as "my account was robbed".
//
// The fix is a READ-TIME conversion, not a backfill: api/userProgression.js runs
// pre-migration points through the SAME frozen table the migration itself used
// (scripts/migrateRatingV2.js loadConversionMap). Continuity is then true by
// construction, not by luck: the last pre-migration point maps through f() to
// exactly the number the migration wrote as the live rating. ~6.3M UserStats
// docs stay untouched, old mobile builds inherit the fix for free (it is
// server-side), and the whole thing reverses by deleting one call.
//
// PURITY IS THE POINT
// -------------------
// No imports, no fs, no process, no clock. Same rule as
// components/utils/eloSystem.js: purity is the only reason this arithmetic can
// be unit tested at all (test/ratingConversion.test.js), and the delta rule
// below is the kind of thing that MUST be pinned by a test. The caller loads
// data/elo-conversion-map.json and hands the parsed JSON to
// normalizeConversionTable() ONCE.
//
// THE DELTA TRAP
// --------------
// A stored eloChange must be RE-DERIVED, never mapped:
//
//     newChange = f(elo) - f(elo - oldChange)        <-- correct
//     newChange = f(oldChange)                       <-- garbage
//
// f is nonlinear. +60 near 15,000 is worth about +8 on the new scale; +60 near
// 1,000 is worth about +25. Mapping the delta itself feeds a delta into a
// function whose domain is ABSOLUTE ratings, so it returns "the new rating of a
// player rated 60", which is not a change in anything. Same rule for any refund
// amount that ever gets surfaced.

// Bounds of the v2 scale. These MIRROR eloSystem.js RATING_FLOOR and
// migrateRatingV2.js RATING_CEIL and are duplicated here on purpose: importing
// them would break the no-imports rule above, and the identity this module sells
// ("read-time f() == migration-time f()") requires the clamp to be byte-identical
// to the migration's. If either constant ever moves, all three move together.
const RATING_FLOOR = 100;
const RATING_CEIL = 1600;

/**
 * Turn the parsed contents of data/elo-conversion-map.json into a dense O(1)
 * lookup. Accepts EXACTLY the shapes scripts/migrateRatingV2.js accepts, so
 * there is one on-disk format and no chance of the migration and the read path
 * disagreeing about what the file means:
 *
 *   [n0, n1, n2, ...]                        index = old elo, starting at 0
 *   { "offset": 0, "table": [n0, n1, ...] }  index = old elo - offset
 *   { "0": 100, "1": 100, ... }              dense numeric-keyed object
 *   { "map": { "0": 100, ... } }             same, nested
 *
 * Where the migration THROWS (missing file, sparse keys, non-numeric entries)
 * this returns null instead. The migration is a one-shot operator-supervised
 * write and must fail loudly; this runs on a profile page for 2M+ users and
 * must degrade to "serve the data unconverted", never to a 500.
 *
 * @param {*} raw Parsed JSON, any of the shapes above.
 * @returns {{offset:number, values:number[], minOld:number, maxOld:number, size:number, nonMonotonicCount:number}|null}
 */
export function normalizeConversionTable(raw) {
  if (raw === null || raw === undefined) return null;

  let values = null;
  let offset = 0;

  if (Array.isArray(raw)) {
    values = raw;
  } else if (typeof raw === 'object' && Array.isArray(raw.table)) {
    values = raw.table;
    offset = Number(raw.offset ?? raw.minElo ?? 0) || 0;
  } else if (typeof raw === 'object') {
    const src = raw.map && typeof raw.map === 'object' ? raw.map : raw;
    const keys = Object.keys(src).filter((k) => /^-?\d+$/.test(k)).map(Number);
    if (keys.length === 0) return null;

    let min = Infinity;
    let max = -Infinity;
    for (const k of keys) {
      if (k < min) min = k;
      if (k > max) max = k;
    }
    const span = max - min + 1;
    // SPARSE. Filling the gaps here would be inventing a rating mapping, which
    // is the one thing neither this file nor the migration is allowed to do.
    if (keys.length !== span) return null;

    offset = min;
    values = new Array(span);
    for (const k of keys) values[k - min] = Number(src[String(k)]);
  } else {
    return null;
  }

  if (!Array.isArray(values) || values.length === 0) return null;

  const dense = new Array(values.length);
  let nonMonotonicCount = 0;
  for (let i = 0; i < values.length; i++) {
    const v = Number(values[i]);
    if (!Number.isFinite(v)) return null;
    dense[i] = v;
    if (i > 0 && v < dense[i - 1]) nonMonotonicCount++;
  }

  return {
    offset,
    values: dense,
    minOld: offset,
    maxOld: offset + dense.length - 1,
    size: dense.length,
    // A non-decreasing table is what keeps stored eloRank values consistent with
    // the converted ratings (order in == order out), so a violation is worth
    // shouting about at load time even though we still serve the map.
    nonMonotonicCount,
  };
}

/**
 * f(oldElo): old-scale rating -> v2-scale rating.
 *
 * O(1): one integer index into a dense array plus a clamp. No search, no
 * interpolation, nothing that scales with table size — this runs once per
 * progression point on a hot profile endpoint.
 *
 * Out-of-range inputs clamp to the nearest table END (identical to the
 * migration's --allow-out-of-range behaviour) rather than throwing, because a
 * graph that renders is worth more than a graph that 500s over one stray point.
 *
 * A missing/empty table is a PASS-THROUGH: the caller gets today's behaviour.
 *
 * @param {number} oldElo Absolute rating on the Season 0 scale.
 * @param {object|null} table Result of normalizeConversionTable(), or null.
 * @returns {number} Converted rating, clamped to [100, 1600].
 */
export function convertRating(oldElo, table) {
  const value = Number(oldElo);
  if (!Number.isFinite(value)) return oldElo;
  if (!table || !table.values || table.values.length === 0) return value;

  const values = table.values;
  let idx = Math.round(value) - table.offset;
  if (idx < 0) idx = 0;
  else if (idx >= values.length) idx = values.length - 1;

  const mapped = Math.round(values[idx]);
  if (mapped < RATING_FLOOR) return RATING_FLOOR;
  if (mapped > RATING_CEIL) return RATING_CEIL;
  return mapped;
}

/**
 * Convert a rating CHANGE by re-deriving it from the two absolute ratings it
 * sits between:
 *
 *     f(elo) - f(elo - oldChange)
 *
 * NEVER f(oldChange). See "THE DELTA TRAP" at the top of this file; the
 * difference is pinned by an explicit assertion in test/ratingConversion.test.js.
 *
 * With no table this returns oldChange exactly, because the pass-through branch
 * of convertRating makes the expression collapse to elo - (elo - oldChange).
 *
 * @param {number} oldElo Absolute OLD-scale rating AFTER the change.
 * @param {number} oldChange The stored old-scale delta (elo - previousElo).
 * @param {object|null} table Result of normalizeConversionTable(), or null.
 * @returns {number} The same step expressed on the v2 scale.
 */
export function convertDelta(oldElo, oldChange, table) {
  const elo = Number(oldElo);
  const change = Number(oldChange);
  if (!Number.isFinite(change)) return 0;
  if (!Number.isFinite(elo)) return change;
  if (!table || !table.values || table.values.length === 0) return change;

  return convertRating(elo, table) - convertRating(elo - change, table);
}
