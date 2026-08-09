#!/usr/bin/env node
/**
 * ONE-TIME Season 1 compensation grants: the Stamps and the OG badge promised by
 * the Season 1 first-login modal.
 *
 * DRY RUN BY DEFAULT. Nothing is written without --apply.
 *
 * RUN AFTER scripts/migrateRatingV2.js. That script converts ratings and stamps
 * the Season 0 peak; it applies NO compensation on purpose (a rating conversion
 * that also moves currency is a rating conversion nobody can roll back). This is
 * the second half, and it REFUSES to start until the first half has finished.
 *
 * THERE IS NO XP GRANT. There used to be: up to 2,350,000 XP per account from a
 * veteran/peak/tenure curve. It was cut before it ever ran in production, for
 * two reasons that are worth keeping written down so nobody re-adds it:
 *
 *   1. It redefined XP. XP is a lifetime activity counter. An exponential
 *      rating-to-XP conversion is a different unit wearing the same name, and
 *      once mixed in, no XP number means what it used to.
 *   2. It destroyed the XP graph. The grant landed as ONE UserStats row, so
 *      every veteran got a single vertical cliff through a chart they had spent
 *      years building. The graph grew a dashed-gold-line plugin whose entire job
 *      was to apologise for that cliff. Both are gone now.
 *
 * Ratings needed no compensation of their own: api/userProgression.js converts
 * pre-migration rating points onto the v2 scale at READ time, so the rating
 * curve has no seam to explain.
 *
 * WHAT EACH ACCOUNT GETS
 * ----------------------
 *   careerRankedGames = duels_wins + duels_losses + duels_tied
 *
 *   OG badge           created_at before 2025-08-01 -> ogAccount: true
 *
 *   Stamps (through the ledger, never a raw $inc)
 *     grinderStamps    min(1000, round(careerRankedGames / 5))
 *     leagueStarter    by seasonPeakLeague: Trekker 100 / Explorer 150 /
 *                      Voyager 250 / Nomad 500, plus 300 for the top 100 by elo_s0
 *     milestoneStamps  cumulative at 100/500/1000/5000 career games -> 20/60/120/400
 *                      (a 5,000-game player receives all four: 600)
 *
 * Every number above is a pure function of PRE-migration fields (the duel
 * counters, seasonPeakLeague, elo_s0, created_at). None of them reads a field
 * this script writes. That is what makes the dry run an exact rehearsal of the
 * apply run, and it is also what lets the login modal display the same numbers.
 *
 * EVERY WRITE IS IDEMPOTENT, SO THIS SCRIPT IS SAFE TO RE-RUN
 * -----------------------------------------------------------
 *   ogAccount is a $set recomputed from created_at, and Stamps go through
 *   grantStamps() under stable per-account per-type keys:
 *     a:season1:<userId>:grinder
 *     a:season1:<userId>:league
 *     a:season1:<userId>:milestone:<tier>      (tier = 100 | 500 | 1000 | 5000)
 *   The ledger's unique index makes each of those independently idempotent. An
 *   interrupted run re-grants nothing and under-pays nothing: just run it again.
 *
 *   This is only true because the XP $inc is gone. An $inc is the one write here
 *   that could not be recomputed or repeated, and guarding it is why this script
 *   used to write a `season1_grant` UserStats marker, keep two in-memory rank
 *   indexes to populate that marker's xpRank/eloRank, order its writes
 *   STAMPS -> MARKER -> XP, and refuse to pay any account MongoDB did not report
 *   as newly upserted. All of that machinery guarded exactly one $inc. With the
 *   $inc gone it guarded nothing, so it is gone too, along with the spurious
 *   history point the marker put in everyone's progression graph.
 *
 * A LEDGER KEY IS BURNED AT ITS FIRST NON-ZERO AMOUNT
 * ---------------------------------------------------
 *   Re-runnable does NOT mean self-correcting. If a run pays `a:season1:X:league`
 *   100 stamps and a later run computes 250, the key already exists, the write is
 *   reported as a duplicate, and the 150 difference is never paid. So the inputs
 *   have to be right the FIRST time, which is what the pre-flight gates below are
 *   for. A key that computes to 0 is never written at all, so that case stays
 *   recoverable.
 *
 *   grantStamps SHORT-CIRCUITS when the stamps kill switch is off and returns
 *   { disabled: true } WITHOUT touching the database — no row, no key burned. So
 *   a run with the kill switch off pays badges only and can be repeated in full
 *   once it is on. It still aborts by default, because that is near-certainly an
 *   operator mistake rather than an intent; --allow-stamps-disabled is the
 *   escape hatch for a badge-only pass.
 *
 *   The switch DEFAULTS ON (serverUtils/stamps/config.js) — an absent
 *   STAMPS_ENABLED is fine and is what production runs. The only way to trip
 *   this abort is an explicit STAMPS_ENABLED=false in the environment.
 *
 * THE ogAccount FIELD MUST EXIST IN models/User.js FIRST
 * -----------------------------------------------------
 *   Mongoose casts bulkWrite updates in strict mode, which SILENTLY DELETES paths
 *   the schema does not declare (mongoose/lib/helpers/model/castBulkWrite.js:
 *   `strict = options.strict ?? model.schema.options.strict`). If ogAccount is not
 *   on the User schema, `$set: { ogAccount: true }` is dropped on the floor and
 *   the run reports success while badging nobody. This script checks the schema
 *   up front and refuses rather than discovering that from a support ticket.
 *
 * SCOPE
 * -----
 *   Every user document, banned accounts included (a ban is reversible; skipping
 *   them here would silently unpay an unban).
 *
 * REQUIRES
 * --------
 *   MONGODB env var (dotenv/.env is loaded). That is the ONLY variable this
 *     script needs — the stamps switch and the rating flags all have correct
 *     defaults, so a bare production environment runs this correctly.
 *   scripts/migrateRatingV2.js already applied (elo_s0 and seasonPeakElo set on
 *   every in-scope account).
 *   ogAccount declared on the User schema.
 *
 * Usage (from project root):
 *   node scripts/grantSeason1Compensation.js                  (dry run — full simulation, no writes)
 *   node scripts/grantSeason1Compensation.js --limit 1000     (dry run over the first 1000 users)
 *   node scripts/grantSeason1Compensation.js --apply          (THE GRANTS)
 *
 * Flags:
 *   --apply                   Required to write. Default is a dry run.
 *   --limit N                 Only the first N users by _id ascending. Testing.
 *                             Scopes identically to migrateRatingV2.js --limit N.
 *   --batch N                 Users fetched per batch. Default 5000.
 *   --pause-ms N              Pause between batches. Default 100.
 *   --concurrency N           Parallel ledger grants. Default 20.
 *   --skip-og-badge           Proceed without the ogAccount badge (the field is
 *                             not on the User schema yet). Stamps still pay.
 *   --allow-stamps-disabled   Proceed with STAMPS_ENABLED off. Badges only.
 *   --allow-unknown-league    Proceed when seasonPeakLeague holds a name the
 *                             starter table does not budget (those accounts get
 *                             0 league Stamps, which stays repayable later).
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { pathToFileURL } from 'url';
import User from '../models/User.js';
import { grantStamps } from '../serverUtils/stamps/grantStamps.js';
import { STAMPS_ENABLED } from '../serverUtils/stamps/config.js';

/* ------------------------------------------------------------------ *
 * Constants — the product decisions. Change nothing here casually: the
 * first-login modal quotes these numbers back to the player.
 * ------------------------------------------------------------------ */

