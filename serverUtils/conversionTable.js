import fs from 'fs';
import path from 'path';
import { normalizeConversionTable } from '../components/utils/ratingConversion.js';

/**
 * The frozen Season 0 -> Season 1 conversion table, loaded once per process.
 *
 * WHY THIS IS SHARED AND NOT PER-CALLER
 * -------------------------------------
 * Two independent paths must convert old-scale numbers, and they MUST use the
 * byte-identical table or they disagree about what a rating means:
 *
 *   api/userProgression.js   converts stored UserStats points for the graph.
 *   serverUtils/eloRefunds.js converts a stored eloChange before crediting it.
 *
 * The migration (scripts/migrateRatingV2.js) applied this same file to write the
 * live ratings, so "read-time f() == migration-time f()" only holds while every
 * caller reads this one file through normalizeConversionTable().
 *
 * NEVER THROWS. A missing or unusable map returns null, and every caller must
 * treat null as "no conversion available" and degrade rather than 500. For the
 * refund path specifically, null means "skip the refund" — see the call site.
 */
const CONVERSION_MAP_PATH = path.join(process.cwd(), 'data', 'elo-conversion-map.json');

// undefined = never attempted, null = absent/unusable. Parsed ONCE per process.
let cache;
let loggedMissing = false;

export function getConversionTable() {
  if (cache !== undefined) return cache;

  // Set first so a throw below can never cause a re-read (and re-log) per call.
  cache = null;

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(CONVERSION_MAP_PATH, 'utf8'));
  } catch (error) {
    if (!loggedMissing) {
      loggedMissing = true;
      console.warn(
        `[conversionTable] could not read ${CONVERSION_MAP_PATH}: ${error?.message || error}. ` +
        'Old-scale values will NOT be converted.'
      );
    }
    return cache;
  }

  const table = normalizeConversionTable(raw);
  if (!table) {
    console.warn('[conversionTable] elo-conversion-map.json parsed but is not a usable table.');
    return cache;
  }
  if (table.nonMonotonicCount > 0) {
    console.warn(`[conversionTable] table has ${table.nonMonotonicCount} non-monotonic steps — order may not be preserved.`);
  }

  cache = table;
  return cache;
}

/** Tests only. */
export function _resetConversionTableCache() {
  cache = undefined;
  loggedMissing = false;
}
