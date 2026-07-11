import User from '../models/User.js';
import Game from '../models/Game.js';
import UserStats from '../models/UserStats.js';
import { leagues } from '../components/utils/leagues.js';

/**
 * Shared ELO-refund helpers.
 *
 * Extracted from api/mod/takeAction.js so the same refund mechanics can be reused
 * off the moderation path — specifically by the account-deletion cascade
 * (serverUtils/purgeUserCascade.js), which refunds the *reported* games of a
 * self-deleting offender exactly like a temporary ban would.
 *
 * The ELO-refund math (who is refunded, capped at the league max, the
 * 'elo_refund' UserStats trail) is UNCHANGED from the original takeAction.js
 * implementation — do not alter refund selection here.
 *
 * What IS new (and shared by every refund path): when a ranked game is refunded,
 * the opponent's recorded duel WIN/LOSS counters for that game are reversed too,
 * so a banned / deleted cheater's games stop dragging down their victims' win
 * rate (win_rate = wins / (wins + losses + ties)). This is gated by
 * Game.winLossAdjusted (set atomically alongside eloRefunded) so the live path
 * and the one-off backfill (scripts/backfillRefundedDuelWinLoss.js) each touch a
 * game's win/loss exactly once.
 *
 * 2v2 games get the same win/loss remedy (team2v2_wins/losses/tied counters),
 * ahead of the mode going ranked. 2v2 records no ELO (players[].elo.change is
 * null) so the ELO block naturally no-ops — only the counters are reversed,
 * and ONLY for the opposing team (a cheater's teammate keeps their result,
 * which also prevents a co-cheating teammate from being buffed by the first
 * ban). The eloRefunded claim doubles as the "voided" stamp for these games.
 *
 *  - refundEloToOpponents:      perm-ban remedy — refunds ALL ranked_duel and
 *                               2v2 games.
 *  - refundEloForReportedGames: temp-ban remedy — refunds only the specific
 *                               reported games (2v2 included for when team-mode
 *                               reporting lands; reports can't target 2v2 yet).
 */

/**
 * Claim each game atomically, refund ELO lost to the offender, and reverse the
 * matching duel win/loss counters. Shared core of both public refund helpers —
 * the only thing that differs between them is which games they feed in.
 *
 * @param {string} bannedAccountId  Offender's MongoDB _id (string).
 * @param {string} bannedUsername   Offender's username (stored on the refund trail).
 * @param {Array}  gameMongoIds     Game _id list to refund (already filtered to ranked_duel + offender + not-yet-refunded).
 * @param {string|null} moderationLogId
 * @returns {Object} { totalRefunded, opponentsAffected, gamesProcessed, gamesMarkedRefunded, lossesReversed, tiesReversed, refundDetails }
 */
