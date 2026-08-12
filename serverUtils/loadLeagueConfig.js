import RatingConfig from '../models/RatingConfig.js';
import { setLeagueConfig } from '../components/utils/leagues.js';

/**
 * Load the seasonal league tier table from Mongo and install it.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `models/RatingConfig.js` and `setLeagueConfig()` were both written, both
 * documented, and both unit tested — and `setLeagueConfig` had ZERO callers
 * outside its own test. Nothing on any process ever read the config doc, so
 * `configuredLeagues` was permanently null and every lookup fell through to the
 * hardcoded table.
 *
 * That was invisible while the hardcoded numbers were right. It stops being
 * invisible now that the strict-matchmaking floor and the hard-map gate resolve
 * through `getActiveLeagues()`: re-cutting tiers next season would move the
 * badges and leave those two gates behind, and it would need a web deploy AND a
 * store release to do even that.
 *
 * ONE LOAD, EVERY PROCESS THAT RESOLVES A TIER. ws (matchmaking + the strict
 * floor), server (API responses), authServer (auth payload leagues). A process
 * that skips it silently disagrees with the others about who is a Voyager.
 *
 * NEVER THROWS, NEVER BLOCKS BOOT. Every failure path keeps whatever table is
 * already active, which is the hardcoded one. A config collection may not be
 * able to take down the matchmaker — that rule is written on the model itself
 * and this is where it is honoured.
 *
 * @returns {Promise<boolean>} true only if a table was actually installed.
 */
export async function loadLeagueConfig(label = 'leagues') {
  try {
    const doc = await RatingConfig.findOne({ key: 'leagues' }).lean();
    if (!doc) return false;                      // no doc yet: hardcoded table stands
    if (!Array.isArray(doc.tiers) || doc.tiers.length === 0) {
      console.warn(`[${label}] RatingConfig 'leagues' has no tiers, keeping the built-in table`);
      return false;
    }

    // setLeagueConfig validates (ordering, overlap, numeric bounds) and returns
    // false WITHOUT installing anything on a malformed doc, keeping the previous
    // table. It logs its own reason, so this only reports the outcome.
    const installed = setLeagueConfig(doc.tiers);
    if (installed) {
      console.log(`[${label}] league table installed from RatingConfig:`,
        doc.tiers.map((t) => `${t.name} ${t.min}-${t.max}`).join(', '));
    }
    return installed;
  } catch (e) {
    console.error(`[${label}] league config load failed, keeping the built-in table:`, e?.message || e);
    return false;
  }
}

/**
 * Load now, then re-check periodically so a mid-season re-anchor propagates
 * without a restart.
 *
 * Deliberately a poll and not a change stream: this doc changes roughly once per
 * SEASON, the read is a single indexed findOne, and a change stream needs a
 * replica set that nothing else in this codebase assumes.
 *
 * @returns {Promise<void>} resolves after the FIRST load, so a caller can await
 *          it before opening a port and never serve a request on a stale table.
 */
export async function startLeagueConfigRefresh(safeInterval, { label = 'leagues', intervalMs = 10 * 60 * 1000 } = {}) {
  await loadLeagueConfig(label);
  // safeInterval is injected rather than imported so this module stays free of
  // ws/ internals and remains importable from any process.
  if (typeof safeInterval === 'function') {
    safeInterval(`${label}Config`, intervalMs, () => loadLeagueConfig(label));
  }
}
