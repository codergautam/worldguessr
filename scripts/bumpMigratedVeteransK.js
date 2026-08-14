#!/usr/bin/env node
/**
 * ONE-TIME pass: every migrated veteran starts the v2 ladder at K_MID (20),
 * not K_NEW (40).
 *
 * DRY RUN BY DEFAULT. Nothing is written without --apply.
 *
 * WHY
 * ---
 *   The Aug 12 migration backfilled every pre-existing account's `ratedGames`
 *   to min(career duels, 15) — deliberately inside the K_NEW tier, so the
 *   re-sorted ladder would converge fast (~15 games at K=40, see the cap
 *   rationale in components/utils/placementGates.js). User ruling Aug 13
 *   superseded that: the settling window is too hot for accounts that already
 *   have a ladder position. ALL migrated veterans start at K_MID instead.
 *
 *   kFactor keys on ratedGames (K_MID from K_NEW_UNTIL up), so the fix is one
 *   $set: lift every pre-migration account still inside the K_NEW tier to
 *   exactly K_NEW_UNTIL. They then walk the normal schedule to K_VET at 100,
 *   and the rating-based taper (K_MID cap from 900, K_VET cap from Voyager)
 *   still applies on top.
 *
 * WHO IS IN SCOPE
 * ---------------
 *     created_at < MIGRATION_AT     pre-migration account (missing created_at
 *     (or missing)                  counts as pre-migration, matching
 *                                   placementGates.js, where no created_at
 *                                   means "not placement eligible").
 *     ratedGames in [1, K_NEW_UNTIL)  currently in the K_NEW tier. >= 1 keeps
 *                                   zero-duel accounts untouched: ratedGames 0
 *                                   is load-bearing (placement trigger), and
 *                                   an account that never dueled is not a
 *                                   veteran — when it starts playing, fast
 *                                   convergence at K_NEW is correct for it.
 *
 *   Post-migration accounts NEVER match (created_at >= MIGRATION_AT): a real
 *   new player mid-schedule at ratedGames 12 keeps their K_NEW convergence.
 *
 * IDEMPOTENT: after a run, everyone in scope sits at K_NEW_UNTIL, which the
 * ratedGames range excludes. ONE-TIME on purpose: a pre-migration account
 * with zero career duels that starts ranked play AFTER this run will pass
 * through 1..29 at K_NEW — that account's migrated rating carried no ladder
 * information, so the fast schedule is right for it, and this script must
 * not be re-run later to "catch" it.
 *
 * Live ws sessions read ratedGames off in-memory Player objects, refreshed at
 * connect/verify — run this during a ws deploy restart (or accept that
 * players already in a session keep the old K until their next connect).
 *
 * Usage (from project root):
 *   node scripts/bumpMigratedVeteransK.js            (dry run)
 *   node scripts/bumpMigratedVeteransK.js --apply
 *   node scripts/bumpMigratedVeteransK.js --apply --verbose
 *   node scripts/bumpMigratedVeteransK.js --inspect  (dump whatever tripped
 *                                                     the elo_s0 gate; never
 *                                                     writes, ignores --apply)
 *   node scripts/bumpMigratedVeteransK.js --apply --skip-unmigrated
 *                                                    (bump everyone with an
 *                                                     elo_s0, leave the rest
 *                                                     at K_NEW, log their ids)
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { pathToFileURL } from 'url';
import User from '../models/User.js';
import { MIGRATION_AT } from '../components/utils/ratingFlags.js';
import { K_NEW_UNTIL, K_MID_UNTIL } from '../components/utils/eloSystem.js';

export function scopeFilter(migrationAt = MIGRATION_AT) {
  return {
    // `created_at: null` matches both explicit null and a missing field.
    $or: [{ created_at: { $lt: migrationAt } }, { created_at: null }],
    ratedGames: { $gte: 1, $lt: K_NEW_UNTIL },
  };
}

/**
 * Read-only dump of whatever tripped the elo_s0 safety gate. The gate can only
 * ever report a count, and the decision it blocks ("is this account's rating
 * provenance real?") needs the document. Writes nothing, ever.
 *
 * created_at defaults to Date.now in the schema, so an in-scope account is
 * NOT explainable as a normal new signup. The shapes worth telling apart:
 *   - created_at missing entirely -> legacy doc predating the field. Rating is
 *     real; it is the migration's own filter that skipped it.
 *   - created_at present and < MIGRATION_AT, elo_s0 null -> the account
 *     existed and the migration missed it. Ask why before reshaping its K.
 *   - scheduledDeletionAt / deletionRequestedAt set -> it was mid-deletion
 *     during the migration window, which is a benign reason to have been
 *     skipped, and a reason to leave it alone now too.
 */
