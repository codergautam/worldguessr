#!/usr/bin/env node
/**
 * Backfill: reverse duel WIN/LOSS counters for games that were ELO-refunded
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
 *   - decisive -> decrement duels_losses by 1 for the loser (elo.change < 0).
 * Counters are clamped at 0.
 *
 * Whom it touches: every non-guest player who is NOT the offender. The live path
 * knows the offender id and skips them; this one-off has no per-game offender id,
 * so it uses two proxies that match the live intent: (1) self-deleted offenders
 * were anonymized to accountId:null and are skipped by the guest check;
 * (2) still-present offenders are User.banned and are skipped via a lookup — this
 * also avoids mutating a leaderboard-hidden banned account. (Residual: a
 * temp-banned offender whose ban already expired is no longer flagged banned and
 * would be treated as a victim — rare, and only inflates that ex-offender's own
 * win rate, never a real victim's.)
 *
 * Idempotent + resumable: each game is atomically claimed via winLossAdjusted,
 * so re-running (or resuming after a crash) never double-decrements.
 *
 * Run:  node scripts/backfillRefundedDuelWinLoss.js [--dry-run]
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { pathToFileURL } from 'url';
import Game from '../models/Game.js';
import User from '../models/User.js';

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

  // Cache banned-status lookups so we don't re-query the same account across games.
  const bannedCache = new Map();
  const isBanned = async (accountId) => {
    if (bannedCache.has(accountId)) return bannedCache.get(accountId);
    let banned = false;
    try {
      const u = await User.findById(accountId).select('banned').lean();
      banned = !!(u && u.banned);
    } catch {
      banned = false; // unresolvable id -> treat as victim; a later CastError on update is caught below
    }
    bannedCache.set(accountId, banned);
    return banned;
  };

  if (dryRun) {
    const games = await Game.countDocuments(baseFilter);
    let estLoss = 0;
    let estTie = 0;
    const cursor = Game.find(baseFilter).select('players.accountId players.elo.change players.finalRank result.isDraw').lean().cursor();
    for (let g = await cursor.next(); g != null; g = await cursor.next()) {
      const isDraw = !!(g.result && g.result.isDraw);
      for (const p of g.players || []) {
        if (!p.accountId) continue;
        if (await isBanned(p.accountId)) continue;
        // Reverse the loss by finalRank (the recorded loser), not by ELO sign — an
        // underdog loser's change can round to 0 yet they still got duels_losses+1.
        if (isDraw) { estLoss++; estTie++; }
        else if (p.finalRank === 2) estLoss++;
      }
    }
    return { dryRun: true, games, estLoss, estTie };
  }

  let gamesProcessed = 0;
  let lossesReversed = 0;
  let tiesReversed = 0;

  // Claim one unreconciled game at a time; setting winLossAdjusted drops it from
  // the filter, so the loop drains the set and is safe to resume.
  let claimed;
  // eslint-disable-next-line no-cond-assign
  while ((claimed = await Game.findOneAndUpdate(
    baseFilter,
    { $set: { winLossAdjusted: true } },
    { new: false, projection: { 'players.accountId': 1, 'players.elo.change': 1, 'players.finalRank': 1, 'result.isDraw': 1 } },
  ))) {
    gamesProcessed++;
    const isDraw = !!(claimed.result && claimed.result.isDraw);
    for (const p of claimed.players || []) {
      if (!p.accountId) continue; // guest, or self-deleted offender (anonymized to null)
      if (await isBanned(p.accountId)) continue; // offender / leaderboard-hidden account

      // Reverse the loss by finalRank (the recorded loser), not by ELO sign — an
      // underdog loser's elo.change can round to 0 yet they still got duels_losses+1.
      let decLoss = 0;
      let decTie = 0;
      if (isDraw) { decLoss = 1; decTie = 1; }
      else if (p.finalRank === 2) decLoss = 1;
      if (decLoss === 0 && decTie === 0) continue;

      const setOps = {};
      if (decLoss) setOps.duels_losses = { $max: [0, { $subtract: ['$duels_losses', decLoss] }] };
      if (decTie) setOps.duels_tied = { $max: [0, { $subtract: ['$duels_tied', decTie] }] };
      try {
        const r = await User.updateOne({ _id: p.accountId }, [{ $set: setOps }]);
        if (r.modifiedCount) { lossesReversed += decLoss; tiesReversed += decTie; }
      } catch (e) {
        console.error('  win/loss reversal failed for account', p.accountId, '-', e?.message || e);
      }
    }
    if (gamesProcessed % 500 === 0) console.log(`  ...${gamesProcessed} games processed`);
  }

  return { dryRun: false, gamesProcessed, lossesReversed, tiesReversed };
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
  if (r.dryRun) {
    console.log(`[DRY RUN] ${r.games} refunded duel(s) to reconcile; ~${r.estLoss} loss + ~${r.estTie} tie decrement(s). No writes made.`);
  } else {
    console.log(`\nDone. Reconciled ${r.gamesProcessed} refunded duel(s); reversed ${r.lossesReversed} loss(es) + ${r.tiesReversed} tie(s).`);
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
