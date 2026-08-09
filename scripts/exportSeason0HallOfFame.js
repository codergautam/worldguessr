#!/usr/bin/env node
/**
 * SEASON 0 HALL OF FAME EXPORT — the frozen, permanent record of the final
 * Season 0 ladder.
 *
 * Writes a static JSON file to public/ that pages/hall-of-fame.js reads
 * directly. No API route, no database read at request time, ever. The board is
 * a snapshot of a moment that has already passed, so serving it from a live
 * query would be strictly worse in every dimension: slower, more expensive, and
 * capable of showing a DIFFERENT answer tomorrow. It cannot change, so it is a
 * file.
 *
 * TWO FILES, ONE SCAN
 * -------------------
 * The same pass also writes shared/season0/rankTable.js: a rating -> rank
 * lookup covering EVERY eligible account, not just the top N. That is what the
 * OG badge on a profile reads to say "finished #431". Building it here rather
 * than in its own script is the point — one scan, one eligibility rule, one tie
 * rule, so a top-1000 player's profile rank and their row on this board are the
 * same number by construction and can never drift apart.
 *
 * WHY THIS EXISTS
 * ---------------
 * At migration every rating is rescaled: a 20,000 becomes ~1,600
 * (scripts/migrateRatingV2.js). The numbers people spent a year building are
 * gone from the live ladder the instant that script runs. This file is the
 * receipt. It is the one artefact that still says, permanently, what the ladder
 * looked like at the end of Season 0.
 *
 * That is also why every refusal in here is a hard refusal. A Hall of Fame that
 * ships slightly wrong is not a bug you patch next sprint — it is a permanent,
 * public, wrong record of something people care about. When in doubt this
 * script stops and tells the operator what to fix.
 *
 * CLOSING STANDING, NOT PEAK. READ THIS BEFORE CHANGING THE SORT.
 * --------------------------------------------------------------
 * Ranks come from `elo_s0`, the rating AT THE MIGRATION INSTANT. They do NOT
 * come from `seasonPeakElo`.
 *
 * These are two different concepts and BOTH are visible in the product at the
 * same time: the Season 1 notice modal and the profile badge both show the
 * PEAK, while this board shows the CLOSING standing. A player who hit 15,000 in
 * March and finished on 12,000 sees "peak 15,000" on their profile and appears
 * here at their 12,000 position. If we do not say which is which, loudly and in
 * both places, that player reads this board as a peak board, concludes it is
 * broken, and says so publicly.
 *
 * So: the payload carries an explicit `basis` block, every row is keyed
 * `elo_s0` rather than a vague `rating`, and the page renders the same
 * distinction in words. A leaderboard is a standing at a moment. This one's
 * moment is the migration.
 *
 * SEASON 0 LEAGUES COME FROM THE OLD CUTOFFS, DERIVED BY DISPLAY NAME
 * ------------------------------------------------------------------
 * Do NOT call getLeague() from components/utils/leagues.js here. getLeague()
 * resolves through getActiveLeagues(), which returns the V2 table whenever the
 * RATING_V2 flag is on — and by the time this script runs, on migration day,
 * that flag IS on. Every row would be stamped with a v2 tier name computed from
 * a v1 number, which is meaningless.
 *
 * Instead we read the v1 `leagues` table directly and derive tiers from the
 * display `.name`, never the object key. leagues.js has a KNOWN WART, documented
 * in that file: the keys and names are swapped for the first two tiers (key
 * `explorer` displays as "Trekker", key `trekker` displays as "Explorer"). Keys
 * are meaningless here; names are what players saw. Deriving from `.name` is
 * also what keeps this script correct after that wart is eventually fixed.
 *
 * The derived table is then checked against the frozen Season 0 cutoffs below.
 * If leagues.js has been re-cut, this script REFUSES rather than silently
 * stamping a permanent record with tiers nobody signed off on.
 *
 * READ-ONLY with respect to MongoDB. This script never writes to the database.
 * The only thing --apply gates is writing the output JSON file to disk.
 *
 * REQUIRES
 * --------
 *   MONGODB env var (dotenv/.env is loaded).
 *   The migration must have run: `elo_s0` must be populated. An account created
 *   AFTER migration day legitimately has a null elo_s0 and simply was not part
 *   of Season 0, so those are skipped rather than treated as an error — but a
 *   collection where NOTHING has an elo_s0 means the migration has not run, and
 *   that is refused.
 *
 * Usage (from project root):
 *   node scripts/exportSeason0HallOfFame.js                  (dry run — full scan, reports, writes nothing)
 *   node scripts/exportSeason0HallOfFame.js --apply          (write both output files)
 *   node scripts/exportSeason0HallOfFame.js --limit 50000    (smoke test over the first 50k users)
 *
 * BOTH output files are source-controlled artefacts: run this against the live
 * database, then COMMIT AND DEPLOY the two files. The rank table is a module the
 * API imports, so it takes effect on the next deploy, not the moment the script
 * finishes.
 *
 * Flags:
 *   --apply             Required to write the output files. Default is a dry run.
 *   --out <path>        Board output path. Default: public/season0-hall-of-fame.json
 *   --rank-out <path>   Rank table output path. Default: shared/season0/rankTable.js
 *   --top N             Board size. Default 1000. Does NOT affect the rank table,
 *                       which always covers every eligible account.
 *   --limit N           Scan only the first N users by _id ascending. TESTING
 *                       ONLY — the board is INCOMPLETE and is stamped
 *                       partial:true. Same --limit semantics as
 *                       migrateRatingV2.js and verifyMigration.js.
 *   --batch N           Read batch size. Default 100000.
 *   --pause-ms N        Pause between batches. Default 250.
 *   --force             Allow a partial (--limit) run to overwrite an existing
 *                       complete board (and rank table). Refused by default.
 *   --allow-partial-migration
 *                       Proceed when most accounts still have a null elo_s0.
 *                       Staging only.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import User from '../models/User.js';
import { leagues } from '../components/utils/leagues.js';
import { buildRankTable } from '../shared/season0/rank.js';

const DEFAULT_OUT = path.join('public', 'season0-hall-of-fame.json');
const DEFAULT_RANK_OUT = path.join('shared', 'season0', 'rankTable.js');
const DEFAULT_TOP = 1000;
const DEFAULT_BATCH = 100000;
const DEFAULT_PAUSE_MS = 250;

/**
 * Payload schema version. BUMP THIS whenever the shape of `players[]` or the
 * header changes. components/hallOfFame.js checks it and renders the
 * "not available" state rather than a half-parsed board if it ever reads a
 * payload it does not understand — which is the correct behaviour for a file
 * that may be served from a CDN cache long after a deploy.
 */
