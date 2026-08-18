#!/usr/bin/env node
/**
 * Repair historical UserStats rows whose `eloRank` was computed WITHOUT the
 * 670 baseline floor, so a sub-baseline rating ranked below the ~3.7M
 * never-played accounts sitting at exactly 670.
 *
 * DRY RUN BY DEFAULT. Nothing is written without --apply.
 *
 * THE BUG (fixed in code; this cleans up what was already written)
 * ---------------------------------------------------------------
 * Every rank site computed count(elo > yours) + 1 against the raw rating.
 * The migration left ~3.7M accounts at EXACTLY 670 (Season 0's default of
 * 1000, converted). A player at 670 therefore ranked ~474k, and ONE lost
 * game taking them to 669 dropped them past the entire ghost mass to ~4.2M.
 * On the profile rank graph that is a vertical cliff of millions that makes
 * every real rank movement invisible under the y-axis stretch.
 *
 * `components/utils/eloSystem.js` now exports rankQueryRating(), which floors
 * the COMPARED rating (never the stored rating) at RANK_BASELINE_RATING, and
 * every rank site routes through it. This script rewrites the rows written
 * before that landed.
 *
 * WHY THE REPAIR IS EXACT, NOT A GUESS
 * ------------------------------------
 * The corrected rank of ANY row with elo <= 670 is the rank of the 670 tie
 * block at that moment: 1 + (accounts strictly above 670). Rows above 670 are
 * unaffected by the floor and are never touched.
 *
 * That baseline count is itself historical — the population above 670 grows
 * over time — so the script derives it PER COHORT from the rows themselves
 * rather than from today's User collection:
 *
 *   baselineRank(cohort) = 1 + count(rows in cohort with elo > 670)
 *
 * For weekly_update cohorts that is exact: each weekly snapshot covers every
 * unbanned user, so the cohort IS the population. For per-game rows (which
 * are sparse and cover only players who played) the same derivation would be
 * meaningless, so those rows instead borrow the baseline of the NEAREST
 * weekly cohort in time — the best point-in-time estimate available, and far
 * closer to the truth than the millions-off value they hold now.
 *
 * Use --strategy to control this:
 *   nearest-weekly  (default) per-game rows use the nearest weekly cohort
 *   live            per-game rows use TODAY's live count above 670 (fast,
 *                   but wrong for old rows if the population moved a lot)
 *   weekly-only     do not touch per-game rows at all
 *
 * SCOPE
 * -----
 * Only rows with elo <= RANK_BASELINE_RATING and an eloRank ABOVE the correct
 * baseline rank are rewritten. Rows already correct are skipped by the update
 * filter, so the script is idempotent and crash-safe: re-running finishes the
 * job rather than redoing it. xpRank is NEVER touched (different mass, and XP
 * is a lifetime accumulation, not a contested position).
 *
 * Usage (from project root):
 *   node scripts/repairSubBaselineRanks.js                    report only
 *   node scripts/repairSubBaselineRanks.js --apply            repair everything
 *   node scripts/repairSubBaselineRanks.js --cohort latest --apply
 *   node scripts/repairSubBaselineRanks.js --strategy weekly-only --apply
 *
 * Flags:
 *   --apply            Write. Without it: report only.
 *   --cohort <sel>     'latest', or a YYYY-MM-DD prefix matching a cohort start.
 *   --gap N            Hours of silence separating two weekly cohorts. Default 6.
 *   --strategy <s>     nearest-weekly (default) | live | weekly-only
 *   --batch N          Rows per bulk update for the per-game pass. Default 50000.
 *
 * Requires: MONGODB env var (dotenv/.env is loaded).
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { RANK_BASELINE_RATING } from '../components/utils/eloSystem.js';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const str = (f, d) => {
  const i = argv.indexOf(f);
  return i === -1 ? d : argv[i + 1];
};
const APPLY = has('--apply');
const GAP_MS = Number(str('--gap', 6)) * 3600 * 1000;
const COHORT_SEL = str('--cohort', null);
const STRATEGY = str('--strategy', 'nearest-weekly');
const BATCH = Number(str('--batch', 50000));

if (!['nearest-weekly', 'live', 'weekly-only'].includes(STRATEGY)) {
  throw new Error(`--strategy must be nearest-weekly, live or weekly-only; got ${STRATEGY}`);
}

const BASE = RANK_BASELINE_RATING;

async function main() {
  const uri = process.env.MONGODB;
  if (!uri) throw new Error('MONGODB env var is not set');
  await mongoose.connect(uri);
  const S = mongoose.connection.db.collection('userstats');
  const U = mongoose.connection.db.collection('users');

  console.log(`baseline rating: ${BASE}`);
  console.log(`mode: ${APPLY ? 'APPLY (writes)' : 'DRY RUN (no writes)'}`);
  console.log(`strategy for per-game rows: ${STRATEGY}\n`);

  // ---- cohort detection: cluster weekly_update hours separated by > GAP ----
  const hours = await S.aggregate([
    { $match: { triggerEvent: 'weekly_update' } },
    { $group: { _id: { $dateTrunc: { date: '$timestamp', unit: 'hour' } }, n: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ], { allowDiskUse: true }).toArray();

  const cohorts = [];
  for (const h of hours) {
    const last = cohorts[cohorts.length - 1];
    if (last && h._id - last.end <= GAP_MS) {
      last.end = new Date(+h._id + 3600 * 1000);
      last.n += h.n;
    } else {
      cohorts.push({ start: h._id, end: new Date(+h._id + 3600 * 1000), n: h.n });
    }
  }
  console.log(`detected ${cohorts.length} weekly snapshot cohorts`);

  // ---- pass 1: weekly cohorts (exact baseline, derived per cohort) ----
  let selected = cohorts;
  if (COHORT_SEL === 'latest') selected = cohorts.slice(-1);
  else if (COHORT_SEL) {
    selected = cohorts.filter((c) => c.start.toISOString().startsWith(COHORT_SEL));
    if (selected.length === 0) throw new Error(`no cohort starts with ${COHORT_SEL}`);
  }

  let weeklyFixed = 0;
  for (const c of selected) {
    const range = { $gte: c.start, $lt: c.end };
    // Exact: this snapshot covered everyone, so the cohort is the population.
    const above = await S.countDocuments({
      triggerEvent: 'weekly_update', timestamp: range, elo: { $gt: BASE },
    });
    c.baselineRank = above + 1;

    const wrong = await S.countDocuments({
      triggerEvent: 'weekly_update', timestamp: range,
      elo: { $lte: BASE }, eloRank: { $gt: c.baselineRank },
    });
    console.log(`  ${c.start.toISOString().slice(0, 13)}  rows ${c.n}  ` +
      `baselineRank ${c.baselineRank}  to correct ${wrong}`);

    if (!APPLY || wrong === 0) continue;
    const res = await S.updateMany(
      {
        triggerEvent: 'weekly_update', timestamp: range,
        elo: { $lte: BASE }, eloRank: { $gt: c.baselineRank },
      },
      { $set: { eloRank: c.baselineRank } },
    );
    weeklyFixed += res.modifiedCount;
    console.log(`    corrected ${res.modifiedCount}`);
  }

  // ---- pass 2: per-game / refund rows ----
  let gameFixed = 0;
  if (STRATEGY !== 'weekly-only' && !COHORT_SEL) {
    const dated = cohorts.filter((c) => c.baselineRank != null);

    let liveBaseline = null;
    if (STRATEGY === 'live' || dated.length === 0) {
      liveBaseline = (await U.countDocuments({ elo: { $gt: BASE }, banned: false })) + 1;
      console.log(`\nlive baselineRank (users above ${BASE}): ${liveBaseline}`);
      if (dated.length === 0) {
        console.log('no weekly cohorts carry a baseline; falling back to live for all rows');
      }
    }

    // Nearest-weekly needs per-row timestamps, so walk the wrong rows in
    // batches. The filter is the same "row is wrong" predicate used above,
    // just without a fixed target rank (that is chosen per row).
    const q = { triggerEvent: { $ne: 'weekly_update' }, elo: { $lte: BASE } };
    const total = await S.countDocuments(q);
    console.log(`\nper-game/refund rows at or below baseline: ${total}`);

    if (STRATEGY === 'live' || dated.length === 0) {
      const wrong = await S.countDocuments({ ...q, eloRank: { $gt: liveBaseline } });
      console.log(`  to correct (live baseline ${liveBaseline}): ${wrong}`);
      if (APPLY && wrong > 0) {
        const res = await S.updateMany(
          { ...q, eloRank: { $gt: liveBaseline } },
          { $set: { eloRank: liveBaseline } },
        );
        gameFixed += res.modifiedCount;
        console.log(`  corrected ${res.modifiedCount}`);
      }
    } else {
      // Bucket rows by nearest weekly cohort, then one updateMany per bucket
      // bounded by the midpoints between neighbouring cohorts.
      const bounds = [];
      for (let i = 0; i < dated.length; i++) {
        const prev = dated[i - 1], next = dated[i + 1], cur = dated[i];
        const lo = prev ? new Date((+prev.start + +cur.start) / 2) : new Date(0);
        const hi = next ? new Date((+cur.start + +next.start) / 2) : new Date(8640000000000000);
        bounds.push({ lo, hi, rank: cur.baselineRank, label: cur.start.toISOString().slice(0, 10) });
      }

      for (const b of bounds) {
        const f = { ...q, timestamp: { $gte: b.lo, $lt: b.hi }, eloRank: { $gt: b.rank } };
        const wrong = await S.countDocuments(f);
        if (wrong === 0) continue;
        console.log(`  window ~${b.label}: baselineRank ${b.rank}, to correct ${wrong}`);
        if (!APPLY) continue;
        const res = await S.updateMany(f, { $set: { eloRank: b.rank } });
        gameFixed += res.modifiedCount;
        console.log(`    corrected ${res.modifiedCount}`);
      }
    }
  } else if (COHORT_SEL) {
    console.log('\n--cohort given: per-game rows skipped (they are not part of a cohort)');
  }

  if (APPLY) {
    console.log(`\nTOTAL corrected: ${weeklyFixed} weekly + ${gameFixed} per-game = ${weeklyFixed + gameFixed}`);
  } else {
    console.log('\nDRY RUN COMPLETE. No documents were modified.');
  }
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