/** OG badge cutoff. Accounts created strictly before this were here first. */
export const OG_BADGE_CUTOFF = Date.UTC(2025, 7, 1); // 2025-08-01T00:00:00.000Z

export const GRINDER_GAMES_PER_STAMP = 5;
export const GRINDER_STAMPS_CAP = 1000;

/** Keyed on seasonPeakLeague, which migrateRatingV2.js stamps from the PEAK. */
export const LEAGUE_STARTER_STAMPS = {
  Trekker: 100,
  Explorer: 150,
  Voyager: 250,
  Nomad: 500,
};
export const TOP100_BONUS_STAMPS = 300;
export const TOP_N_BY_ELO_S0 = 100;

/** Cumulative: a 5,000-game player clears all four and receives 600. */
export const MILESTONE_TIERS = [
  { games: 100, stamps: 20 },
  { games: 500, stamps: 60 },
  { games: 1000, stamps: 120 },
  { games: 5000, stamps: 400 },
];

/** Counter sanity clamp. Keeps a corrupt counter from producing Infinity. */
const MAX_SANE_GAMES = 1e9;

const DEFAULT_BATCH = 5000;
const DEFAULT_PAUSE_MS = 100;
const DEFAULT_CONCURRENCY = 20;
/** bulkWrite / $in payload chunk. Batches are thousands of docs. */
const WRITE_CHUNK = 1000;

function flagValue(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) return fallback;
  return v;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ *
 * Pure calculators
 *
 * Every one of these returns a FINITE NON-NEGATIVE INTEGER for any input,
 * including undefined, null, NaN, negatives, Infinity and absurd numbers.
 * They run against 2M documents written across eight years of schema
 * changes; a NaN reaching the ledger throws in assertReason mid-batch.
 * ------------------------------------------------------------------ */