export async function inspect() {
  const filter = { ...scopeFilter(), elo_s0: null };
  const docs = await User.find(filter).limit(50).lean();
  console.log(`[bumpVetK] ${docs.length} in-scope account(s) with no elo_s0 snapshot\n`);
  for (const u of docs) {
    const hasCreated = Object.prototype.hasOwnProperty.call(u, 'created_at') && u.created_at != null;
    console.log(`_id                 ${u._id}`);
    console.log(`username            ${u.username ?? '(none)'}`);
    console.log(`created_at          ${hasCreated ? new Date(u.created_at).toISOString() : '*** MISSING / NULL ***'}`);
    console.log(`ratedGames          ${u.ratedGames}`);
    console.log(`elo                 ${u.elo}`);
    console.log(`elo_s0              ${u.elo_s0 ?? 'null'}`);
    console.log(`seasonPeakElo       ${u.seasonPeakElo ?? 'null'}`);
    console.log(`lastRankedAt        ${u.lastRankedAt ? new Date(u.lastRankedAt).toISOString() : 'null'}`);
    console.log(`lastLogin           ${u.lastLogin ? new Date(u.lastLogin).toISOString() : 'null'}`);
    console.log(`duels W/L/T         ${u.duels_wins ?? 0}/${u.duels_losses ?? 0}/${u.duels_tied ?? 0}`);
    console.log(`totalGamesPlayed    ${u.totalGamesPlayed ?? 0}`);
    console.log(`banned              ${u.banned ?? false}${u.banType ? ` (${u.banType})` : ''}`);
    console.log(`deletionRequestedAt ${u.deletionRequestedAt ? new Date(u.deletionRequestedAt).toISOString() : 'null'}`);
    console.log(`scheduledDeletionAt ${u.scheduledDeletionAt ? new Date(u.scheduledDeletionAt).toISOString() : 'null'}`);
    console.log(`fields present      ${Object.keys(u).sort().join(' ')}`);
    console.log('');
  }
  if (docs.length === 0) console.log('Nothing to inspect — the gate would pass.');
  return docs;
}