export const SCHEMA_VERSION = 1;

/**
 * The FROZEN Season 0 tier cutoffs, as players saw them for the whole season.
 * This is the signed-off product fact; leagues.js is merely where the same
 * numbers happen to live in code today. The check in buildSeason0Tiers() exists
 * to catch the day those two drift apart.
 */
const SEASON0_CUTOFFS = [
  { name: 'Trekker', min: 0 },
  { name: 'Explorer', min: 2000 },
  { name: 'Voyager', min: 5000 },
  { name: 'Nomad', min: 8000 },
];

function flagValue(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) return fallback;
  return v;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const safeCount = (n) => (Number.isFinite(Number(n)) ? Math.max(0, Math.round(Number(n))) : 0);

/**
 * duels_wins + duels_losses + duels_tied. The one career-games number every
 * ranked surface keys on (same definition as
 * scripts/grantSeason1Compensation.js and placementGates.backfillRatedGames).
 */
export function careerRankedGames(user) {
  return safeCount(user.duels_wins) + safeCount(user.duels_losses) + safeCount(user.duels_tied);
}

/* ------------------------------------------------------------------ *
 * Season 0 league table
 * ------------------------------------------------------------------ */

/**
 * Build the Season 0 tier list from the v1 `leagues` table, keyed by DISPLAY
 * NAME (see the header: the object keys are swapped for the first two tiers and
 * are not to be trusted), then verify it against the frozen cutoffs.
 *
 * Throws with operator instructions rather than guessing. A permanent record is
 * not the place to shrug at a table mismatch.
 */
