#!/usr/bin/env node
/**
 * ONE-TIME repair for accounts created AFTER the rating-v2 migration that were
 * stamped with the old 1000 starting rating instead of ENTRY_RATING (500).
 *
 * DRY RUN BY DEFAULT. Nothing is written without --apply.
 *
 * THE BUG THIS CLEANS UP
 * ----------------------
 *   models/User.js defaulted `elo` to a hardcoded 1000. That was correct on the
 *   Season 0 scale and wrong on v2, where 1000 sits inside VOYAGER (945-1269) —
 *   above the median of 800 and above roughly 85% of the ladder. Every account
 *   created after the migration therefore opened as a gold-badge Voyager.
 *
 *   Worse, it made the placement match a punishment. placementSeed() returns
 *   500..800, ALWAYS below 1000, so a new player's first ranked game — which the
 *   throwing placement bot guarantees they win — rendered as a rating DROP and a
 *   demotion. The design is the opposite: open at 500, and every point of the
 *   jump to the seed is earned by your own round scores.
 *
 * WHO IS IN SCOPE, AND WHY THE FILTER IS THIS TIGHT
 * ------------------------------------------------
 *   All four conditions must hold. Each one independently makes it impossible
 *   to touch an account that earned its rating:
 *
 *     created_at   >= MIGRATION_AT   post-migration signup. A pre-migration
 *                                    account's 1000 could be a real Season 0
 *                                    rating mapped by the migration.
 *     elo          == 1000           exactly the bad default, untouched.
 *     ratedGames   == 0              never played a rated game. The migration
 *                                    backfilled every veteran to >= 1, so this
 *                                    alone excludes the entire legacy population.
 *     lastRankedAt == null           never completed a placement either. A
 *                                    seeded account has this stamped, and its
 *                                    rating is earned.
 *
 *   An account matching all four has, by construction, never played a rated
 *   game and never been seeded, so its rating is the untouched default and there
 *   is nothing to lose by correcting it.
 *
 * IDEMPOTENT: the filter requires elo == 1000, so a second run matches nothing.
 *
 * Usage (from project root):
 *   node scripts/fixNewAccountEntryRating.js            (dry run)
 *   node scripts/fixNewAccountEntryRating.js --apply
 *   node scripts/fixNewAccountEntryRating.js --apply --verbose
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { pathToFileURL } from 'url';
import User from '../models/User.js';
import { MIGRATION_AT, STARTING_ELO } from '../components/utils/ratingFlags.js';

// The value that was wrongly used as a starting rating. Hardcoded on purpose:
// this script repairs one specific historical mistake, so it must keep matching
// that exact number even if a constant elsewhere moves again later.
const BAD_STARTING_ELO = 1000;

export function scopeFilter(migrationAt = MIGRATION_AT) {
  return {
    created_at: { $gte: migrationAt },
    elo: BAD_STARTING_ELO,
    ratedGames: 0,
    lastRankedAt: null,
  };
}

export async function run({ apply = false, verbose = false } = {}) {
  if (STARTING_ELO === BAD_STARTING_ELO) {
    throw new Error(
      `STARTING_ELO is still ${BAD_STARTING_ELO}. This script would rewrite 1000 to 1000, ` +
      'which means the underlying default was never fixed. Fix components/utils/ratingFlags.js first.'
    );
  }

  const filter = scopeFilter();
  console.log(`[fixEntryRating] migration instant : ${MIGRATION_AT.toISOString()}`);
  console.log(`[fixEntryRating] correcting        : ${BAD_STARTING_ELO} -> ${STARTING_ELO}`);
  console.log('[fixEntryRating] scope             : created post-migration, elo exactly 1000,');
  console.log('                                     ratedGames 0, lastRankedAt null\n');

  const total = await User.countDocuments({});
  const matched = await User.countDocuments(filter);
  console.log(`[fixEntryRating] ${matched} of ${total} accounts match\n`);

  if (verbose && matched > 0) {
    const sample = await User.find(filter)
      .select('_id username created_at elo')
      .sort({ created_at: 1 })
      .limit(25)
      .lean();
    console.log('Sample (up to 25, oldest first):');
    for (const u of sample) {
      console.log(`  ${(u.username || '(unnamed)').padEnd(20)} ${u._id}  created ${new Date(u.created_at).toISOString()}`);
    }
    console.log('');
  }

  // SAFETY GATE. If this ever matches, the filter is not doing what its comment
  // says and the run must not proceed: correcting a rating that was actually
  // played for is the one outcome this script exists to make impossible.
  const unsafe = await User.countDocuments({
    ...filter,
    $or: [
      { ratedGames: { $gt: 0 } },
      { lastRankedAt: { $ne: null } },
      { elo_s0: { $ne: null } },
    ],
  });
  if (unsafe > 0) {
    throw new Error(
      `${unsafe} in-scope accounts have ranked history or a Season 0 snapshot. ` +
      'The scope filter is wrong. Refusing to write.'
    );
  }

  if (!apply) {
    console.log(`DRY RUN — nothing written. ${matched} account(s) would be set to ${STARTING_ELO}.`);
    console.log('Re-run with --apply to correct them.');
    return { matched, modified: 0, apply: false };
  }

  const res = await User.updateMany(filter, { $set: { elo: STARTING_ELO } });
  const modified = res.modifiedCount || 0;
  console.log(`[fixEntryRating] set elo = ${STARTING_ELO} on ${modified} account(s)`);

  const remaining = await User.countDocuments(filter);
  if (remaining !== 0) {
    console.log(`[fixEntryRating] WARNING: ${remaining} still match after the write — re-run.`);
  } else {
    console.log('[fixEntryRating] done, zero remaining in scope.');
  }
  return { matched, modified, apply: true };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const verbose = process.argv.includes('--verbose');

  if (!process.env.MONGODB) {
    console.error('MONGODB env variable not set');
    process.exit(1);
  }

  console.log(`Connecting to MongoDB...${apply ? ' (APPLY MODE — THIS WRITES)' : ' (dry run)'}`);
  await mongoose.connect(process.env.MONGODB);
  console.log('Connected!\n');
  try {
    await run({ apply, verbose });
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('\nABORTED\n');
    console.error(err.message || err);
    process.exit(1);
  });
}