export async function run({ apply = false, verbose = false, skipUnmigrated = false } = {}) {
  // K_NEW_UNTIL must still land in the K_MID tier of the schedule. If the
  // schedule constants ever move so that K_NEW_UNTIL >= K_MID_UNTIL, this
  // script would overshoot straight into K_VET — refuse instead.
  if (K_NEW_UNTIL >= K_MID_UNTIL) {
    throw new Error(
      `K_NEW_UNTIL (${K_NEW_UNTIL}) >= K_MID_UNTIL (${K_MID_UNTIL}): setting ` +
      'ratedGames to K_NEW_UNTIL would skip K_MID entirely. Re-check the schedule.'
    );
  }

  const filter = scopeFilter();
  console.log(`[bumpVetK] migration instant : ${MIGRATION_AT.toISOString()}`);
  console.log(`[bumpVetK] setting           : ratedGames -> ${K_NEW_UNTIL} (first K_MID game count)`);
  console.log(`[bumpVetK] scope             : pre-migration accounts with ratedGames 1..${K_NEW_UNTIL - 1}\n`);

  const total = await User.countDocuments({});
  let matched = await User.countDocuments(filter);
  // Informational: the population deliberately left alone.
  const newAccountsInTier = await User.countDocuments({
    created_at: { $gte: MIGRATION_AT },
    ratedGames: { $gte: 1, $lt: K_NEW_UNTIL },
  });
  const zeroDuelVets = await User.countDocuments({
    $or: [{ created_at: { $lt: MIGRATION_AT } }, { created_at: null }],
    ratedGames: 0,
  });
  console.log(`[bumpVetK] ${matched} of ${total} accounts match`);
  console.log(`[bumpVetK] untouched by design: ${newAccountsInTier} post-migration accounts mid-schedule, ${zeroDuelVets} zero-duel pre-migration accounts\n`);

  if (verbose && matched > 0) {
    const sample = await User.find(filter)
      .select('_id username created_at ratedGames elo')
      .sort({ ratedGames: -1 })
      .limit(25)
      .lean();
    console.log('Sample (up to 25, highest ratedGames first):');
    for (const u of sample) {
      console.log(`  ${(u.username || '(unnamed)').padEnd(20)} ratedGames=${String(u.ratedGames).padStart(2)}  elo=${String(u.elo).padStart(4)}  created ${u.created_at ? new Date(u.created_at).toISOString() : '(missing)'}`);
    }
    console.log('');
  }

  // SAFETY GATE. Post-migration accounts and zero-duel accounts are excluded
  // by the filter itself (created_at bound, ratedGames >= 1) — re-querying
  // those would be a tautology, not a check. The one anomaly the filter
  // CANNOT see: an in-scope account with no Season 0 snapshot. Every account
  // that existed at migration time has elo_s0 (pass 1 verified zero nulls),
  // so "created pre-migration, has rated games, but never migrated" means
  // either created_at lies or the account skipped the migration — unknown
  // rating provenance either way. Refuse rather than reshape its K schedule.
  const unsafe = await User.countDocuments({ ...filter, elo_s0: null });
  if (unsafe > 0 && !skipUnmigrated) {
    throw new Error(
      `${unsafe} in-scope account(s) have no elo_s0 snapshot — pre-migration by ` +
      'created_at but never migrated. Investigate before writing:\n' +
      '  node scripts/bumpMigratedVeteransK.js --inspect\n' +
      'Then re-run with --skip-unmigrated to bump everyone else and leave them at K_NEW.'
    );
  }

  // The override. Excluding these is not merely the safe choice, it is the
  // correct one: this whole script exists to spare accounts whose MIGRATED
  // rating already encodes a ladder position. An account with no elo_s0 has no
  // migrated rating, so its `elo` carries no ladder information, and K_NEW's
  // fast convergence is the right schedule for it — the same reasoning that
  // leaves zero-duel veterans alone.
  if (unsafe > 0 && skipUnmigrated) {
    filter.elo_s0 = { $ne: null };
    const skipped = await User.find({ ...scopeFilter(), elo_s0: null })
      .select('_id username created_at ratedGames elo').limit(50).lean();
    console.log(`[bumpVetK] --skip-unmigrated: leaving ${unsafe} account(s) at K_NEW:`);
    for (const u of skipped) {
      console.log(`  ${u._id}  ${(u.username || '(unnamed)').padEnd(20)} ratedGames=${u.ratedGames} elo=${u.elo} created ${u.created_at ? new Date(u.created_at).toISOString() : '(missing)'}`);
    }
    matched = await User.countDocuments(filter);
    console.log(`[bumpVetK] ${matched} account(s) remain in scope after the exclusion\n`);
  }

  if (!apply) {
    console.log(`DRY RUN — nothing written. ${matched} account(s) would be set to ratedGames = ${K_NEW_UNTIL}.`);
    console.log('Re-run with --apply to bump them.');
    return { matched, modified: 0, apply: false };
  }

  const res = await User.updateMany(filter, { $set: { ratedGames: K_NEW_UNTIL } });
  const modified = res.modifiedCount || 0;
  console.log(`[bumpVetK] set ratedGames = ${K_NEW_UNTIL} on ${modified} account(s)`);

  const remaining = await User.countDocuments(filter);
  if (remaining !== 0) {
    console.log(`[bumpVetK] WARNING: ${remaining} still match after the write — re-run.`);
  } else {
    console.log('[bumpVetK] done, zero remaining in scope.');
  }
  return { matched, modified, apply: true };
}

async function main() {
  const inspectOnly = process.argv.includes('--inspect');
  const apply = !inspectOnly && process.argv.includes('--apply');
  const verbose = process.argv.includes('--verbose');
  const skipUnmigrated = process.argv.includes('--skip-unmigrated');

  if (!process.env.MONGODB) {
    console.error('MONGODB env variable not set');
    process.exit(1);
  }

  console.log(`Connecting to MongoDB...${inspectOnly ? ' (inspect — read only)' : apply ? ' (APPLY MODE — THIS WRITES)' : ' (dry run)'}`);
  await mongoose.connect(process.env.MONGODB);
  console.log('Connected!\n');
  try {
    if (inspectOnly) await inspect();
    else await run({ apply, verbose, skipUnmigrated });
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