export function buildSeason0Tiers() {
  const derived = Object.values(leagues)
    .map((l) => ({ name: l.name, min: Number(l.min), max: Number(l.max), emoji: l.emoji, color: l.color }))
    .sort((a, b) => a.min - b.min);

  const describe = (list) => list.map((t) => `${t.name}@${t.min}`).join(', ');

  const mismatch =
    derived.length !== SEASON0_CUTOFFS.length ||
    derived.some((t, i) => t.name !== SEASON0_CUTOFFS[i].name || t.min !== SEASON0_CUTOFFS[i].min);

  if (mismatch) {
    throw new Error(
      'components/utils/leagues.js no longer describes the Season 0 tiers.\n' +
      `  expected (frozen): ${describe(SEASON0_CUTOFFS)}\n` +
      `  derived from code: ${describe(derived)}\n` +
      '\n' +
      'The Hall of Fame is a PERMANENT record of Season 0, so it will not guess a\n' +
      'tier table. Either the v1 table was re-cut (in which case the frozen cutoffs\n' +
      'in this file are the ones that shipped and should be used verbatim), or the\n' +
      'v1 table was deleted (in which case inline SEASON0_CUTOFFS here and drop the\n' +
      'import). Do not "fix" this by relaxing the check.'
    );
  }

  // Sorted DESCENDING for the lookup below: first tier whose floor we clear wins.
  return derived.slice().reverse();
}

/**
 * Season 0 league NAME for a Season 0 rating.
 *
 * Deliberately floor-only, ignoring each tier's `max`: the v1 Nomad band is
 * declared 8000..20000 and a rating above 20000 would fall out of a
 * min/max range check entirely, landing in the fallback tier. On a permanent
 * board, the single highest-rated player in the game's history reading
 * "Trekker" is exactly the kind of unfixable embarrassment this script exists
 * to avoid.
 */
export function season0League(elo, tiersDesc) {
  const value = Number(elo);
  for (const tier of tiersDesc) {
    if (value >= tier.min) return tier.name;
  }
  return tiersDesc[tiersDesc.length - 1].name;
}

/* ------------------------------------------------------------------ *
 * Ordering
 * ------------------------------------------------------------------ */

/**
 * Board order: rating descending, then a DETERMINISTIC tie-break.
 *
 * The tie-break matters more than it looks. Two runs of this script (a
 * rehearsal and the real thing, or a re-run after a failed write) must produce
 * byte-identical files, and Mongo's natural order is not a guarantee of
 * anything. Username then _id gives a total order over distinct documents.
 */
