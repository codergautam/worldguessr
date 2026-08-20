import User from '../../models/User.js';
import Game from '../../models/Game.js';
import Report from '../../models/Report.js';
import ModerationLog from '../../models/ModerationLog.js';
import DailyChallengeScore from '../../models/DailyChallengeScore.js';
import DailyLeaderboard from '../../models/DailyLeaderboard.js';
import { syncedClearCache } from '../../serverUtils/cacheBus.js';
import { invalidateDailyPublicCache } from '../dailyChallenge/results.js';
import { addBannedIdentity } from '../../serverUtils/bannedIdentities.js';
import { refundEloToOpponentsSince } from '../../serverUtils/eloRefunds.js';
import {
  TEMP_BAN_DAYS,
  TEMP_BAN_DURATION_MS,
  WORKFLOW_NAME,
  getEffectiveBanStatus,
  checkRepeatOffender,
  shouldSkipSuspect,
  buildTempBanReason,
  buildPermBanReason
} from '../../serverUtils/autoBanLogic.js';

/**
 * Remove a user from every daily leaderboard surface (same as takeAction.js).
 */
async function scrubFromDailyLeaderboards(targetUserId) {
  const userIdStr = targetUserId.toString();

  const affectedDates = await DailyChallengeScore.find({
    userId: targetUserId,
    hidden: { $ne: true },
    disqualified: { $ne: true }
  }).distinct('date');

  const [dcResult, dlResult] = await Promise.all([
    DailyChallengeScore.updateMany(
      { userId: targetUserId, hidden: { $ne: true } },
      { $set: { hidden: true } }
    ),
    DailyLeaderboard.updateMany(
      { 'leaderboard.userId': userIdStr },
      { $pull: { leaderboard: { userId: userIdStr } } }
    )
  ]);

  for (const date of affectedDates) {
    try {
      invalidateDailyPublicCache(date);
    } catch (e) {
      // invalidateDailyPublicCache may not be available in test env; non-critical
      console.warn('[autoBanCheaters] invalidateDailyPublicCache failed:', e?.message || e);
    }
  }

  return {
    dailyChallengeScoresHidden: dcResult.modifiedCount,
    dailyLeaderboardsScrubbed: dlResult.modifiedCount
  };
}

async function enforceBanViaWs(targetUserId) {
  if (!process.env.MAINTENANCE_SECRET) return;
  try {
    const wsPort = process.env.WS_PORT || 3002;
    const wsUrl = `http://localhost:${wsPort}/enforce-ban/${process.env.MAINTENANCE_SECRET}/${targetUserId}`;
    const wsResponse = await fetch(wsUrl, { method: 'GET' });
    const wsResult = await wsResponse.json();
    console.log('[autoBanCheaters] WebSocket ban enforcement result:', wsResult);
  } catch (error) {
    console.error('[autoBanCheaters] Failed to enforce ban via WebSocket (non-critical):', error.message);
  }
}

/**
 * Compute suspects using the exact same aggregation as suspicious5k.js
 * Returns enriched suspects array (without ban/report enrichment needed for ban logic)
 */
