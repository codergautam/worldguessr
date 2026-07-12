#!/usr/bin/env node
/**
 * Backfill v2: reverse duel WIN/LOSS counters for games that were ELO-refunded
 * before the win/loss reconciliation existed.
 *
 * Historically a ban/temp-ban refunded the victim's ELO but left their
 * duels_losses / duels_tied counters untouched, so a cheater's games still
 * dragged down the victim's win rate (win_rate = wins / (wins + losses + ties)).
 * Going forward, serverUtils/eloRefunds.js reverses the counters at refund time
 * and stamps Game.winLossAdjusted = true. This script does the same for every
 * PRE-EXISTING refunded ranked_duel game (eloRefunded:true, winLossAdjusted not
 * yet true).
 *
 * Per game it undoes exactly what setElo recorded at game end:
 *   - draw     -> decrement duels_losses AND duels_tied by 1 for each victim;
 *   - decisive -> decrement duels_losses by 1 for the recorded loser (finalRank 2
 *                 — NOT elo.change < 0; an underdog loser's change can round to 0).
 * Counters are clamped at 0.
 *
 * ── What v2 fixes over v1 ──────────────────────────────────────────────────
 *
 * OFFENDER DETECTION. v1 had no per-game offender id and skipped "currently
 * banned" users as a proxy. That proxy is wrong for any offender who was
 * unbanned (or whose temp ban expired) before the run: v1 then treated them as
 * a victim OF THEIR OWN BAN WAVE and erased their legitimate losses (see
 * scripts/repairOffenderWinLoss.js for the cleanup). v2 identifies the offender
 * from the permanent moderation audit log instead: a game's offender is any
 * player with a ban/deletion moderation event within OFFENDER_WAVE_WINDOW_MS of
 * the game's eloRefundedAt — refund waves are triggered BY those events, so the
 * stamps land seconds after the log entry. Offenders are skipped regardless of
 * their current ban status. Games with no eloRefundedAt or no matching wave
 * fall back to v1's banned-flag proxy (and are counted in the summary so the
 * residual risk is visible, not silent).
 *
 * BATCHING. v1 claimed one game per findOneAndUpdate with per-player User
 * lookups — O(n²) scans without an index, tens of hours for a large set, and
 * it died mid-run. v2 ensures the {gameType, eloRefunded, winLossAdjusted}
 * index, reads a page of games per round trip, claims each game with a
 * per-doc findOneAndUpdate issued in parallel (atomic per game, so any
 * concurrent writers partition a page cleanly and this run knows EXACTLY
 * which games it owns — a page-level updateMany can't report which docs it
 * modified), and applies each page's counter reversals in one User.bulkWrite.
 * The live path can never race us: it only claims games with
 * eloRefunded:$ne:true, and ours are already refunded. If the bulkWrite
 * fails before applying anything, the page's claims are un-stamped so a
 * plain re-run finishes the job (see rollbackFailedPage).
 *
 * ATTRIBUTION. Every game v2 stamps carries winLossAdjustedBy:'backfill_v2'
 * (the live path stamps 'live'), so "who reconciled this game" is never
 * forensic work again. v1-era stamps have no attribution — that gap is exactly
 * how the offender bug had to be reconstructed.
 *
 * Idempotent + resumable: claimed games leave the work set, so re-running (or
 * resuming after a crash) never double-decrements.
 *
 * Run:  node scripts/backfillRefundedDuelWinLoss.js [--dry-run]
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { pathToFileURL } from 'url';
import Game from '../models/Game.js';
import User from '../models/User.js';
import ModerationLog from '../models/ModerationLog.js';

const BATCH_SIZE = 500;
// A refund wave's eloRefundedAt stamps trail its triggering moderation event by
// however long the refund loop runs; ±1h covers even a huge offender's wave
// while staying far below the odds of the same PLAYER having an unrelated ban
// event that close (the target must also be in the game).
const OFFENDER_WAVE_WINDOW_MS = 60 * 60 * 1000;

// Every moderation action that triggers an ELO-refund wave: bans do, and the
// account-deletion cascade refunds a self-deleting offender's reported games
// (their games are usually anonymized to accountId:null, but the log is kept
// for completeness).
const REFUNDING_ACTIONS = ['ban_permanent', 'ban_temporary', 'user_deleted'];

/**
 * Load the permanent moderation audit into an offender lookup.
 * @returns {Map<string, number[]>} accountId -> sorted refund-triggering event times (ms)
 */