export function compareEntries(a, b) {
  if (b.elo_s0 !== a.elo_s0) return b.elo_s0 - a.elo_s0;
  if (a.username !== b.username) return a.username < b.username ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/**
 * Bounded top-N. Keeps at most `size` entries sorted, so peak memory is a
 * function of the board size and not of the 2M-document collection being
 * scanned. The `worst` fast path means the overwhelming majority of accounts
 * cost one numeric comparison.
 */
class TopN {
  constructor(size) {
    this.size = size;
    this.entries = [];
  }

  get full() {
    return this.entries.length >= this.size;
  }

  offer(entry) {
    if (this.full) {
      const worst = this.entries[this.entries.length - 1];
      if (compareEntries(entry, worst) >= 0) return false;
      this.entries.pop();
    }
    // Linear insert. Only reached by entries that actually make the board, so
    // in practice this runs ~`size` times plus a thin tail, not once per doc.
    let i = this.entries.length;
    while (i > 0 && compareEntries(entry, this.entries[i - 1]) < 0) i--;
    this.entries.splice(i, 0, entry);
    return true;
  }

  toArray() {
    return this.entries;
  }
}

/**
 * Standard competition ranking: equal ratings share a rank, and the next
 * distinct rating skips (1, 2, 2, 4).
 *
 * Sequential index+1 would be cheaper, but this board is permanent and public.
 * Two players who finished Season 0 on exactly the same rating did not finish
 * one place apart, and telling one of them they did — forever — over an
 * arbitrary alphabetical tie-break is not a thing to ship.
 */
export function assignRanks(sorted) {
  let lastRating = null;
  let lastRank = 0;
  return sorted.map((entry, index) => {
    const rank = entry.elo_s0 === lastRating ? lastRank : index + 1;
    lastRating = entry.elo_s0;
    lastRank = rank;
    return { rank, ...entry };
  });
}

/* ------------------------------------------------------------------ *
 * The rank table module
 * ------------------------------------------------------------------ */

/**
 * Schema version of shared/season0/rankTable.js. Bump if the exported shape
 * changes; shared/season0/rank.js reads `ranks` and nothing else, so a bump
 * only matters the day that stops being true.
 */
export const RANK_TABLE_SCHEMA_VERSION = 1;

/**
 * Render the generated module. Source text, not JSON: api/* is loaded by
 * server.js as plain Node ESM, where importing JSON needs import attributes
 * that differ by Node version. See shared/season0/rankTable.js for the rest.
 *
 * `ranks` is emitted 10 pairs to a line. A single 60 KB line would be a diff
 * nobody can read, and this file lands in code review like any other.
 */
export function renderRankTableModule({ ranks, eligibleAccounts, partial, generatedAt }) {
  const entries = Object.entries(ranks);
  const lines = [];
  for (let i = 0; i < entries.length; i += 10) {
    lines.push('    ' + entries.slice(i, i + 10).map(([rating, rank]) => `${rating}: ${rank},`).join(' '));
  }
  const body = lines.length ? `\n${lines.join('\n')}\n  ` : '';

  return `/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * The frozen Season 0 closing ladder, collapsed to a rating -> rank lookup.
 * Written by:
 *
 *     node scripts/exportSeason0HallOfFame.js --apply
 *
 * ...which produces this file and public/season0-hall-of-fame.json from the SAME
 * scan, so the rank on a player's profile and their row on the Hall of Fame page
 * can never disagree.
 *
 * WHY A TABLE AND NOT A LIVE COUNT
 * --------------------------------
 * "Rank #431 on the day the ranked update landed" is a historical fact. A
 * countDocuments({ elo_s0: { $gt: x } }) at request time would answer it
 * differently every month as accounts are banned or deleted, would need a new
 * index on a 2M-document collection, and would disagree with the Hall of Fame
 * (which excludes banned / pending-rename / unnamed accounts as of migration
 * day). It cannot change, so it is a file — same reasoning as the board itself.
 *
 * A .js module rather than JSON because api/* is loaded by server.js as plain
 * Node ESM, where importing JSON needs import attributes that vary by Node
 * version. This just imports.
 */

export const SEASON0_RANK_TABLE = {
  schemaVersion: ${RANK_TABLE_SCHEMA_VERSION},
  /** ISO timestamp of the export, or null while the table is still empty. */
  generatedAt: ${generatedAt ? JSON.stringify(generatedAt) : 'null'},
  /** Accounts counted into the ranking (the Hall of Fame's eligible population). */
  eligibleAccounts: ${eligibleAccounts},
  /** True when generated by a --limit smoke run. Never true in a shipped table. */
  partial: ${partial === true},
  /**
   * Rounded closing rating (elo_s0) -> competition rank. Equal ratings share a
   * rank and the next distinct rating skips: 1, 2, 2, 4.
   */
  ranks: {${body}},
};

export default SEASON0_RANK_TABLE;
`;
}

/* ------------------------------------------------------------------ *
 * Batching
 * ------------------------------------------------------------------ */

/**
 * Yield { first, last, count } _id ranges of `batchSize` users, ascending.
 * Lifted verbatim in shape from migrateRatingV2.js so --limit means the same
 * thing in both scripts: "the first N users by _id".
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

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

export async function run({
  apply = false,
  out = DEFAULT_OUT,
  rankOut = DEFAULT_RANK_OUT,
  top = DEFAULT_TOP,
  limit = null,
  batchSize = DEFAULT_BATCH,
  pauseMs = DEFAULT_PAUSE_MS,
  force = false,
  allowPartialMigration = false,
} = {}) {
  const started = Date.now();
  const partial = Boolean(limit);

  // ---- frozen inputs BEFORE touching a single document -------------------
  const tiersDesc = buildSeason0Tiers();
  console.log(`[hof] Season 0 tiers: ${tiersDesc.slice().reverse().map((t) => `${t.name} ${t.min}+`).join(', ')}`);
  console.log('[hof]   (derived from the v1 leagues table by DISPLAY NAME, not by object key)');

  // ---- PRE-FLIGHT: has the migration actually run? -----------------------
  const totalAccounts = await User.countDocuments({});
  const snapshotted = await User.countDocuments({ elo_s0: { $ne: null } });
  console.log(`[hof] accounts: ${totalAccounts} total, ${snapshotted} with an elo_s0 snapshot`);

  if (snapshotted === 0) {
    throw new Error(
      'No account has an elo_s0 snapshot, so the Season 0 rating migration has not run.\n' +
      '\n' +
      'elo_s0 is the ONLY record of the closing Season 0 standing — once `elo` has been\n' +
      'converted it is unrecoverable from the live field. Run:\n' +
      '    node scripts/migrateRatingV2.js --apply\n' +
      'then    node scripts/verifyMigration.js\n' +
      'and only then export the Hall of Fame.'
    );
  }

  // Accounts created AFTER migration day legitimately have a null elo_s0: they
  // were never in Season 0. A LARGE null population is the different, alarming
  // case — a migration that died halfway would leave exactly that, and the
  // resulting board would silently omit whoever had not been converted yet.
  const missing = totalAccounts - snapshotted;
  const missingRatio = totalAccounts ? missing / totalAccounts : 0;
  if (missingRatio > 0.5 && !allowPartialMigration) {
    throw new Error(
      `${missing} of ${totalAccounts} accounts (${(missingRatio * 100).toFixed(1)}%) have no elo_s0.\n` +
      '\n' +
      'That is too many to be post-migration signups, so the migration looks INCOMPLETE.\n' +
      'A board exported now would permanently omit every account that was not converted.\n' +
      'Finish the migration (scripts/migrateRatingV2.js --apply) and confirm with\n' +
      'scripts/verifyMigration.js. Staging only: --allow-partial-migration.'
    );
  }
  if (missing > 0) {
    console.log(`[hof] ${missing} accounts have no elo_s0 and are skipped (expected: accounts created after migration day)`);
  }

  // ---- refuse to clobber a complete board with a smoke test --------------
  const outPath = path.resolve(process.cwd(), out);
  if (apply && partial && !force) {
    let existing = null;
    try {
      existing = JSON.parse(await fs.readFile(outPath, 'utf8'));
    } catch (err) {
      if (err && err.code !== 'ENOENT') {
        console.log(`[hof] existing ${outPath} could not be parsed, treating as absent`);
      }
    }
    if (existing && existing.partial === false) {
      throw new Error(
        `${outPath} already holds a COMPLETE board (generated ${existing.generated_at || 'unknown'}, ` +
        `${Array.isArray(existing.players) ? existing.players.length : '?'} players).\n` +
        '\n' +
        'This run used --limit, so its board is partial and would replace the real one\n' +
        'with a smoke test — on a file that ships to every player. Re-run without\n' +
        '--limit, write somewhere else with --out, or pass --force if you genuinely\n' +
        'mean to overwrite it.'
      );
    }
  }

  /* ---- SCAN ------------------------------------------------------------- */
  console.log(`\n=== SCAN (top ${top} by elo_s0, the CLOSING Season 0 standing) ===`);
  console.log(`[hof] scope: ${limit ? `first ${limit} of ${totalAccounts} users (PARTIAL)` : `all ${totalAccounts} users`}`);
  console.log(`[hof] batch size ${batchSize}, pause ${pauseMs}ms\n`);

  const board = new TopN(top);
  // Rating -> how many eligible accounts finished there. The whole rank table
  // comes out of this one Map, which is why the table costs a few thousand
  // integers of memory instead of a second pass over 2M documents.
  const ratingCounts = new Map();
  let scanned = 0;
  let eligible = 0;
  let skippedNoSnapshot = 0;
  let skippedBanned = 0;
  let skippedPendingName = 0;
  let skippedNoUsername = 0;
  let batches = 0;

  for await (const b of idBatches({ batchSize, limit })) {
    batches++;
    const docs = await User.find({ _id: { $gte: b.first, $lte: b.last } })
      .select('_id username elo_s0 duels_wins duels_losses duels_tied banned pendingNameChange')
      .lean();

    for (const u of docs) {
      scanned++;

      // Never part of Season 0 (or not converted). Nothing to rank.
      if (u.elo_s0 === null || u.elo_s0 === undefined || !Number.isFinite(Number(u.elo_s0))) {
        skippedNoSnapshot++;
        continue;
      }
      // Banned accounts are off the board, permanently. Same rule the live
      // leaderboard applies (api/leaderboard.js).
      if (u.banned === true) {
        skippedBanned++;
        continue;
      }
      // pendingNameChange means a moderator has flagged this username as
      // unacceptable and the account must rename before playing. The live
      // leaderboard already hides these. Freezing such a name into a permanent
      // public record is the one place it would be genuinely unfixable, so the
      // same exclusion applies here — more strictly, if anything.
      if (u.pendingNameChange === true) {
        skippedPendingName++;
        continue;
      }
      // No username, nothing to display (api/leaderboard.js drops these too).
      if (!u.username) {
        skippedNoUsername++;
        continue;
      }

      eligible++;
      const rating = Math.round(Number(u.elo_s0));
      // Counted AFTER every exclusion above, so the rank table ranks exactly the
      // population the board ranks. Anything else and a profile would claim a
      // place among players the Hall of Fame says are not there.
      ratingCounts.set(rating, (ratingCounts.get(rating) || 0) + 1);
      const games = careerRankedGames(u);
      board.offer({
        id: String(u._id),
        username: u.username,
        elo_s0: rating,
        games,
        // House formula, same as api/crazyAuth.js and serverUtils/eloRefunds.js:
        // wins over ALL career games, ties included in the denominator.
        // null (not 0) when there are no games, so the page can say "no ranked
        // games" instead of libelling someone with a 0% win rate.
        winRate: games > 0 ? Math.round((safeCount(u.duels_wins) / games) * 10000) / 10000 : null,
        league: season0League(u.elo_s0, tiersDesc),
      });
    }

    console.log(`[hof] batch ${batches}: ${docs.length} users (${scanned} scanned, ${eligible} eligible, board holds ${board.toArray().length})`);
    if (pauseMs) await sleep(pauseMs);
  }

  const ranked = assignRanks(board.toArray()).map(({ id, ...row }) => row);
  const cutoffRating = ranked.length ? ranked[ranked.length - 1].elo_s0 : null;

  // The full-ladder rank lookup. Same population, same tie rule as assignRanks
  // above: rank(r) = 1 + accounts rated above r, so equal ratings share the
  // better rank and the next distinct rating skips.
  const rankTable = buildRankTable(ratingCounts);

  // The two artefacts must agree on every row they both cover. They are built
  // from the same numbers by two different code paths (a sorted top-N vs a
  // histogram), so if those ever diverge this is where it shows up — before the
  // files are written, not after a player notices their profile and the board
  // disagree about where they finished.
  for (const row of ranked) {
    const fromTable = rankTable.ranks[String(row.elo_s0)];
    if (fromTable !== row.rank) {
      throw new Error(
        `RANK MISMATCH at elo_s0=${row.elo_s0}: the board says #${row.rank}, the rank table says ` +
        `#${fromTable === undefined ? 'missing' : fromTable}.\n` +
        'Refusing to write either file — a profile and the Hall of Fame must never ' +
        'quote different finishing places for the same player.'
      );
    }
  }
  if (rankTable.eligibleAccounts !== eligible) {
    throw new Error(
      `RANK TABLE COUNT MISMATCH: ${rankTable.eligibleAccounts} accounts in the table, ${eligible} eligible in the scan.`
    );
  }

  /* ---- PAYLOAD ---------------------------------------------------------- */
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    // Every rating in this file is in SEASON 0 units (the 0..20,000 scale).
    // They are NOT comparable to a Season 1 rating and must never be rendered
    // beside one without saying so.
    units: 'season0',
    totalAccounts,
    snapshottedAccounts: snapshotted,
    eligibleAccounts: eligible,
    boardSize: ranked.length,
    requestedTop: top,
    cutoffRating,
    partial,
    scanLimit: limit || null,
    basis: {
      field: 'elo_s0',
      meaning: 'closing',
      note:
        'Ranks are the FINAL Season 0 standing at the migration instant, not a ' +
        'career peak. seasonPeakElo is a separate, higher number shown on player ' +
        'profiles; it is deliberately absent from this file.',
    },
    ranking: {
      method: 'competition',
      note: 'Equal ratings share a rank and the next distinct rating skips (1, 2, 2, 4). Display order within a tie is username then account id.',
    },
    excluded: {
      banned: skippedBanned,
      pendingNameChange: skippedPendingName,
      noUsername: skippedNoUsername,
      noSnapshot: skippedNoSnapshot,
    },
    leagues: tiersDesc.slice().reverse().map((t) => ({ name: t.name, min: t.min })),
    fields: {
      rank: 'Competition rank on the closing Season 0 ladder',
      username: 'Username at export time',
      elo_s0: 'Closing Season 0 rating (old scale)',
      games: 'Career ranked games: duels_wins + duels_losses + duels_tied',
      winRate: 'wins / career ranked games, 0..1, null when games is 0',
      league: 'Season 0 league from the OLD cutoffs',
    },
    players: ranked,
  };

  /* ---- SUMMARY ---------------------------------------------------------- */
  const elapsed = Math.round((Date.now() - started) / 1000);
  console.log('\n============ SUMMARY ============');
  console.log(`mode                : ${apply ? 'APPLY (writes the FILE; Mongo stays read-only)' : 'DRY RUN (nothing written)'}`);
  console.log(`accounts scanned    : ${scanned}`);
  console.log(`eligible for board  : ${eligible}`);
  console.log(`board size          : ${ranked.length} (requested top ${top})`);
  console.log(`cutoff rating       : ${cutoffRating === null ? 'n/a' : cutoffRating}`);
  console.log(`excluded — banned   : ${skippedBanned}`);
  console.log(`excluded — pending name change: ${skippedPendingName}`);
  console.log(`excluded — no username        : ${skippedNoUsername}`);
  console.log(`excluded — no elo_s0 snapshot : ${skippedNoSnapshot}`);

  const leagueHist = Object.create(null);
  for (const row of ranked) leagueHist[row.league] = (leagueHist[row.league] || 0) + 1;
  console.log('\nSeason 0 league split ON THE BOARD:');
  const histEntries = Object.entries(leagueHist).sort((a, b) => b[1] - a[1]);
  if (histEntries.length === 0) console.log('  (empty)');
  for (const [name, count] of histEntries) {
    const pct = ranked.length ? ((count / ranked.length) * 100).toFixed(2) : '0.00';
    console.log(`  ${name.padEnd(10)} ${String(count).padStart(6)}  ${pct.padStart(6)}%`);
  }

  if (ranked.length) {
    console.log('\nTop of the board:');
    for (const row of ranked.slice(0, 10)) {
      console.log(
        `  #${String(row.rank).padStart(4)}  ${row.username.padEnd(20)} ` +
        `elo_s0=${String(row.elo_s0).padStart(6)}  games=${String(row.games).padStart(5)}  ` +
        `wr=${row.winRate === null ? '  n/a' : `${(row.winRate * 100).toFixed(1)}%`.padStart(5)}  ${row.league}`
      );
    }
  }

  if (partial) {
    console.log('\nWARNING: --limit was used. This board is PARTIAL and stamped partial:true.');
    console.log('         Do not ship it. The page renders it, wrongly, as if it were the real ladder.');
  }
  console.log(`\nelapsed: ${elapsed}s`);

  console.log(`\nrank table          : ${rankTable.distinctRatings} distinct ratings over ${rankTable.eligibleAccounts} accounts`);

  if (!apply) {
    console.log(`\nDRY RUN — nothing written. Re-run with --apply to write ${out} and ${rankOut}.`);
    console.log('=================================');
    return { ...payload, players: undefined, written: false, outPath, rankTable };
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  // Compact, not pretty-printed: this file is downloaded by every visitor to
  // the page. Whitespace is bytes on the wire for no reader's benefit.
  await fs.writeFile(outPath, JSON.stringify(payload), 'utf8');
  const { size } = await fs.stat(outPath);
  console.log(`\nWrote ${outPath} (${(size / 1024).toFixed(1)} KB, ${ranked.length} players).`);
  console.log('Serve it from public/. The page reads it directly — no API, no database read.');

  // The rank table follows the SAME partial rule as the board: a --limit run
  // produces a table that would tell most of the player base they finished
  // higher than they did, which is worse than telling them nothing.
  const rankOutPath = path.resolve(process.cwd(), rankOut);
  if (partial && !force) {
    console.log(`\nSKIPPED ${rankOutPath} — this run is PARTIAL (--limit). Pass --force to write it anyway.`);
    console.log('=================================');
    return { ...payload, players: undefined, written: true, outPath, rankOutPath: null, rankTable };
  }

  await fs.mkdir(path.dirname(rankOutPath), { recursive: true });
  await fs.writeFile(
    rankOutPath,
    renderRankTableModule({
      ranks: rankTable.ranks,
      eligibleAccounts: rankTable.eligibleAccounts,
      partial,
      generatedAt: payload.generated_at,
    }),
    'utf8'
  );
  const rankSize = (await fs.stat(rankOutPath)).size;
  console.log(`Wrote ${rankOutPath} (${(rankSize / 1024).toFixed(1)} KB, ${rankTable.distinctRatings} ratings).`);
  console.log('COMMIT AND DEPLOY BOTH FILES. The rank table is imported by api/publicProfile.js,');
  console.log('so profiles keep showing no rank until a build ships it.');
  console.log('=================================');

  return { ...payload, players: undefined, written: true, outPath, rankOutPath, rankTable };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const out = flagValue('--out', DEFAULT_OUT);
  const rankOut = flagValue('--rank-out', DEFAULT_RANK_OUT);

  const topRaw = flagValue('--top', null);
  const top = topRaw === null ? DEFAULT_TOP : Number(topRaw);
  if (topRaw !== null && (!Number.isInteger(top) || top <= 0)) {
    console.error(`--top must be a positive integer (got "${topRaw}")`);
    process.exit(1);
  }

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

  const mongoUri = process.env.MONGODB;
  if (!mongoUri) {
    console.error('MONGODB env variable not set');
    process.exit(1);
  }

  console.log(`Connecting to MongoDB...${apply ? ' (APPLY MODE — will write the output FILES; Mongo stays read-only)' : ' (dry run — no file written)'}`);
  await mongoose.connect(mongoUri);
  console.log('Connected!\n');
  try {
    await run({
      apply,
      out,
      rankOut,
      top,
      limit,
      batchSize,
      pauseMs,
      force: process.argv.includes('--force'),
      allowPartialMigration: process.argv.includes('--allow-partial-migration'),
    });
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('\nHALL OF FAME EXPORT ABORTED\n');
    console.error(err.message || err);
    process.exit(1);
  });
}
