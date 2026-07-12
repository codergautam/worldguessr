#!/usr/bin/env node
/**
 * Repair: restore duel losses/ties that backfill v1 WRONGLY erased from
 * offenders' own counters.
 *
 * Backfill v1 (scripts/backfillRefundedDuelWinLoss.js before the v2 rewrite)
 * had no per-game offender id and skipped "currently banned" users as a proxy.
 * Any offender who was unbanned (or whose temp ban expired) before the v1 run
 * was therefore treated as a victim OF THEIR OWN BAN WAVE: v1 reversed their
 * legitimate losses against clean opponents, inflating their win rate.
 * (First confirmed case: a player banned + unbanned on 2026-06-26 whose 46
 * erased losses turned a 75.6% win rate into 92.3%.)
 *
 * ── How a wave and its offender are identified ─────────────────────────────
 * Refund waves are triggered by moderation events (ban_permanent,
 * ban_temporary, user_deleted) recorded in the permanent moderationlogs audit.
 * A game belongs to the wave of moderation event E iff E's target is a player
 * in the game and |game.eloRefundedAt - E.createdAt| <= 1h.
 *
 * Old-code waves (the ones v1 had to clean up) are recognizable by their
 * modlog: the reconciling live path always records eloRefund.gamesMarkedRefunded,
 * old code never did. Only games stamped by v1 (winLossAdjustedBy null — both
 * 'live' and 'backfill_v2' record their authorship) are considered.
 *
 * ── How "did v1 actually damage this offender?" is decided ─────────────────
 * v1 damaged an offender iff they were NOT banned at v1's run time — which no
 * one recorded. Instead of guessing, each candidate is hypothesis-tested
 * against their ledger. With
 *   stored      = current duels_losses counter
 *   docL        = decisive losses + draws across ALL their documented duels
 *   victimsV1   = their loss-reversals as a genuine victim in v1-stamped games
 *                 (v1 reversed those only if it also damaged them — same run,
 *                 same banned-check)
 *   victimsLive = their loss-reversals in live-stamped games (always applied)
 *   damage      = their own-wave losses v1 would have erased
 * the pre-persistence ghost-game count implied by each hypothesis is
 *   ghostIfDamaged   = stored - docL + victimsV1 + victimsLive + damage
 *   ghostIfUndamaged = stored - docL + victimsLive
 * Ghost games (played before game persistence shipped on 2025-07-29) can only
 * be >= 0, and must be == 0 for accounts created after that date. An offender
 * is auto-repaired only when the damaged hypothesis is the ONLY arithmetically
 * possible one (and the tie ledger agrees); everything else is reported for
 * manual review, never written.
 *
 * Idempotent: each processed wave's modlog is stamped with
 * eloRefund.offenderRepair BEFORE the counter restore, and stamped logs are
 * excluded from later runs.
 *
 * Run:  node scripts/repairOffenderWinLoss.js                    (dry-run, all)
 *       node scripts/repairOffenderWinLoss.js --apply            (write confirmed repairs)
 *       node scripts/repairOffenderWinLoss.js --account <name>   (scope to one username)
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { pathToFileURL } from 'url';
import Game from '../models/Game.js';
import User from '../models/User.js';
import ModerationLog from '../models/ModerationLog.js';

const WAVE_WINDOW_MS = 60 * 60 * 1000;
const PERSISTENCE_SHIPPED = new Date('2025-07-29T00:00:00Z'); // duel game docs exist only after this

export async function run({ apply = false, account = null } = {}) {
  // 1) Old-code refund waves, not yet repaired. gamesMarkedRefunded is written
  //    by every reconciling-code refund (even as 0); its absence marks old code.
  const waveFilter = {
    actionType: { $in: ['ban_permanent', 'ban_temporary', 'user_deleted'] },
    'eloRefund.gamesProcessed': { $exists: true },
    'eloRefund.gamesMarkedRefunded': { $exists: false },
    'eloRefund.offenderRepair': { $exists: false },
  };
  const waves = await ModerationLog.find(waveFilter)
    .select('targetUser actionType createdAt eloRefund.totalRefunded')
    .lean();

  // 2) All v1-stamped reconciled duels, loaded once. 'live'/'backfill_v2'
  //    stamps record their author; v1-era stamps are null/missing.
  const adjusted = await Game.find({
    gameType: 'ranked_duel',
    eloRefunded: true,
    winLossAdjusted: true,
    $or: [{ winLossAdjustedBy: null }, { winLossAdjustedBy: { $exists: false } }],
  }).select('players.accountId players.finalRank result.isDraw eloRefundedAt').lean();

  const liveAdjusted = await Game.find({
    gameType: 'ranked_duel',
    eloRefunded: true,
    winLossAdjusted: true,
    winLossAdjustedBy: 'live',
  }).select('players.accountId players.finalRank result.isDraw').lean();

  console.log(`  candidate old-code waves: ${waves.length}; v1-stamped games: ${adjusted.length}; live-stamped games: ${liveAdjusted.length}`);

  // Index v1-stamped games by player for wave matching and victim tallies.
  const byPlayer = new Map(); // accountId -> games[]
  for (const g of adjusted) {
    for (const p of g.players || []) {
      if (!p.accountId) continue;
      if (!byPlayer.has(p.accountId)) byPlayer.set(p.accountId, []);
      byPlayer.get(p.accountId).push(g);
    }
  }

  // 3) Group waves by offender; collect own-wave damage per offender.
  const offenders = new Map(); // accountId -> { username, waveLogs:[], gameIds:Set, damageLoss, damageTie }
  for (const w of waves) {
    const oid = w.targetUser && w.targetUser.accountId;
    if (!oid) continue;
    // NB: --account scoping happens against the CURRENT user doc in step 4 —
    // wave usernames are point-in-time snapshots and miss renames.
    let e = offenders.get(oid);
    if (!e) { e = { username: w.targetUser.username, waveLogs: [], gameIds: new Set(), damageLoss: 0, damageTie: 0 }; offenders.set(oid, e); }
    e.waveLogs.push(w);

    const waveMs = new Date(w.createdAt).getTime();
    for (const g of byPlayer.get(oid) || []) {
      if (!g.eloRefundedAt) continue;
      if (Math.abs(new Date(g.eloRefundedAt).getTime() - waveMs) > WAVE_WINDOW_MS) continue;
      const key = String(g._id);
      if (e.gameIds.has(key)) continue; // one wave per game
      e.gameIds.add(key);
      const me = (g.players || []).find((p) => p.accountId === oid);
      if (!me) continue;
      const isDraw = !!(g.result && g.result.isDraw);
      if (isDraw) { e.damageLoss += 1; e.damageTie += 1; }
      else if (me.finalRank === 2) e.damageLoss += 1;
    }
  }

  // 4) Hypothesis-test each offender with damage > 0.
  const confirmed = [];
  const undamaged = [];
  const ambiguous = [];
  for (const [oid, e] of offenders) {
    if (e.damageLoss === 0 && e.damageTie === 0) continue;

    const user = await User.findById(oid).select('username banned created_at duels_losses duels_tied').lean();
    if (!user) { ambiguous.push({ ...e, accountId: oid, reason: 'account no longer exists' }); continue; }
    if (account && user.username.toLowerCase() !== account.toLowerCase()) continue;

    // Full documented duel ledger for this account.
    const docs = await Game.aggregate([
      { $match: { gameType: 'ranked_duel', 'players.accountId': oid } },
      { $unwind: '$players' },
      { $match: { 'players.accountId': oid } },
      { $group: {
        _id: null,
        losses: { $sum: { $cond: [{ $and: [{ $ne: ['$result.isDraw', true] }, { $eq: ['$players.finalRank', 2] }] }, 1, 0] } },
        draws: { $sum: { $cond: [{ $eq: ['$result.isDraw', true] }, 1, 0] } },
      } },
    ]);
    const docL = (docs[0]?.losses || 0) + (docs[0]?.draws || 0); // draws recorded a loss too (setElo)
    const docDraws = docs[0]?.draws || 0;

    // Victim reversals: their rank-2/draw slots in reconciled games OUTSIDE their own waves.
    const tally = (games) => {
      let loss = 0, tie = 0;
      for (const g of games) {
        if (e.gameIds.has(String(g._id))) continue; // own wave -> that's the damage term
        const me = (g.players || []).find((p) => p.accountId === oid);
        if (!me) continue;
        const isDraw = !!(g.result && g.result.isDraw);
        if (isDraw) { loss += 1; tie += 1; }
        else if (me.finalRank === 2) loss += 1;
      }
      return { loss, tie };
    };
    const victimsV1 = tally(byPlayer.get(oid) || []);
    const victimsLive = tally(liveAdjusted.filter((g) => (g.players || []).some((p) => p.accountId === oid)));

    const stored = user.duels_losses || 0;
    const storedTies = user.duels_tied || 0;
    const prePersistence = user.created_at ? new Date(user.created_at) < PERSISTENCE_SHIPPED : true;

    const ghostIfDamaged = stored - docL + victimsV1.loss + victimsLive.loss + e.damageLoss;
    const ghostIfUndamaged = stored - docL + victimsLive.loss;
    const tieGhostIfDamaged = storedTies - docDraws + victimsV1.tie + victimsLive.tie + e.damageTie;

    const okDamaged = prePersistence ? ghostIfDamaged >= 0 : ghostIfDamaged === 0;
    const okUndamaged = prePersistence ? ghostIfUndamaged >= 0 : ghostIfUndamaged === 0;
    const okTies = e.damageTie === 0 || (prePersistence ? tieGhostIfDamaged >= 0 : tieGhostIfDamaged === 0);

    const row = {
      accountId: oid, username: user.username, bannedNow: !!user.banned, prePersistence,
      damageLoss: e.damageLoss, damageTie: e.damageTie, wavesMatched: e.waveLogs.length,
      stored, docL, victimsV1: victimsV1.loss, victimsLive: victimsLive.loss,
      ghostIfDamaged, ghostIfUndamaged, waveLogs: e.waveLogs,
    };
    if (okDamaged && !okUndamaged && okTies) confirmed.push(row);
    else if (okUndamaged && !okDamaged) undamaged.push(row);
    else ambiguous.push(row);
  }

  // 5) Report, then apply confirmed repairs (stamp the wave logs first — the
  //    idempotency claim — then restore the counters).
  const fmt = (r) => `    ${r.username}${r.bannedNow ? ' [banned]' : ''}: +${r.damageLoss} loss / +${r.damageTie} tie ` +
    `(stored ${r.stored}, documented ${r.docL}, victimV1 ${r.victimsV1}, victimLive ${r.victimsLive}, ` +
    `ghosts if-damaged/if-not: ${r.ghostIfDamaged}/${r.ghostIfUndamaged}${r.prePersistence ? ', pre-persistence acct' : ''})`;

  console.log(`\nCONFIRMED damaged (${confirmed.length}) — ${apply ? 'repairing' : 'would repair'}:`);
  confirmed.forEach((r) => console.log(fmt(r)));
  console.log(`\nNOT damaged (${undamaged.length}) — v1 skipped them (banned at run time), no action:`);
  undamaged.forEach((r) => console.log(fmt(r)));
  console.log(`\nAMBIGUOUS (${ambiguous.length}) — NOT touched, review manually:`);
  ambiguous.forEach((r) => console.log(r.reason ? `    ${r.username || r.accountId}: ${r.reason}` : fmt(r)));

  if (apply) {
    for (const r of confirmed) {
      const claimed = await ModerationLog.updateMany(
        { _id: { $in: r.waveLogs.map((w) => w._id) }, 'eloRefund.offenderRepair': { $exists: false } },
        { $set: { 'eloRefund.offenderRepair': {
          restoredLosses: r.damageLoss, restoredTies: r.damageTie,
          at: new Date(), by: 'repairOffenderWinLoss',
        } } },
      );
      if (claimed.modifiedCount === 0) { console.warn(`  ${r.username}: waves already claimed by another run — skipping restore`); continue; }
      const inc = { duels_losses: r.damageLoss };
      if (r.damageTie) inc.duels_tied = r.damageTie;
      await User.updateOne({ _id: r.accountId }, { $inc: inc });
      console.log(`  restored ${r.username}: +${r.damageLoss} losses${r.damageTie ? `, +${r.damageTie} ties` : ''}`);
    }
  }

  return { confirmed, undamaged, ambiguous, applied: apply };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const ai = process.argv.indexOf('--account');
  const account = ai !== -1 ? process.argv[ai + 1] : null;
  const mongoUri = process.env.MONGODB;
  if (!mongoUri) {
    console.error('MONGODB env variable not set');
    process.exit(1);
  }
  console.log(`Connecting to MongoDB...${apply ? ' (APPLY MODE)' : ' (dry run — no writes)'}${account ? ` scoped to ${account}` : ''}`);
  await mongoose.connect(mongoUri);
  console.log('Connected!\n');
  await run({ apply, account });
  await mongoose.disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
}