/** Number, or null for anything that is not a usable finite number. */
function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** A game counter: whole, >= 0, and clamped away from absurd values. */
function safeCount(v) {
  const n = numOrNull(v);
  if (n === null || n <= 0) return 0;
  return Math.min(Math.floor(n), MAX_SANE_GAMES);
}

/** Epoch ms, or null. Accepts Date, ISO string and epoch millis. */
function timeOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const t = v instanceof Date ? v.getTime() : new Date(typeof v === 'number' ? v : String(v)).getTime();
  return Number.isFinite(t) ? t : null;
}

/** duels_wins + duels_losses + duels_tied. The one games number everything keys on. */
export function careerRankedGames(user) {
  if (!user || typeof user !== 'object') return 0;
  return safeCount(user.duels_wins) + safeCount(user.duels_losses) + safeCount(user.duels_tied);
}

/** The OG badge predicate. FAILS CLOSED on a missing or unparseable created_at. */
export function isOgAccount(createdAt, cutoff = OG_BADGE_CUTOFF) {
  const created = timeOrNull(createdAt);
  const limit = timeOrNull(cutoff);
  if (created === null || limit === null) return false;
  return created < limit;
}

/** One stamp per 5 career ranked games, capped at 1,000 (reached at 5,000 games). */
export function grinderStamps(games) {
  return Math.min(GRINDER_STAMPS_CAP, Math.round(safeCount(games) / GRINDER_GAMES_PER_STAMP));
}

/**
 * Season 1 starting balance, by Season 0 peak league, plus the top-100 bonus.
 * An unbudgeted league name pays 0 rather than guessing — run() refuses to apply
 * while any in-scope account has one, so this can never silently underpay a real
 * player.
 */
export function leagueStarterStamps(seasonPeakLeague, isTop100 = false) {
  const base = typeof seasonPeakLeague === 'string'
    ? (LEAGUE_STARTER_STAMPS[seasonPeakLeague] ?? 0)
    : 0;
  return base + (isTop100 === true ? TOP100_BONUS_STAMPS : 0);
}

/** The milestone tiers an account has cleared, for per-tier ledger keys. */
export function milestoneBreakdown(games) {
  const g = safeCount(games);
  return MILESTONE_TIERS.filter((t) => g >= t.games);
}

/** Cumulative milestone stamps: every tier cleared pays, not just the highest. */
export function milestoneStamps(games) {
  return milestoneBreakdown(games).reduce((sum, t) => sum + t.stamps, 0);
}

/**
 * The account's Season 0 rating: seasonPeakElo, falling back to the closing
 * rating snapshot. null means neither exists.
 *
 * Nothing is keyed on the VALUE any more (the XP curve that used it is gone).
 * It survives as the "did this account exist on the Season 0 ladder at all"
 * gate in planGrants, and as a display number in the dry-run summary.
 */
export function resolvePeakElo(user) {
  if (!user || typeof user !== 'object') return null;
  const peak = numOrNull(user.seasonPeakElo);
  if (peak !== null) return peak;
  return numOrNull(user.elo_s0);
}

/**
 * The whole grant for one account, from PRE-migration fields only. Returns null
 * when the account has no usable rating. Called once per account in the plan
 * pass and again in the apply pass; being pure is what makes those two agree.
 */
export function planGrants(user, { isTop100 = false } = {}) {
  const peak = resolvePeakElo(user);
  if (peak === null) return null;

  const games = careerRankedGames(user);
  const createdAt = user?.created_at;

  const milestones = milestoneBreakdown(games);
  const milestoneTotal = milestones.reduce((sum, t) => sum + t.stamps, 0);
  const grinder = grinderStamps(games);
  const league = leagueStarterStamps(user?.seasonPeakLeague, isTop100);

  return {
    games,
    peak,
    ogAccount: isOgAccount(createdAt),
    grinderStamps: grinder,
    leagueStarterStamps: league,
    leagueName: typeof user?.seasonPeakLeague === 'string' ? user.seasonPeakLeague : null,
    isTop100,
    milestones,
    milestoneStamps: milestoneTotal,
    stampsTotal: grinder + league + milestoneTotal,
  };
}

/* ------------------------------------------------------------------ *
 * Batching
 * ------------------------------------------------------------------ */

/**
 * Yield { first, last, count } _id ranges, ascending — the same shape and the
 * same --limit meaning as migrateRatingV2.js, so a rehearsal at --limit N covers
 * the identical N accounts in both scripts.
 */