async function loadOffenderEvents() {
  const logs = await ModerationLog.find(
    { actionType: { $in: REFUNDING_ACTIONS } },
    { 'targetUser.accountId': 1, createdAt: 1 },
  ).lean();
  const map = new Map();
  for (const l of logs) {
    const id = l.targetUser && l.targetUser.accountId;
    if (!id || !l.createdAt) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(new Date(l.createdAt).getTime());
  }
  for (const times of map.values()) times.sort((a, b) => a - b);
  return map;
}

function hasEventNear(times, atMs, windowMs) {
  if (!times) return false;
  // Lists are tiny (a handful of mod actions per account) — linear scan is fine.
  return times.some((t) => Math.abs(t - atMs) <= windowMs);
}

// players.accountId is a String holding a User _id (ObjectId hex) for
// logged-in players. Gate every slot on STRING-form castability:
// - A value that can't cast identifies nobody — and ONE such value inside an
//   $in (or a bulkWrite filter) throws a CastError that kills the run before
//   the page is claimed, wedging every retry on the same page.
// - The typeof matters: bare ObjectId.isValid also accepts numbers (which
//   still THROW on the $in cast) and raw ObjectId instances (which cast fine
//   but silently miss the string-keyed offenderEvents/bannedCache lookups —
//   erasing an offender's losses, the exact v1 bug). String-form isValid
//   exactly equals castability under bson v6. Non-string values can only
//   exist via out-of-band writes (the schema field is String) — skip them,
//   counted as malformedIdSkips so bad data is visible, not fatal.
const isUserAccountId = (id) => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id);

/**
 * Return claimed games to the work set by removing this run's stamps. If even
 * this fails, print the ids — from that moment the games are indistinguishable
 * from legitimately reconciled ones, so the dump is the only recovery breadcrumb.
 */
async function unstampClaims(claimedIds) {
  if (!claimedIds.length) return;
  try {
    await Game.updateMany(
      { _id: { $in: claimedIds } },
      { $unset: { winLossAdjusted: '', winLossAdjustedBy: '' } },
    );
  } catch {
    console.error('  CRITICAL: un-stamp failed. These games are stamped backfill_v2 with NO reversals applied — clear winLossAdjusted on them manually:');
    console.error(`  ${claimedIds.join(',')}`);
  }
}

/**
 * Claim every game in the page this run is about to reverse — one atomic
 * per-doc findOneAndUpdate each, issued in parallel (the driver pools the
 * round trips). Returns the ids this run now OWNS: under any number of
 * concurrent backfill instances each game gets exactly one owner, every
 * owner reverses exactly its own games, and no game can end up
 * stamped-but-skipped. (An earlier revision claimed pages with a single
 * updateMany and aborted on a short modifiedCount — but updateMany can't say
 * WHICH docs it touched, so the abort stranded this run's own claims as
 * reconciled-but-unreversed, permanently.)
 *
 * allSettled, not all: if any claim call fails mid-page, the ones that
 * already succeeded must not be stranded — un-stamp them and die loudly so a
 * plain re-run starts the page over.
 * @returns {Promise<string[]>} ids of the games this run claimed
 */
async function claimGames(page) {
  const settled = await Promise.allSettled(page.map((g) =>
    Game.findOneAndUpdate(
      { _id: g._id, winLossAdjusted: { $ne: true } },
      { $set: { winLossAdjusted: true, winLossAdjustedBy: 'backfill_v2' } },
    ).select('_id').lean(),
  ));
  const claimedIds = [];
  for (const s of settled) {
    if (s.status === 'fulfilled' && s.value) claimedIds.push(String(s.value._id));
  }
  const failed = settled.find((s) => s.status === 'rejected');
  if (failed) {
    console.error(`  claim phase failed mid-page — un-stamping ${claimedIds.length} already-claimed game(s) before aborting.`);
    await unstampClaims(claimedIds);
    throw failed.reason;
  }
  return claimedIds;
}