async function processRefundGames(bannedAccountId, bannedUsername, gameMongoIds, moderationLogId = null) {
  let totalRefunded = 0;
  let gamesProcessed = 0;
  let gamesMarkedRefunded = 0;
  const opponentRefunds = {};    // { accountId: totalRefundAmount }  — ELO to credit back
  const opponentLossAdjust = {}; // { accountId: duels_losses to reverse }
  const opponentTieAdjust = {};  // { accountId: duels_tied to reverse } — draws only
  const opponent2v2LossAdjust = {}; // { accountId: team2v2_losses to reverse }
  const opponent2v2TieAdjust = {};  // { accountId: team2v2_tied to reverse } — draws only

  // Process each game atomically - use findOneAndUpdate to claim the game.
  // Only succeeds if eloRefunded is still not true (prevents double refund /
  // race). winLossAdjusted is set in the same claim so the win/loss reversal is
  // bound to the same once-only gate.
  for (const gameMongoId of gameMongoIds) {
    const game = await Game.findOneAndUpdate(
      { _id: gameMongoId, eloRefunded: { $ne: true } },
      { eloRefunded: true, eloRefundedAt: new Date(), winLossAdjusted: true },
      { new: false }, // Return the original document before update
    );

    // If game is null, another request already claimed it - skip
    if (!game) continue;

    gamesMarkedRefunded++;

    const isDraw = !!(game.result && game.result.isDraw);

    // 2v2: the remedy flows ONLY to the opposing team — like 1v1, a game the
    // cheater LOST produces no reversal (the winners keep their win), and the
    // banned player's teammate keeps their recorded result. That teammate rule
    // is load-bearing: if BOTH teammates were cheating, it (plus the
    // eloRefunded claim above) guarantees neither ban ever buffs the other
    // cheater's counters, in either ban order. 2v2 saves always stamp
    // players[].team ('a'/'b').
    const bannedTeam = game.gameType === '2v2'
      ? (game.players.find(p => p.accountId === bannedAccountId)?.team ?? null)
      : null;

    for (const player of game.players) {
      // Skip the banned user (offender) and guests (no accountId)
      if (player.accountId === bannedAccountId) continue;
      if (!player.accountId) continue;

      const change = player.elo && typeof player.elo.change === 'number' ? player.elo.change : null;

      // ELO refund — UNCHANGED selection/math: only players who actually LOST ELO.
      if (change !== null && change < 0) {
        const refundAmount = Math.abs(change);
        opponentRefunds[player.accountId] = (opponentRefunds[player.accountId] || 0) + refundAmount;
        totalRefunded += refundAmount;
        gamesProcessed++;
      }

      // Win/loss reversal — undo exactly what setElo recorded at game end. setElo
      // counts a LOSS by the win/loss RESULT, not the ELO sign: the decisive-game
      // loser (finalRank 2) always got duels_losses+1 even when their ELO change
      // rounded to 0 — a heavy underdog losing to a far-higher-rated cheater loses
      // ~0 ELO. So reverse the loss by finalRank, NOT by change<0, or the exact
      // high-rated-cheater-vs-low-rated-victim case this feature targets is missed.
      // A draw recorded loss+1 AND tie+1 for BOTH players (winner flag false).
      //
      // 2v2 counter semantics differ from 1v1: a draw recorded ONLY
      // team2v2_tied+1 (no loss), and finalRank is the TEAM result. Only the
      // OPPOSING team is compensated (see bannedTeam above) — so a decisive
      // reversal can only occur when the banned side won: the opposing losers
      // (finalRank 2) are the victims.
      if (game.gameType === '2v2') {
        if (player.team !== bannedTeam) {
          if (isDraw) {
            opponent2v2TieAdjust[player.accountId] = (opponent2v2TieAdjust[player.accountId] || 0) + 1;
          } else if (player.finalRank === 2) {
            opponent2v2LossAdjust[player.accountId] = (opponent2v2LossAdjust[player.accountId] || 0) + 1;
          }
        }
      } else if (isDraw) {
        opponentLossAdjust[player.accountId] = (opponentLossAdjust[player.accountId] || 0) + 1;
        opponentTieAdjust[player.accountId] = (opponentTieAdjust[player.accountId] || 0) + 1;
      } else if (player.finalRank === 2) {
        opponentLossAdjust[player.accountId] = (opponentLossAdjust[player.accountId] || 0) + 1;
      }
    }
  }

  // Get MAX_ELO from leagues
  const MAX_ELO = leagues.nomad.max;

  // Apply ELO refunds + win/loss reversals to every affected opponent — the union
  // of those owed ELO and those whose duel counters need fixing (a draw's
  // lower-rated victim needs a counter fix but gained ELO so gets no refund).
  const affectedOpponents = new Set([
    ...Object.keys(opponentRefunds),
    ...Object.keys(opponentLossAdjust),
    ...Object.keys(opponentTieAdjust),
    ...Object.keys(opponent2v2LossAdjust),
    ...Object.keys(opponent2v2TieAdjust),
  ]);

  const applyPromises = [];
  for (const opponentAccountId of affectedOpponents) {
    applyPromises.push((async () => {
      const refundAmount = opponentRefunds[opponentAccountId] || 0;

      // --- ELO refund: atomic add, capped at MAX_ELO (the SAME cap as the original
      //     Math.min — unchanged). The atomic $add only changes how the write is
      //     applied: two refund passes on the SAME opponent (a mod ban racing the
      //     cron grace-purge — both now reachable) compose instead of lost-updating.
      //     Identical to the original read-then-$set in the non-concurrent case.
      //     Only opponents who actually lost ELO. ---
      if (refundAmount > 0) {
        const before = await User.findById(opponentAccountId).select('elo').lean();
        if (before) {
          const updatedUser = await User.findByIdAndUpdate(
            opponentAccountId,
            [{ $set: { elo: { $min: [MAX_ELO, { $add: [{ $ifNull: ['$elo', 0] }, refundAmount] }] } } }],
            { new: true },
          );

          if (updatedUser) {
            const actualRefund = (updatedUser.elo || 0) - (before.elo || 0);

            // Get current ELO rank (excluding banned users)
            const higherEloCount = await User.countDocuments({
              elo: { $gt: updatedUser.elo },
              banned: { $ne: true },
            });
            const newEloRank = higherEloCount + 1;

            // Get most recent xpRank from UserStats for this user
            const mostRecentStats = await UserStats.findOne({ userId: opponentAccountId })
              .sort({ timestamp: -1 })
              .select('xpRank')
              .lean();
            const xpRank = mostRecentStats?.xpRank || 1;

            // Create UserStats entry to record the ELO refund
            await UserStats.create({
              userId: opponentAccountId,
              timestamp: new Date(),
              totalXp: updatedUser.totalXp || 0,
              xpRank: xpRank,
              elo: updatedUser.elo,
              eloRank: newEloRank,
              triggerEvent: 'elo_refund',
              gameId: null,
              eloRefundDetails: {
                amount: actualRefund,
                bannedUserId: bannedAccountId,
                bannedUsername: bannedUsername,
                moderationLogId: moderationLogId ? moderationLogId.toString() : null,
              },
            });
          }
        }
      }

      // --- Win/loss reversal (new): undo the voided game's recorded duel
      //     counters via an atomic $max/$subtract (race-safe; clamped at 0).
      //     Best-effort so a counter hiccup on one opponent can never reject the
      //     whole batch (and drop other refunds). Durability note: like the ELO
      //     refund above, this is at-most-once — a transient write failure here
      //     loses that single game's counter reversal (winLossAdjusted is already
      //     stamped on the game), exactly as a transient ELO failure loses that
      //     refund. The off-by-one is cosmetic (win_rate only); a future hardening
      //     could defer the winLossAdjusted stamp until the reversal confirms. ---
      const lossDec = opponentLossAdjust[opponentAccountId] || 0;
      const tieDec = opponentTieAdjust[opponentAccountId] || 0;
      const loss2v2Dec = opponent2v2LossAdjust[opponentAccountId] || 0;
      const tie2v2Dec = opponent2v2TieAdjust[opponentAccountId] || 0;
      if (lossDec > 0 || tieDec > 0 || loss2v2Dec > 0 || tie2v2Dec > 0) {
        const setOps = {};
        if (lossDec > 0) setOps.duels_losses = { $max: [0, { $subtract: ['$duels_losses', lossDec] }] };
        if (tieDec > 0) setOps.duels_tied = { $max: [0, { $subtract: ['$duels_tied', tieDec] }] };
        if (loss2v2Dec > 0) setOps.team2v2_losses = { $max: [0, { $subtract: ['$team2v2_losses', loss2v2Dec] }] };
        if (tie2v2Dec > 0) setOps.team2v2_tied = { $max: [0, { $subtract: ['$team2v2_tied', tie2v2Dec] }] };
        try {
          await User.updateOne({ _id: opponentAccountId }, [{ $set: setOps }]);
        } catch (e) {
          console.error('[eloRefunds] win/loss reversal failed (non-critical) for', opponentAccountId, '-', e?.message || e);
        }
      }
    })());
  }

  await Promise.all(applyPromises);

  return {
    totalRefunded,
    opponentsAffected: Object.keys(opponentRefunds).length,
    gamesProcessed,
    gamesMarkedRefunded,
    lossesReversed: Object.values(opponentLossAdjust).reduce((a, b) => a + b, 0),
    tiesReversed: Object.values(opponentTieAdjust).reduce((a, b) => a + b, 0),
    team2v2LossesReversed: Object.values(opponent2v2LossAdjust).reduce((a, b) => a + b, 0),
    team2v2TiesReversed: Object.values(opponent2v2TieAdjust).reduce((a, b) => a + b, 0),
    refundDetails: opponentRefunds, // { accountId: refundAmount }
  };
}

