#!/usr/bin/env node
/**
 * Repair historical weekly_update UserStats rows whose ranks used ORDINAL
 * ranking instead of COMPETITION ranking.
 *
 * DRY RUN BY DEFAULT. Nothing is written without --apply.
 *
 * THE BUG (fixed in cron.js, this cleans up what it already wrote)
 * ----------------------------------------------------------------
 * The weekly snapshot sorted all users by elo (and totalXp) and stamped
 * rank = array index + 1. Ties were therefore broken arbitrarily by sort
 * order. The per-game path (userStatsService.calculateELORank) computes
 * count(score > yours) + 1, where every tied user shares one rank.
 *
 * ~3.7M accounts sit at exactly elo 670 (the migrated old-default mass; the
 * same mass sat at 1000 on the Season 0 scale), so a player at that value got
 * ~474k from every game snapshot and anywhere up to ~4.2M from the weekly
 * snapshot. On the profile rank graph that is a one-point cliff of millions
 * that "recovers" at the next game and stretches the y-axis. Same story for
 * xpRank with the mass at 0 XP.
 *
 * WHY THIS REPAIR IS EXACT, NOT A GUESS
 * -------------------------------------
 * Each weekly snapshot covered every unbanned user, so within one snapshot
 * cohort the correct competition rank of value X is derivable from the
 * cohort's own rows: 1 + (number of rows in the cohort with a higher value).
 * No point-in-time history is needed. The repair recomputes exactly the
 * number the fixed cron would have written that night.
 *
 * COHORTS
 * -------
 * Snapshot timestamps spread over the minutes/hours a run took, so cohorts are
 * detected as clusters of weekly_update timestamps separated by > --gap hours
 * (default 6). Verify the printed cohort list looks like one row per weekly run
 * before applying.
 *
 * COST — READ BEFORE APPLYING
 * ---------------------------
 * This rewrites, in place, nearly every row that sits inside a tie block:
 * on the order of 100M row updates across all 47 cohorts. That is hours of
 * sustained write load and oplog churn on the production DB. Run it off-peak,
 * one cohort at a time (--cohort), and expect the nightly backup after a full
 * run to be slower. The write is idempotent and crash-safe: each update's
 * filter requires the wrong value, so re-running a cohort only touches rows
 * not yet fixed, and a kill mid-cohort loses nothing.
 *
 * NO AUDIT FILE, BY DESIGN: the prior values are the bug (reconstructible any
 * time as ordinal ranks), and auditing 100M rows is its own storage problem.
 * The dry run prints exactly what each cohort will change; there is no undo.
 *
 * Usage (from project root):
 *   node scripts/repairWeeklyRankTies.js                     list cohorts + size ALL (dry)
 *   node scripts/repairWeeklyRankTies.js --cohort latest     size just the newest cohort (dry)
 *   node scripts/repairWeeklyRankTies.js --cohort latest --apply
 *   node scripts/repairWeeklyRankTies.js --cohort 2026-08-10 --apply
 *   node scripts/repairWeeklyRankTies.js --apply             repair everything (hours)
 *
 * Flags:
 *   --apply          Write. Without it: report only.
 *   --cohort <sel>   'latest', or a YYYY-MM-DD prefix matching the cohort start.
 *   --gap N          Hours of silence separating two cohorts. Default 6.
 *   --field <f>      'elo', 'xp' or 'both' (default both).
 *
 * Requires: MONGODB env var (dotenv/.env is loaded).
 */

import 'dotenv/config';
import mongoose from 'mongoose';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const str = (f, d) => {
  const i = argv.indexOf(f);
  return i === -1 ? d : argv[i + 1];
};
const APPLY = has('--apply');
const GAP_MS = Number(str('--gap', 6)) * 3600 * 1000;
const COHORT_SEL = str('--cohort', null);
const FIELD = str('--field', 'both');

const FIELDS = [];
if (FIELD === 'both' || FIELD === 'elo') FIELDS.push({ value: 'elo', rank: 'eloRank' });
if (FIELD === 'both' || FIELD === 'xp') FIELDS.push({ value: 'totalXp', rank: 'xpRank' });
if (FIELDS.length === 0) throw new Error(`--field must be elo, xp or both; got ${FIELD}`);

async function main() {
  const uri = process.env.MONGODB;
  if (!uri) throw new Error('MONGODB env var is not set');
  await mongoose.connect(uri);
  const S = mongoose.connection.db.collection('userstats');

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
  console.log(`detected ${cohorts.length} weekly snapshot cohorts:`);
  for (const c of cohorts) {
    console.log(`  ${c.start.toISOString().slice(0, 13)} -> ${c.end.toISOString().slice(0, 13)}  rows ${c.n}`);
  }

  let selected = cohorts;
  if (COHORT_SEL === 'latest') selected = [cohorts[cohorts.length - 1]];
  else if (COHORT_SEL) {
    selected = cohorts.filter((c) => c.start.toISOString().startsWith(COHORT_SEL));
    if (selected.length === 0) throw new Error(`no cohort starts with ${COHORT_SEL}`);
  }
  console.log(`\nprocessing ${selected.length} cohort(s), fields: ${FIELDS.map((f) => f.rank).join(', ')}`);
  console.log(`mode: ${APPLY ? 'APPLY (writes)' : 'DRY RUN (no writes)'}\n`);

  let grandRows = 0;
  for (const c of selected) {
    const range = { $gte: c.start, $lt: c.end };
    console.log(`=== cohort ${c.start.toISOString().slice(0, 13)} (${c.n} rows) ===`);

    for (const f of FIELDS) {
      // Value histogram for this cohort. Distinct values are few (thousands),
      // so ranks compute in memory from a single indexed aggregation.
      const hist = await S.aggregate([
        { $match: { triggerEvent: 'weekly_update', timestamp: range } },
        { $group: { _id: `$${f.value}`, n: { $sum: 1 } } },
        { $sort: { _id: -1 } },
      ], { allowDiskUse: true }).toArray();

      // Competition rank of value X = 1 + rows with a higher value.
      let above = 0;
      const plan = [];
      for (const h of hist) {
        const rank = above + 1;
        // Only tie blocks can be wrong, and in a block of n the ordinal ranks
        // were rank..rank+n-1, so at most n-1 rows need the fix.
        if (h.n > 1) plan.push({ value: h._id, rank, n: h.n });
        above += h.n;
      }
      const worst = plan.reduce((a, p) => Math.max(a, p.n), 0);
      const bound = plan.reduce((a, p) => a + p.n - 1, 0);
      console.log(`  ${f.rank}: ${hist.length} distinct values, ${plan.length} tie blocks, ` +
        `largest block ${worst}, rows to correct <= ${bound}`);

      if (!APPLY) continue;

      let fixed = 0;
      for (const p of plan) {
        // Filter requires the wrong value -> idempotent, crash-safe, and a
        // concurrent read can never see a half-applied row (single-field $set).
        const res = await S.updateMany(
          { triggerEvent: 'weekly_update', timestamp: range, [f.value]: p.value, [f.rank]: { $ne: p.rank } },
          { $set: { [f.rank]: p.rank } }
        );
        fixed += res.modifiedCount;
      }
      grandRows += fixed;
      console.log(`  ${f.rank}: corrected ${fixed} rows`);
    }
  }
  if (APPLY) console.log(`\nTOTAL rows corrected: ${grandRows}`);
  else console.log('\nDRY RUN COMPLETE. No documents were modified.');
}

main()
  .catch((e) => {
    console.error('\nFAILED:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