async function findSuspects({ days, minPoints, minRounds, limit }) {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);

  const results = await Game.aggregate([
    {
      $match: {
        gameType: 'ranked_duel',
        endedAt: { $gte: sinceDate }
      }
    },
    { $unwind: '$rounds' },
    { $unwind: '$rounds.playerGuesses' },
    {
      $match: {
        'rounds.playerGuesses.accountId': { $ne: null }
      }
    },
    {
      $facet: {
        highScores: [
          { $match: { 'rounds.playerGuesses.points': { $gte: minPoints } } },
          {
            $group: {
              _id: '$rounds.playerGuesses.accountId',
              username: { $last: '$rounds.playerGuesses.username' },
              highRounds: { $sum: 1 },
              avgPoints: { $avg: '$rounds.playerGuesses.points' },
              games: { $addToSet: '$gameId' },
              lastSeen: { $max: '$endedAt' },
              // Also track earliest suspicious game after a given date if needed,
              // but we keep lastSeen for repeat-offender check
              firstHighScoreAt: { $min: '$endedAt' }
            }
          },
          { $addFields: { gameCount: { $size: '$games' } } },
          { $match: { highRounds: { $gte: minRounds } } }
        ],
        totalRounds: [
          {
            $group: {
              _id: '$rounds.playerGuesses.accountId',
              totalRounds: { $sum: 1 },
              totalAvgPoints: { $avg: '$rounds.playerGuesses.points' }
            }
          }
        ]
      }
    }
  ]);

  const { highScores, totalRounds } = results[0];

  const totalRoundsMap = {};
  totalRounds.forEach(r => {
    totalRoundsMap[r._id] = { totalRounds: r.totalRounds, totalAvgPoints: r.totalAvgPoints };
  });

  const suspects = highScores.map(s => ({
    accountId: s._id,
    username: s.username,
    highRounds: s.highRounds,
    totalRounds: totalRoundsMap[s._id]?.totalRounds || s.highRounds,
    highRoundPct: Math.round((s.highRounds / (totalRoundsMap[s._id]?.totalRounds || s.highRounds)) * 100),
    avgPointsHigh: Math.round(s.avgPoints),
    avgPointsAll: Math.round(totalRoundsMap[s._id]?.totalAvgPoints || 0),
    gameCount: s.gameCount,
    lastSeen: s.lastSeen,
    firstHighScoreAt: s.firstHighScoreAt,
    games: s.games
  }));

  suspects.sort((a, b) => b.highRounds - a.highRounds);

  return suspects.slice(0, limit);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { secret, days = 30, minPoints = 4950, minRounds = 10, limit = 100 } = req.body || {};

  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid secret' });
  }

  try {
    const requestingUser = await User.findOne({ secret });
    if (!requestingUser || !requestingUser.staff) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const moderator = requestingUser;

    const suspects = await findSuspects({ days, minPoints, minRounds, limit });

    if (suspects.length === 0) {
      return res.status(200).json({
        message: 'No suspects found',
        tempBans: [],
        permanentBans: [],
        skipped: [],
        totalProcessed: 0,
        filters: { days, minPoints, minRounds }
      });
    }

    const accountIds = suspects.map(s => s.accountId);
    const users = await User.find(
      { _id: { $in: accountIds } },
      { _id: 1, username: 1, banned: 1, banType: 1, banExpiresAt: 1, elo: 1, secret: 1, email: 1, appleId: 1, crazyGamesId: 1, staff: 1 }
    ).lean();

    const userMap = {};
    users.forEach(u => { userMap[u._id.toString()] = u; });

    const tempBans = [];
    const permanentBans = [];
    const skipped = [];

    const now = new Date();

    for (const suspect of suspects) {
      const accountId = suspect.accountId.toString();
      const user = userMap[accountId];

      // Check previous autoBan perm bans early for shouldSkipSuspect
      let previousAutoPermBans = [];
      let previousAutoTempBans = [];

      // Determine effective banned status (handle expired temp bans)
      const effectiveBanStatus = getEffectiveBanStatus(user, now);
      if (effectiveBanStatus.expired) {
        try {
          await User.findByIdAndUpdate(accountId, {
            banned: false,
            banType: 'none',
            banExpiresAt: null
          });
        } catch (e) {
          console.warn('[autoBanCheaters] failed to auto-clear expired ban for', accountId, e?.message);
        }
      }

      // We need perm count before shouldSkip; query optimistically if user exists
      if (user) {
        previousAutoPermBans = await ModerationLog.find({
          'targetUser.accountId': accountId,
          actionType: 'ban_permanent',
          isAutoBan: true,
          autoBanWorkflow: WORKFLOW_NAME
        }).lean();
      }

      const skipCheck = shouldSkipSuspect(user, effectiveBanStatus, previousAutoPermBans.length);
      if (skipCheck.skip) {
        skipped.push({ accountId, username: user?.username || suspect.username, reason: skipCheck.reason });
        continue;
      }

      // Check previous autoBan temp bans for this user
      previousAutoTempBans = await ModerationLog.find({
        'targetUser.accountId': accountId,
        actionType: 'ban_temporary',
        isAutoBan: true,
        autoBanWorkflow: WORKFLOW_NAME
      }).sort({ createdAt: -1 }).lean();

      if (previousAutoTempBans.length === 0) {
        // FIRST OFFENSE - 14 day temp ban
        const expiresAt = new Date(Date.now() + TEMP_BAN_DURATION_MS);
        const internalReason = buildTempBanReason(suspect, { days, minPoints, minRounds });
        const publicNote = 'Using external help is not allowed, if you think the ban was unfair join the discord server and appeal the ban.';

        // Update user
        await User.findByIdAndUpdate(accountId, {
          banned: true,
          banType: 'temporary',
          banExpiresAt: expiresAt,
          banReason: internalReason,
          banPublicNote: publicNote
        });

        await enforceBanViaWs(accountId);
        try { syncedClearCache(`userAuth_${user.secret}`); } catch (e) { console.warn('[autoBanCheaters] cache clear failed', e?.message); }

        let leaderboardScrubResult = null;
        try {
          leaderboardScrubResult = await scrubFromDailyLeaderboards(accountId);
        } catch (e) {
          console.error('[autoBanCheaters] leaderboard scrub failed for temp ban', accountId, e?.message);
        }

        const moderationLog = await ModerationLog.create({
          targetUser: {
            accountId: accountId,
            username: user.username
          },
          moderator: {
            accountId: moderator._id.toString(),
            username: moderator.username
          },
          actionType: 'ban_temporary',
          duration: TEMP_BAN_DURATION_MS,
          durationString: `${TEMP_BAN_DAYS} days`,
          expiresAt: expiresAt,
          reason: internalReason,
          notes: publicNote,
          isAutoBan: true,
          autoBanWorkflow: WORKFLOW_NAME,
          autoBanOffenseCount: 1,
          autoBanPreviousBanExpiresAt: null,
          suspiciousGames: (suspect.games || []).slice(0, 20).map(gid => ({ gameId: gid, opponentUsername: null, opponentAccountId: null }))
        });

        tempBans.push({
          accountId,
          username: user.username,
          expiresAt,
          highRounds: suspect.highRounds,
          avgPointsHigh: suspect.avgPointsHigh,
          gameCount: suspect.gameCount,
          moderationLogId: moderationLog._id,
          leaderboardScrub: leaderboardScrubResult
        });

      } else {
        // Has previous temp ban(s) - check if repeat offender via helper
        let repeatCheck = checkRepeatOffender(previousAutoTempBans, now, suspect.lastSeen);

        // If helper says no game after expiry based on lastSeen, double-check via DB query for precision
        if (!repeatCheck.isRepeat && repeatCheck.reason && repeatCheck.reason.startsWith('No cheating game after')) {
          const prevExpiresAt = repeatCheck.previousTempBan?.expiresAt ? new Date(repeatCheck.previousTempBan.expiresAt) : null;
          if (prevExpiresAt) {
            const gameAfter = await Game.findOne({
              gameType: 'ranked_duel',
              'players.accountId': accountId,
              endedAt: { $gt: prevExpiresAt }
            }).lean();
            if (gameAfter) {
              repeatCheck = { isRepeat: true, reason: null, previousTempBan: repeatCheck.previousTempBan, refundSince: prevExpiresAt };
            }
          }
        }

        if (!repeatCheck.isRepeat) {
          skipped.push({ accountId, username: user.username, reason: repeatCheck.reason });
          continue;
        }

        const prevExpiresAt = repeatCheck.previousTempBan.expiresAt ? new Date(repeatCheck.previousTempBan.expiresAt) : new Date(repeatCheck.refundSince);
        const refundSince = repeatCheck.refundSince;

        // REPEAT OFFENDER - permanent ban
        const internalReason = buildPermBanReason(suspect, { days, minPoints, minRounds }, prevExpiresAt);
        const publicNote = 'Using external help is not allowed, if you think the ban was unfair join the discord server and appeal the ban. (Repeat offense - permanent ban)';

        await User.findByIdAndUpdate(accountId, {
          banned: true,
          banType: 'permanent',
          banExpiresAt: null,
          banReason: internalReason,
          banPublicNote: publicNote
        });

        // Blocklist identity
        try {
          await addBannedIdentity({
            user: user,
            type: 'ban_permanent',
            reason: internalReason,
            publicNote: publicNote,
            moderator,
          });
        } catch (e) {
          console.warn('[autoBanCheaters] addBannedIdentity failed', e?.message);
        }

        await enforceBanViaWs(accountId);
        try { syncedClearCache(`userAuth_${user.secret}`); } catch (e) { console.warn('[autoBanCheaters] cache clear failed', e?.message); }

        let leaderboardScrubResult = null;
        try {
          leaderboardScrubResult = await scrubFromDailyLeaderboards(accountId);
        } catch (e) {
          console.error('[autoBanCheaters] leaderboard scrub failed for perm ban', accountId, e?.message);
        }

        // ELO refund for opponents who lost after temp ban expiry
        let eloRefundResult = null;
        try {
          eloRefundResult = await refundEloToOpponentsSince(accountId, user.username, refundSince);
        } catch (e) {
          console.error('[autoBanCheaters] elo refund failed for', accountId, e?.message, e?.stack);
          eloRefundResult = { totalRefunded: 0, opponentsAffected: 0, gamesProcessed: 0, error: e?.message };
        }

        const moderationLog = await ModerationLog.create({
          targetUser: {
            accountId: accountId,
            username: user.username
          },
          moderator: {
            accountId: moderator._id.toString(),
            username: moderator.username
          },
          actionType: 'ban_permanent',
          reason: internalReason,
          notes: publicNote,
          eloRefund: eloRefundResult || { totalRefunded: 0, opponentsAffected: 0, gamesProcessed: 0 },
          isAutoBan: true,
          autoBanWorkflow: WORKFLOW_NAME,
          autoBanOffenseCount: 2,
          autoBanPreviousBanExpiresAt: prevExpiresAt,
          autoBanRefundSince: refundSince,
          suspiciousGames: (suspect.games || []).slice(0, 20).map(gid => ({ gameId: gid, opponentUsername: null, opponentAccountId: null }))
        });

        permanentBans.push({
          accountId,
          username: user.username,
          highRounds: suspect.highRounds,
          avgPointsHigh: suspect.avgPointsHigh,
          gameCount: suspect.gameCount,
          lastSeen: suspect.lastSeen,
          previousTempBanExpiresAt: prevExpiresAt,
          refundSince,
          eloRefund: eloRefundResult,
          moderationLogId: moderationLog._id,
          leaderboardScrub: leaderboardScrubResult
        });
      }
    }

    return res.status(200).json({
      message: `autoBanCheaters completed: ${tempBans.length} temp banned, ${permanentBans.length} permanently banned, ${skipped.length} skipped`,
      tempBans,
      permanentBans,
      skipped,
      totalProcessed: suspects.length,
      filters: { days, minPoints, minRounds }
    });

  } catch (err) {
    console.error('autoBanCheaters error:', err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
}