async function* idBatches({ batchSize, limit }) {
  let lastId = null;
  let seen = 0;
  for (;;) {
    const take = limit ? Math.min(batchSize, limit - seen) : batchSize;
    if (take <= 0) return;
    const query = lastId ? { _id: { $gt: lastId } } : {};
    const docs = await User.find(query).select('_id').sort({ _id: 1 }).limit(take).lean();
    if (docs.length === 0) return;
    const first = docs[0]._id;
    const last = docs[docs.length - 1]._id;
    yield { first, last, count: docs.length };
    lastId = last;
    seen += docs.length;
  }
}

const SCAN_PROJECTION = '_id username elo_s0 seasonPeakElo seasonPeakLeague ' +
  'duels_wins duels_losses duels_tied created_at';

/**
 * Bounded-parallelism map that STOPS THE OTHER WORKERS on the first error and
 * rethrows exactly one. Letting the siblings run on would keep moving currency
 * after the run has already decided to abort, and their own rejections would
 * arrive unhandled and bury the error that actually mattered.
 */
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  let failure = null;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      if (failure) return;
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        if (!failure) failure = err;
        return;
      }
    }
  });
  await Promise.all(workers);
  if (failure) throw failure;
  return results;
}

/* ------------------------------------------------------------------ *
 * Scope / pre-flight
 * ------------------------------------------------------------------ */

/** The _id ceiling that makes a --limit run's COUNT queries agree with its scan. */
async function resolveScope(limit) {
  if (!limit) return { filter: {}, lastId: null };
  const docs = await User.find({}).select('_id').sort({ _id: 1 }).skip(limit - 1).limit(1).lean();
  if (docs.length === 0) return { filter: {}, lastId: null };
  return { filter: { _id: { $lte: docs[0]._id } }, lastId: docs[0]._id };
}

/**
 * The top TOP_N_BY_ELO_S0 accounts by Season 0 closing rating. Computed ONCE:
 * it is a global ranking, so asking it per account would be 2M sorts of 2M
 * documents. Ties break on _id ascending so the set is deterministic and a
 * re-run bonuses the same accounts.
 *
 * Deliberately NOT scoped by --limit: the top 100 of a 1,000-account rehearsal
 * would be a different, meaningless set.
 */