/**
 * The page's User.bulkWrite failed AFTER its games were claimed. Restore what
 * is provably safe to restore, then rethrow — the run must die loudly rather
 * than leave games recorded as reconciled when they weren't.
 *
 * - Per-op failures (err.writeErrors, ordered:false): every op NOT listed
 *   DID apply — un-stamping would double-decrement those users on re-run.
 *   Keep the stamps and name the accounts whose reversals were lost.
 * - Write-concern failure: the driver ships writeErrors:[] but every op DID
 *   execute on the primary — err.result carries the real counts. Un-stamping
 *   here is the double-decrement trap wearing a "nothing happened" costume;
 *   keep the stamps.
 * - True whole-call failure (network blip before execution — no result, no
 *   per-op errors): nothing was applied, so un-stamp this run's claims: the
 *   games return to the work set and a plain re-run finishes them. (Residual
 *   window: the server applied the write but the connection died before ANY
 *   response arrived — only a multi-document transaction closes that, which
 *   demands a replica set; accepted here.)
 */
async function rollbackFailedPage(err, claimedIds, decEntries) {
  const writeErrors = Array.isArray(err?.writeErrors) ? err.writeErrors : [];
  if (writeErrors.length) {
    const lost = writeErrors.map((we) => decEntries[we.index]?.[0]).filter(Boolean);
    console.error(`  BULKWRITE PARTIAL FAILURE — games stay claimed; reversals were NOT applied for account(s): ${lost.join(', ')}. Repair those manually.`);
    throw err;
  }
  const applied = (err?.result?.modifiedCount ?? 0) + (err?.result?.matchedCount ?? 0);
  if (applied > 0) {
    console.error(`  bulkWrite executed ${err.result.modifiedCount ?? 0} update(s) on the primary but the call still failed (write concern?). Games stay claimed — the reversals ARE applied; verify replication health before re-running.`);
    throw err;
  }
  console.error(`  bulkWrite failed before applying — un-stamping ${claimedIds.length} claimed game(s) so a re-run picks them back up.`);
  await unstampClaims(claimedIds);
  throw err;
}

/**
 * Core reconciliation. Operates on the CURRENT mongoose connection (the caller
 * owns connect/disconnect) so it's unit-testable against a scoped data set.
 *
 * @param {object}  [opts]
 * @param {boolean} [opts.dryRun]      Count only, no writes.
 * @param {object}  [opts.extraFilter] Extra query constraints merged into the base
 *                                     filter — tests pass this to scope to seeded games.
 * @returns {Promise<object>} summary
 */
