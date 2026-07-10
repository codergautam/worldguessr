#!/usr/bin/env node
/**
 * Backfill: void 2v2 games played with a perm-banned account, reversing the
 * victims' team2v2 win/loss counters.
 *
 * 2v2 games were historically outside the refund machinery (it filtered on
 * gameType 'ranked_duel'), so banning a 2v2 cheater left every opponent's
 * team2v2_losses — and their win rate — permanently dented. Going forward,
 * serverUtils/eloRefunds.js voids 2v2 games at ban time (counter reversal
 * only; 2v2 records no ELO). This script does the same for games that predate
 * that change: every unrefunded 2v2 game involving a CURRENTLY perm-banned
 * account.
 *
 * Per game the remedy flows ONLY to teams containing NO banned player — like
 * 1v1, a game the cheater lost produces no reversal (winners keep the win),
 * a cheater's teammate keeps their recorded result, and a fully-cheating team
 * (both banned) can never be buffed. For each eligible player it undoes
 * exactly what the 2v2 save recorded (ws Game.js userIncs):
 *   - draw     -> decrement team2v2_tied by 1
 *                 (2v2 draws recorded ONLY tied+1 — no loss, unlike 1v1);
 *   - decisive -> decrement team2v2_losses by 1 for finalRank 2 (the TEAM
 *                 result — only reachable when the banned side won).
 * Counters clamp at 0.
 *
 * Scope note: perm-banned only (banType 'permanent'). Live temp bans refund
 * only REPORTED games and 2v2 games can't be reported yet, so sweeping
 * temp-banned users' 2v2 games would exceed what the live path does. A ban
 * issued with skipEloRefund isn't distinguishable in ModerationLog, so a
 * skip-banned user's 2v2 games ARE voided here — same residual class the
 * duel backfill accepts, and it only ever ADDS counters back to victims.
 *
 * Idempotent + resumable: each game is atomically claimed via eloRefunded
 * (the same once-only gate the live path uses), so re-running never
 * double-decrements, and the live path skips anything claimed here.
 *
 * Run:  node scripts/backfillBanned2v2WinLoss.js [--dry-run]
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
  const permBannedIds = (await User.find({ banned: true, banType: 'permanent' })
    .select('_id').lean()).map(u => u._id.toString());

  const baseFilter = {
    gameType: '2v2',
    eloRefunded: { $ne: true },
    'players.accountId': { $in: permBannedIds },
    ...extraFilter,
  };

  // Cache banned-status lookups so we don't re-query the same account across games.
  const bannedSet = new Set(permBannedIds);
  const bannedCache = new Map();
  const isBanned = async (accountId) => {
    if (bannedSet.has(accountId)) return true;
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

  // Teams containing any banned player get no remedy (offender's team; also a
  // fully-cheating duo). Falls back to "everyone eligible" only if no banned
  // player carries a team stamp — 2v2 saves always stamp players[].team.
  const bannedTeamsOf = async (players) => {
    const teams = new Set();
    for (const p of players || []) {
      if (p.accountId && p.team && await isBanned(p.accountId)) teams.add(p.team);
    }
    return teams;
  };

  if (dryRun) {
    const games = await Game.countDocuments(baseFilter);
    let estLoss = 0;
    let estTie = 0;
    const cursor = Game.find(baseFilter).select('players.accountId players.team players.finalRank result.isDraw').lean().cursor();
    for (let g = await cursor.next(); g != null; g = await cursor.next()) {
      const isDraw = !!(g.result && g.result.isDraw);
      const bannedTeams = await bannedTeamsOf(g.players);
      for (const p of g.players || []) {
        if (!p.accountId) continue;
        if (await isBanned(p.accountId)) continue;
        if (bannedTeams.has(p.team)) continue;
        if (isDraw) estTie++;
        else if (p.finalRank === 2) estLoss++;
      }
    }
    return { dryRun: true, games, estLoss, estTie };
  }

  let gamesProcessed = 0;
  let lossesReversed = 0;
  let tiesReversed = 0;

  // Claim one unvoided game at a time; setting eloRefunded drops it from the
  // filter, so the loop drains the set and is safe to resume.
  let claimed;
  // eslint-disable-next-line no-cond-assign
  while ((claimed = await Game.findOneAndUpdate(
    baseFilter,
    { $set: { eloRefunded: true, eloRefundedAt: new Date(), winLossAdjusted: true } },
    { new: false, projection: { 'players.accountId': 1, 'players.team': 1, 'players.finalRank': 1, 'result.isDraw': 1 } },
  ))) {
    gamesProcessed++;
    const isDraw = !!(claimed.result && claimed.result.isDraw);
    const bannedTeams = await bannedTeamsOf(claimed.players);
    for (const p of claimed.players || []) {
      if (!p.accountId) continue; // guest, or self-deleted account (anonymized to null)
      if (await isBanned(p.accountId)) continue; // offender(s) / leaderboard-hidden account
      if (bannedTeams.has(p.team)) continue; // banned player's teammate — no remedy

      const setOps = {};
      if (isDraw) setOps.team2v2_tied = { $max: [0, { $subtract: ['$team2v2_tied', 1] }] };
      else if (p.finalRank === 2) setOps.team2v2_losses = { $max: [0, { $subtract: ['$team2v2_losses', 1] }] };
      else continue;

      try {
        const r = await User.updateOne({ _id: p.accountId }, [{ $set: setOps }]);
        if (r.modifiedCount) {
          if (isDraw) tiesReversed++;
          else lossesReversed++;
        }
      } catch (e) {
        console.error('  2v2 counter reversal failed for account', p.accountId, '-', e?.message || e);
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
    console.log(`[DRY RUN] ${r.games} banned-involved 2v2 game(s) to void; ~${r.estLoss} loss + ~${r.estTie} tie decrement(s). No writes made.`);
  } else {
    console.log(`\nDone. Voided ${r.gamesProcessed} 2v2 game(s); reversed ${r.lossesReversed} loss(es) + ${r.tiesReversed} tie(s).`);
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