async function loadTopHundred() {
  const rows = await User.aggregate([
    { $match: { elo_s0: { $ne: null } } },
    { $sort: { elo_s0: -1, _id: 1 } },
    { $limit: TOP_N_BY_ELO_S0 },
    { $project: { _id: 1, elo_s0: 1 } },
  ], { allowDiskUse: true });

  const ids = new Set(rows.map((r) => String(r._id)));
  return {
    ids,
    count: rows.length,
    cutoff: rows.length ? rows[rows.length - 1].elo_s0 : null,
    top: rows.length ? rows[0].elo_s0 : null,
  };
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

export async function run({
  apply = false,
  limit = null,
  batchSize = DEFAULT_BATCH,
  pauseMs = DEFAULT_PAUSE_MS,
  concurrency = DEFAULT_CONCURRENCY,
  skipOgBadge = false,
  allowStampsDisabled = false,
  allowUnknownLeague = false,
} = {}) {
  const started = Date.now();

  /* ---- PRE-FLIGHT: every refusal happens before the first write -------- */

  // 1. The Stamps kill switch. Off means grantStamps() is a no-op that never
  //    touches the database. Nothing is lost permanently (no row means no
  //    idempotency key burned, so a later run pays in full), but a run that
  //    silently grants badges and nothing else is almost never what was meant.
  const stampsEnabled = STAMPS_ENABLED;
  if (!stampsEnabled) {
    if (apply && !allowStampsDisabled) {
      throw new Error(
        'The stamps kill switch is OFF, so grantStamps() would short-circuit and pay NO stamps.\n' +
        '\n' +
        'That switch defaults ON, so something in this environment set STAMPS_ENABLED=false\n' +
        'explicitly — check .env and the shell before assuming it is a config gap.\n' +
        '\n' +
        'This run would write OG badges and nothing else. No ledger rows means no idempotency\n' +
        'keys are burned, so re-running with the switch on afterwards would still pay everyone\n' +
        'in full — but silently grant-less runs are almost always a mistake.\n' +
        'Remove the STAMPS_ENABLED=false and re-run, or pass --allow-stamps-disabled for a\n' +
        'badge-only pass.'
      );
    }
    console.log('[season1] WARNING: STAMPS_ENABLED is off. grantStamps() short-circuits:');
    console.log('[season1]          NO ledger rows, NO balances moved. OG badges only.');
  }

  // 2. The ogAccount field. Mongoose strict mode drops unknown paths from a
  //    bulkWrite update WITHOUT ERRORING, so an undeclared field means a run
  //    that reports thousands of badges and writes none.
  const hasOgField = Boolean(User.schema.path('ogAccount'));
  const writeOgBadge = hasOgField && !skipOgBadge;
  if (!hasOgField && !skipOgBadge) {
    throw new Error(
      'models/User.js does not declare `ogAccount`.\n' +
      '\n' +
      'Mongoose casts bulkWrite updates in strict mode, which silently DELETES paths the\n' +
      'schema does not know about. `$set: { ogAccount: true }` would be dropped and this\n' +
      'script would report a badge count it never wrote.\n' +
      'Add to the User schema:  ogAccount: { type: Boolean, default: false },\n' +
      'or pass --skip-og-badge to grant the Stamps without the badge.'
    );
  }
  if (hasOgField && skipOgBadge) {
    console.log('[season1] --skip-og-badge given: ogAccount exists on the schema but will NOT be written.');
  }
  if (!hasOgField && skipOgBadge) {
    console.log('[season1] WARNING: ogAccount is not on the User schema. No badge will be written.');
  }

  // 3. Scope, and the rating migration gate.
  const scope = await resolveScope(limit);
  const totalUsers = await User.countDocuments({});
  const scopeNote = limit ? `first ${limit} of ${totalUsers} users` : `all ${totalUsers} users`;
  console.log(`[season1] scope: ${scopeNote}`);

  const missingS0 = await User.countDocuments({ ...scope.filter, elo_s0: null });
  const missingPeak = await User.countDocuments({ ...scope.filter, seasonPeakElo: null });
  if (missingS0 > 0 || missingPeak > 0) {
    throw new Error(
      `The rating migration has NOT finished in this scope: ${missingS0} accounts have a null ` +
      `elo_s0 and ${missingPeak} have no seasonPeakElo.\n` +
      '\n' +
      'Those accounts have no seasonPeakLeague to key the league starter stamps on, so they\n' +
      'would be paid 0 for it — and a ledger key is burned at its first NON-ZERO amount, so\n' +
      'the grinder and milestone rows written alongside it would lock in against counters\n' +
      'the migration has not settled yet.\n' +
      'Run scripts/migrateRatingV2.js --apply (then scripts/verifyMigration.js) first.'
    );
  }
  console.log('[season1] rating migration gate: PASSED (every in-scope account has elo_s0 + seasonPeakElo)');

  // 4. The top 100 by elo_s0 — one global sort, up front, never per account.
  const topHundred = await loadTopHundred();
  console.log(`[season1] top ${TOP_N_BY_ELO_S0} by elo_s0: ${topHundred.count} accounts, ` +
    `elo_s0 ${topHundred.cutoff ?? 'n/a'} .. ${topHundred.top ?? 'n/a'} ` +
    `(+${TOP100_BONUS_STAMPS} stamps each)`);
  console.log(`[season1] batch size ${batchSize}, pause ${pauseMs}ms, ledger concurrency ${concurrency}\n`);

  /* ---- PASS 1: PLAN (no writes, ever) ---------------------------------- */
  console.log('=== PASS 1: PLAN (no writes) ===');

  const stats = {
    scanned: 0,
    eligible: 0,
    skippedNoRating: 0,
    stampsTotal: 0,
    grinderStampsTotal: 0,
    leagueStampsTotal: 0,
    milestoneStampsTotal: 0,
    ogBadges: 0,
    top100Hits: 0,
    grinderAtCap: 0,
    ledgerRows: 0,
  };
  const leagueHist = Object.create(null);
  const milestoneHist = Object.create(null);
  const unknownLeagues = Object.create(null);
  let largest = null;
  const samples = [];

  let planBatches = 0;

  for await (const b of idBatches({ batchSize, limit })) {
    planBatches++;
    const docs = await User.find({ _id: { $gte: b.first, $lte: b.last } })
      .select(SCAN_PROJECTION)
      .lean();

    for (const u of docs) {
      stats.scanned++;
      const id = String(u._id);

      const plan = planGrants(u, { isTop100: topHundred.ids.has(id) });
      if (!plan) {
        stats.skippedNoRating++;
        continue;
      }

      stats.eligible++;
      stats.stampsTotal += plan.stampsTotal;
      stats.grinderStampsTotal += plan.grinderStamps;
      stats.leagueStampsTotal += plan.leagueStarterStamps;
      stats.milestoneStampsTotal += plan.milestoneStamps;
      if (plan.ogAccount) stats.ogBadges++;
      if (plan.isTop100) stats.top100Hits++;
      if (plan.grinderStamps === GRINDER_STAMPS_CAP) stats.grinderAtCap++;

      const leagueKey = plan.leagueName ?? '(none)';
      leagueHist[leagueKey] = (leagueHist[leagueKey] || 0) + 1;
      if (plan.leagueName === null || !(plan.leagueName in LEAGUE_STARTER_STAMPS)) {
        unknownLeagues[leagueKey] = (unknownLeagues[leagueKey] || 0) + 1;
      }
      const mKey = plan.milestones.length ? `${plan.milestones.length} tier(s)` : 'none';
      milestoneHist[mKey] = (milestoneHist[mKey] || 0) + 1;

      stats.ledgerRows += (plan.grinderStamps > 0 ? 1 : 0)
        + (plan.leagueStarterStamps > 0 ? 1 : 0)
        + plan.milestones.length;

      if (!largest || plan.stampsTotal > largest.plan.stampsTotal) {
        largest = { id, username: u.username || '(unnamed)', plan };
      }
      if (samples.length < 8) {
        samples.push(`  ${(u.username || '(unnamed)').padEnd(18)} peak=${String(Math.round(plan.peak)).padStart(6)} ` +
          `games=${String(plan.games).padStart(5)}  stamps +${String(plan.stampsTotal).padStart(5)}  ` +
          `${plan.ogAccount ? 'OG' : '  '}  ${plan.leagueName ?? '(no league)'}`);
      }
    }

    if (planBatches % 20 === 0 || docs.length < batchSize) {
      console.log(`[season1] plan batch ${planBatches}: ${stats.scanned} scanned, ${stats.eligible} eligible, ` +
        `${stats.skippedNoRating} without a rating`);
    }
    if (pauseMs) await sleep(pauseMs);
  }

  const unknownLeagueNames = Object.keys(unknownLeagues);
  const unknownLeagueAccounts = unknownLeagueNames.reduce((s, k) => s + unknownLeagues[k], 0);

  printSummary({
    apply, scopeNote, stats, leagueHist, milestoneHist,
    unknownLeagues, largest, samples, topHundred, stampsEnabled, writeOgBadge,
  });

  if (unknownLeagueAccounts > 0 && !allowUnknownLeague) {
    throw new Error(
      `${unknownLeagueAccounts} in-scope accounts carry a seasonPeakLeague the starter table does ` +
      `not budget: ${unknownLeagueNames.join(', ')}.\n` +
      '\n' +
      'Those accounts would receive 0 league stamps. A 0 writes no ledger row, so it stays\n' +
      'repayable by a later corrected run — but the grinder and milestone rows alongside it\n' +
      'would still land, and shipping a knowingly-wrong league payout is a support ticket.\n' +
      'The budgeted names are: ' + Object.keys(LEAGUE_STARTER_STAMPS).join(', ') + '.\n' +
      'Most likely cause: migrateRatingV2.js stamped seasonPeakLeague through the v2 league\n' +
      'table (RATING_V2=true) while the peak itself is on the Season 0 scale.\n' +
      'Fix the league names, or pass --allow-unknown-league to pay them 0 on purpose.'
    );
  }

  if (!apply) {
    console.log('\nDRY RUN — nothing was written. Re-run with --apply to grant.');
    console.log('=================================');
    return { apply, ...stats, leagueHist, unknownLeagues, largest };
  }

  /* ---- PASS 2: APPLY --------------------------------------------------- */
  console.log('\n=== PASS 2: APPLY (stamps -> badges) ===');

  const applied = {
    accounts: 0,
    badgesWritten: 0,
    stampsGranted: 0,
    ledgerApplied: 0,
    ledgerDuplicate: 0,
    ledgerDisabled: 0,
    skipped: 0,
  };
  let applyBatches = 0;

  for await (const b of idBatches({ batchSize, limit })) {
    applyBatches++;
    const docs = await User.find({ _id: { $gte: b.first, $lte: b.last } })
      .select(SCAN_PROJECTION)
      .lean();

    // Recomputed, not carried over from pass 1: the calculators are pure, so
    // this reproduces pass 1 exactly while keeping 2M plans out of memory.
    const work = [];
    for (const u of docs) {
      const id = String(u._id);
      const plan = planGrants(u, { isTop100: topHundred.ids.has(id) });
      if (!plan) { applied.skipped++; continue; }
      work.push({ id, user: u, plan });
    }
    if (work.length === 0) {
      if (pauseMs) await sleep(pauseMs);
      continue;
    }

    // --- STEP 1: STAMPS. Idempotent per key, so a repeat is free.
    await mapWithConcurrency(work, concurrency, async (item) => {
      const jobs = [];
      if (item.plan.grinderStamps > 0) {
        jobs.push({ delta: item.plan.grinderStamps, key: `a:season1:${item.id}:grinder`, meta: { periodKey: 'season1' } });
      }
      if (item.plan.leagueStarterStamps > 0) {
        jobs.push({ delta: item.plan.leagueStarterStamps, key: `a:season1:${item.id}:league`, meta: { periodKey: 'season1' } });
      }
      for (const tier of item.plan.milestones) {
        jobs.push({
          delta: tier.stamps,
          key: `a:season1:${item.id}:milestone:${tier.games}`,
          meta: { periodKey: 'season1', tier: tier.games },
        });
      }
      for (const job of jobs) {
        const res = await grantStamps(item.user._id, job.delta, 'admin_adjust', job.key, job.meta);
        if (res.disabled) {
          applied.ledgerDisabled++;
          if (!allowStampsDisabled) {
            throw new Error(
              'grantStamps() reported disabled mid-run (STAMPS_ENABLED went false). Aborting: ' +
              'the rest of this run would write badges and no currency.'
            );
          }
        } else if (res.duplicate) {
          applied.ledgerDuplicate++;
        } else if (res.applied) {
          applied.ledgerApplied++;
          applied.stampsGranted += job.delta;
        } else if (res.insufficient) {
          // Credits cannot be insufficient. If this fires the sign is wrong.
          throw new Error(`grantStamps() returned insufficient for a CREDIT of ${job.delta} (${job.key}).`);
        }
      }
    });

    // --- STEP 2: OG BADGE. A $set recomputed from created_at, so re-running it
    //     is a no-op rather than a second payout.
    const badgeOps = work
      .filter((item) => writeOgBadge && item.plan.ogAccount)
      .map((item) => ({
        updateOne: {
          filter: { _id: item.user._id },
          update: { $set: { ogAccount: true } },
        },
      }));
    for (let i = 0; i < badgeOps.length; i += WRITE_CHUNK) {
      await User.bulkWrite(badgeOps.slice(i, i + WRITE_CHUNK), { ordered: false });
    }
    applied.badgesWritten += badgeOps.length;
    applied.accounts += work.length;

    console.log(`[season1] apply batch ${applyBatches}: ${work.length} accounts, ${applied.accounts} total, ` +
      `${applied.stampsGranted.toLocaleString('en-US')} stamps ` +
      `(${applied.ledgerApplied} ledger rows, ${applied.ledgerDuplicate} already paid)`);
    if (pauseMs) await sleep(pauseMs);
  }

  const elapsed = Math.round((Date.now() - started) / 1000);
  console.log('\n============ APPLIED ============');
  console.log(`accounts processed  : ${applied.accounts}`);
  console.log(`OG badges written   : ${applied.badgesWritten}${writeOgBadge ? '' : ' (badge writing OFF)'}`);
  console.log(`stamps granted      : ${applied.stampsGranted.toLocaleString('en-US')}`);
  console.log(`ledger rows applied : ${applied.ledgerApplied} (already-paid duplicates: ${applied.ledgerDuplicate})`);
  if (applied.ledgerDisabled) {
    console.log(`ledger calls DROPPED: ${applied.ledgerDisabled}  <-- STAMPS_ENABLED was off; re-run with it on`);
  }
  console.log(`skipped             : ${applied.skipped} (no rating)`);
  console.log(`elapsed: ${elapsed}s`);
  console.log('=================================');

  return { apply, ...stats, applied, largest };
}

function printSummary({
  apply, scopeNote, stats, leagueHist, milestoneHist,
  unknownLeagues, largest, samples, topHundred, stampsEnabled, writeOgBadge,
}) {
  const n = (v) => v.toLocaleString('en-US');
  console.log('\n========= DRY RUN SUMMARY =========');
  console.log(`mode                 : ${apply ? 'APPLY (writes follow this summary)' : 'DRY RUN (no writes)'}`);
  console.log(`scope                : ${scopeNote}`);
  console.log(`accounts scanned     : ${n(stats.scanned)}`);
  console.log(`accounts in scope    : ${n(stats.eligible)}  (would be granted)`);
  console.log(`no usable rating     : ${n(stats.skippedNoRating)}  (skipped — no seasonPeakElo and no elo_s0)`);
  console.log('');
  console.log(`TOTAL STAMPS         : ${n(stats.stampsTotal)}`);
  console.log(`  grinder            : ${n(stats.grinderStampsTotal)}  (${n(stats.grinderAtCap)} at the ${n(GRINDER_STAMPS_CAP)} cap)`);
  console.log(`  league starter     : ${n(stats.leagueStampsTotal)}  (incl. ${n(stats.top100Hits)} top-100 bonuses of ${TOP100_BONUS_STAMPS})`);
  console.log(`  milestones         : ${n(stats.milestoneStampsTotal)}`);
  console.log(`OG badges            : ${n(stats.ogBadges)}${writeOgBadge ? '' : '  (NOT being written)'}`);
  console.log(`ledger rows to write : ${n(stats.ledgerRows)}${stampsEnabled ? '' : '  (0 will be written — STAMPS_ENABLED is off)'}`);
  console.log(`avg stamps per acct  : ${stats.eligible ? n(Math.round(stats.stampsTotal / stats.eligible)) : 0}`);
  console.log('\nNo XP is granted by this script. See the file header.');

  console.log('\nSeason 0 peak leagues (leagueStarterStamps):');
  printHist(leagueHist, stats.eligible);
  const unknownNames = Object.keys(unknownLeagues);
  if (unknownNames.length) {
    console.log(`  UNBUDGETED league names (0 stamps): ${unknownNames.map((k) => `${k} x${unknownLeagues[k]}`).join(', ')}`);
  }
  console.log('\nMilestone tiers cleared (milestoneStamps):');
  printHist(milestoneHist, stats.eligible);

  if (largest) {
    const p = largest.plan;
    console.log('\nLargest single grant:');
    console.log(`  ${largest.username} (${largest.id})`);
    console.log(`    peak ${Math.round(p.peak)} (${p.leagueName ?? 'no league'}), ${n(p.games)} career ranked games`);
    console.log(`    stamps ${n(p.stampsTotal)} = grinder ${n(p.grinderStamps)} + league ${n(p.leagueStarterStamps)}${p.isTop100 ? ' (top 100)' : ''} + milestones ${n(p.milestoneStamps)}`);
    console.log(`    OG badge: ${p.ogAccount ? 'yes' : 'no'}`);
  }
  if (samples.length) {
    console.log('\nSample grants:');
    for (const s of samples) console.log(s);
  }
  if (topHundred.cutoff !== null) {
    console.log(`\nTop-100 bonus cutoff : elo_s0 >= ${topHundred.cutoff} (${topHundred.count} accounts)`);
  }
  console.log('===================================');
}

function printHist(hist, total) {
  const entries = Object.entries(hist).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    console.log('  (empty)');
    return;
  }
  for (const [name, count] of entries) {
    const pct = total ? ((count / total) * 100).toFixed(2) : '0.00';
    const bar = '#'.repeat(total ? Math.min(40, Math.round((count / total) * 40)) : 0);
    console.log(`  ${name.padEnd(12)} ${String(count).padStart(8)}  ${pct.padStart(6)}%  ${bar}`);
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const limitRaw = flagValue('--limit', null);
  const limit = limitRaw === null ? null : Number(limitRaw);
  if (limitRaw !== null && (!Number.isInteger(limit) || limit <= 0)) {
    console.error(`--limit must be a positive integer (got "${limitRaw}")`);
    process.exit(1);
  }
  const batchSize = Number(flagValue('--batch', DEFAULT_BATCH));
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    console.error('--batch must be a positive integer');
    process.exit(1);
  }
  const pauseMs = Number(flagValue('--pause-ms', DEFAULT_PAUSE_MS));
  if (!Number.isFinite(pauseMs) || pauseMs < 0) {
    console.error('--pause-ms must be >= 0');
    process.exit(1);
  }
  const concurrency = Number(flagValue('--concurrency', DEFAULT_CONCURRENCY));
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    console.error('--concurrency must be a positive integer');
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB;
  if (!mongoUri) {
    console.error('MONGODB env variable not set');
    process.exit(1);
  }

  console.log(`Connecting to MongoDB...${apply ? ' (APPLY MODE — THIS WRITES AND PAYS)' : ' (dry run — no writes)'}`);
  await mongoose.connect(mongoUri);
  console.log('Connected!\n');
  try {
    await run({
      apply,
      limit,
      batchSize,
      pauseMs,
      concurrency,
      skipOgBadge: process.argv.includes('--skip-og-badge'),
      allowStampsDisabled: process.argv.includes('--allow-stamps-disabled'),
      allowUnknownLeague: process.argv.includes('--allow-unknown-league'),
    });
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('\nSEASON 1 COMPENSATION ABORTED\n');
    console.error(err.message || err);
    process.exit(1);
  });
}