export async function run({ dryRun = false, extraFilter = {} } = {}) {
  const baseFilter = {
    gameType: 'ranked_duel',
    eloRefunded: true,
    winLossAdjusted: { $ne: true },
    ...extraFilter,
  };

  if (!dryRun) {
    // Idempotent; also declared on the schema so future deploys keep it.
    await Game.collection.createIndex({ gameType: 1, eloRefunded: 1, winLossAdjusted: 1 });
  }

  const offenderEvents = await loadOffenderEvents();
  console.log(`  offender audit loaded: ${offenderEvents.size} account(s) with refund-triggering moderation events`);

  // Cache banned-status lookups across pages (secondary skip: leaderboard-hidden
  // banned accounts shouldn't be mutated, matching v1 and the live path intent).
  const bannedCache = new Map();
  async function loadBannedFlags(accountIds) {
    const missing = accountIds.filter((id) => !bannedCache.has(id));
    if (missing.length) {
      const users = await User.find({ _id: { $in: missing } }).select('banned').lean();
      const found = new Set();
      for (const u of users) {
        bannedCache.set(String(u._id), !!u.banned);
        found.add(String(u._id));
      }
      // Unresolvable ids (user deleted mid-run) -> treat as victim; the
      // counter update for a nonexistent user simply matches nothing.
      // Uncastable ids never reach this query — isUserAccountId gates every
      // slot — so the $in can't throw a CastError and wedge the run.
      for (const id of missing) if (!found.has(id)) bannedCache.set(id, false);
    }
  }

  const summary = {
    dryRun,
    gamesProcessed: 0,         // real runs: games THIS run claimed; dry runs: games fetched
    lossesReversed: 0,         // intended reversals over covered games (a deleted user's op matches nothing but is still counted)
    tiesReversed: 0,
    usersAdjusted: 0,          // user docs bulkWrite actually modified — the ground-truth write count
    // Slot counters below are tallied over every FETCHED game (diagnostics):
    // under concurrent instances they can include slots of games another
    // writer ultimately claimed, so they don't reconcile with gamesProcessed.
    offenderSkips: 0,          // player-slots skipped via wave-matched moderation events
    offendersSeen: new Set(),  // distinct wave-matched offender accounts
    bannedSkips: 0,            // player-slots skipped for being currently banned
    guestSkips: 0,
    malformedIdSkips: 0,       // player-slots whose accountId can't be a User _id (nobody to reverse)
    gamesNoWaveMatch: 0,       // games where NO player wave-matched (proxy-only coverage)
    gamesNoRefundedAt: 0,      // subset cause: missing eloRefundedAt entirely
  };

  let lastId = null; // dry-run pagination cursor (real runs shrink the filter itself)

  for (;;) {
    const pageFilter = dryRun && lastId ? { ...baseFilter, _id: { $gt: lastId } } : baseFilter;
    const page = await Game.find(pageFilter)
      .select('players.accountId players.finalRank result.isDraw eloRefundedAt')
      .sort(dryRun ? { _id: 1 } : undefined)
      .limit(BATCH_SIZE)
      .lean();
    if (page.length === 0) break;
    if (dryRun) lastId = page[page.length - 1]._id;

    const pageAccountIds = [...new Set(page.flatMap((g) => (g.players || []).map((p) => p.accountId).filter(isUserAccountId)))];
    await loadBannedFlags(pageAccountIds);

    // Per-GAME reversal contributions: gameId -> (accountId -> { loss, tie }).
    // Kept per-game rather than aggregated straight into user totals so a
    // real run can apply exactly the games it wins the claim on, and nothing else.
    const gameBumps = new Map();
    const bump = (gid, id, loss, tie) => {
      let perUser = gameBumps.get(gid);
      if (!perUser) gameBumps.set(gid, (perUser = new Map()));
      const e = perUser.get(id) || { loss: 0, tie: 0 };
      e.loss += loss;
      e.tie += tie;
      perUser.set(id, e);
    };

    for (const g of page) {
      const gid = String(g._id);
      const isDraw = !!(g.result && g.result.isDraw);
      const refundedAtMs = g.eloRefundedAt ? new Date(g.eloRefundedAt).getTime() : null;
      if (refundedAtMs === null) summary.gamesNoRefundedAt++;

      let anyWaveMatch = false;
      for (const p of g.players || []) {
        if (!p.accountId) { summary.guestSkips++; continue; }
        if (!isUserAccountId(p.accountId)) { summary.malformedIdSkips++; continue; }
        // Offender: this player's own ban/deletion event triggered the wave
        // that refunded this game. Skipped no matter their status today.
        if (refundedAtMs !== null && hasEventNear(offenderEvents.get(p.accountId), refundedAtMs, OFFENDER_WAVE_WINDOW_MS)) {
          anyWaveMatch = true;
          summary.offenderSkips++;
          summary.offendersSeen.add(p.accountId);
          continue;
        }
        if (bannedCache.get(p.accountId)) { summary.bannedSkips++; continue; }

        // Reverse the loss by finalRank (the recorded loser), not by ELO sign — an
        // underdog loser's elo.change can round to 0 yet they still got duels_losses+1.
        if (isDraw) bump(gid, p.accountId, 1, 1);
        else if (p.finalRank === 2) bump(gid, p.accountId, 1, 0);
      }
      if (!anyWaveMatch) summary.gamesNoWaveMatch++;
    }

    // The games this round actually covers: the whole page in a dry run,
    // exactly the games we won the claim on in a real one. A game another
    // writer claimed is that writer's to reverse — skipping it here is
    // correct, not a failure.
    let coveredIds = page.map((g) => String(g._id));
    if (!dryRun) {
      coveredIds = await claimGames(page);
      if (coveredIds.length !== page.length) {
        console.warn(`  ${page.length - coveredIds.length}/${page.length} game(s) already claimed by another writer — leaving their reversals to it.`);
      }
    }

    // Per-user reversal totals over the covered games only.
    const dec = new Map();
    for (const gid of coveredIds) {
      for (const [id, b] of gameBumps.get(gid) || []) {
        const e = dec.get(id) || { loss: 0, tie: 0 };
        e.loss += b.loss;
        e.tie += b.tie;
        dec.set(id, e);
      }
    }

    if (!dryRun && dec.size) {
      const decEntries = [...dec.entries()];
      let bulkRes;
      try {
        bulkRes = await User.bulkWrite(
          decEntries.map(([accountId, { loss, tie }]) => {
            const setOps = {};
            if (loss) setOps.duels_losses = { $max: [0, { $subtract: [{ $ifNull: ['$duels_losses', 0] }, loss] }] };
            if (tie) setOps.duels_tied = { $max: [0, { $subtract: [{ $ifNull: ['$duels_tied', 0] }, tie] }] };
            return { updateOne: { filter: { _id: accountId }, update: [{ $set: setOps }] } };
          }),
          { ordered: false },
        );
      } catch (err) {
        await rollbackFailedPage(err, coveredIds, decEntries); // always rethrows
      }
      // ordered:false does NOT throw on mongoose cast failures — it drops the
      // bad ops, executes the rest, and resolves with the drops reported here.
      // Should be unreachable (isUserAccountId gates every dec key with the
      // exact same cast rule), so any hit means a reversal silently didn't
      // apply while its game stays stamped: keep the stamps (the other ops
      // DID apply — outside the rollback try on purpose) and die loudly
      // rather than record a clean page.
      const dropped = bulkRes?.mongoose?.validationErrors || [];
      if (dropped.length) {
        console.error(`  ${dropped.length} reversal op(s) dropped by casting — games stay claimed; repair the affected account(s) manually.`);
        throw dropped[0];
      }
      summary.usersAdjusted += bulkRes?.modifiedCount ?? 0;
    }

    summary.gamesProcessed += coveredIds.length;
    for (const { loss, tie } of dec.values()) {
      summary.lossesReversed += loss;
      summary.tiesReversed += tie;
    }
    if (summary.gamesProcessed % (BATCH_SIZE * 10) === 0) {
      console.log(`  ...${summary.gamesProcessed} games processed (${summary.lossesReversed} losses, ${summary.tiesReversed} ties reversed)`);
    }
  }

  summary.offendersSeen = summary.offendersSeen.size;
  return summary;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const mongoUri = process.env.MONGODB;
  if (!mongoUri) {
    console.error('MONGODB env variable not set');
    process.exit(1);
  }

  console.log(`Connecting to MongoDB...${dryRun ? ' (DRY RUN — no writes)' : ''}`);
  await mongoose.connect(mongoUri);
  console.log('Connected!\n');

  const r = await run({ dryRun });
  console.log(`\n${r.dryRun ? '[DRY RUN] Would reconcile' : 'Done. Reconciled'} ${r.gamesProcessed} refunded duel(s); ` +
    `${r.lossesReversed} loss + ${r.tiesReversed} tie reversal(s)${r.dryRun ? '' : ` (${r.usersAdjusted} user doc(s) modified)`}.`);
  console.log(`Offender slots skipped via moderation-audit wave match: ${r.offenderSkips} across ${r.offendersSeen} account(s).`);
  console.log(`Currently-banned slots skipped: ${r.bannedSkips}; guest/anonymized slots skipped: ${r.guestSkips}.`);
  if (r.malformedIdSkips) {
    console.log(`NOTE: ${r.malformedIdSkips} player slot(s) had an accountId that can't be a User id — skipped (nobody to reverse).`);
  }
  if (r.gamesNoWaveMatch) {
    console.log(`NOTE: ${r.gamesNoWaveMatch} game(s) had no wave-matched offender (${r.gamesNoRefundedAt} missing eloRefundedAt) — ` +
      'covered only by the banned-flag proxy for those games.');
  }

  await mongoose.disconnect();
}

// Run main() only when invoked directly (node scripts/...), not when imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
}