/**
 * Refund ELO to opponents who lost ELO playing against a banned user (perm ban).
 * Refunds ALL ranked_duel and 2v2 games the banned user participated in
 * (2v2 = win/loss counter reversal only; no ELO is recorded there).
 *
 * @param {string} bannedUserId - The MongoDB _id of the banned user
 * @param {string} bannedUsername - The username of the banned user
 * @param {string} moderationLogId - The ID of the moderation log entry (optional)
 * @returns {Object} Summary of refunds
 */
export async function refundEloToOpponents(bannedUserId, bannedUsername, moderationLogId = null) {
  const bannedAccountId = bannedUserId.toString();

  // Find all ranked_duel and 2v2 games where the banned user participated and
  // that haven't been refunded yet.
  const gameMongoIds = await Game.find({
    gameType: { $in: ['ranked_duel', '2v2'] },
    'players.accountId': bannedAccountId,
    eloRefunded: { $ne: true },
  }).distinct('_id');

  return processRefundGames(bannedAccountId, bannedUsername, gameMongoIds, moderationLogId);
}

/**
 * Refund ELO to opponents only for specific games linked to reports (temp ban /
 * self-deletion). Refunds only the reported games (ranked duels + 2v2).
 *
 * @param {string} bannedUserId - The MongoDB _id of the banned user
 * @param {string} bannedUsername - The username of the banned user
 * @param {string[]} reportedGameIds - Array of game IDs (string codes) from reports
 * @param {string} moderationLogId - The ID of the moderation log entry (optional)
 * @returns {Object} Summary of refunds
 */
export async function refundEloForReportedGames(bannedUserId, bannedUsername, reportedGameIds, moderationLogId = null) {
  if (!reportedGameIds || reportedGameIds.length === 0) {
    return { totalRefunded: 0, opponentsAffected: 0, gamesProcessed: 0, gamesMarkedRefunded: 0, lossesReversed: 0, tiesReversed: 0, refundDetails: {} };
  }

  const bannedAccountId = bannedUserId.toString();

  // Find only the specific reported games that haven't been refunded.
  // Reports store gameId as the string game code, which maps to Game.gameId.
  // 2v2 is included ahead of team-mode reporting existing — today no report
  // can carry a 2v2 game code, so this only matters once that lands.
  const gameMongoIds = await Game.find({
    gameId: { $in: reportedGameIds },
    gameType: { $in: ['ranked_duel', '2v2'] },
    'players.accountId': bannedAccountId,
    eloRefunded: { $ne: true },
  }).distinct('_id');

  return processRefundGames(bannedAccountId, bannedUsername, gameMongoIds, moderationLogId);
}
