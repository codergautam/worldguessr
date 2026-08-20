/**
 * Pure logic helpers for autoBanCheaters workflow.
 * Extracted to be unit-testable without DB.
 */

export const TEMP_BAN_DAYS = 14;
export const TEMP_BAN_DURATION_MS = TEMP_BAN_DAYS * 24 * 60 * 60 * 1000;
export const WORKFLOW_NAME = 'autoBanCheaters';

/**
 * Determine if a user is effectively banned, accounting for expired temp bans.
 * @param {Object} user - User doc with banned, banType, banExpiresAt
 * @param {Date} now
 * @returns {{effectivelyBanned: boolean, effectiveBanType: string, expired: boolean}}
 */
export function getEffectiveBanStatus(user, now = new Date()) {
  if (!user || !user.banned) {
    return { effectivelyBanned: false, effectiveBanType: 'none', expired: false };
  }
  if (user.banType === 'temporary' && user.banExpiresAt) {
    if (now >= new Date(user.banExpiresAt)) {
      return { effectivelyBanned: false, effectiveBanType: 'none', expired: true };
    }
    return { effectivelyBanned: true, effectiveBanType: 'temporary', expired: false };
  }
  if (user.banType === 'permanent') {
    return { effectivelyBanned: true, effectiveBanType: 'permanent', expired: false };
  }
  // Legacy banned flag without banType
  if (user.banned) {
    return { effectivelyBanned: true, effectiveBanType: user.banType || 'none', expired: false };
  }
  return { effectivelyBanned: false, effectiveBanType: 'none', expired: false };
}

/**
 * Check if a suspect is a repeat offender based on previous autoBan temp bans.
 *
 * @param {Array} previousAutoTempBans - ModerationLog entries sorted desc by createdAt, filtered to isAutoBan, workflow, ban_temporary
 * @param {Date} now
 * @param {Date|string|null} lastSeen - suspect.lastSeen (max endedAt of suspicious games)
 * @returns {{isRepeat: boolean, reason: string|null, previousTempBan: Object|null, refundSince: Date|null}}
 */
export function checkRepeatOffender(previousAutoTempBans, now, lastSeen) {
  if (!previousAutoTempBans || previousAutoTempBans.length === 0) {
    return { isRepeat: false, reason: null, previousTempBan: null, refundSince: null };
  }

  const latestTempBan = previousAutoTempBans[0];
  const prevExpiresAt = latestTempBan.expiresAt ? new Date(latestTempBan.expiresAt) : null;

  if (!prevExpiresAt || isNaN(prevExpiresAt.getTime())) {
    return { isRepeat: false, reason: 'Previous auto temp ban missing expiresAt', previousTempBan: latestTempBan, refundSince: null };
  }

  if (now < prevExpiresAt) {
    return { isRepeat: false, reason: `Previous auto temp ban not yet expired (expires ${prevExpiresAt.toISOString()})`, previousTempBan: latestTempBan, refundSince: null };
  }

  // Must have cheating game after expiry
  let hasGameAfterExpiry = false;
  if (lastSeen) {
    const lastSeenDate = new Date(lastSeen);
    if (!isNaN(lastSeenDate.getTime()) && lastSeenDate > prevExpiresAt) {
      hasGameAfterExpiry = true;
    }
  }

  if (!hasGameAfterExpiry) {
    return { isRepeat: false, reason: `No cheating game after previous temp ban expiry (${prevExpiresAt.toISOString()})`, previousTempBan: latestTempBan, refundSince: null };
  }

  return { isRepeat: true, reason: null, previousTempBan: latestTempBan, refundSince: prevExpiresAt };
}

/**
 * Determine which suspects to process, skipping banned/staff etc.
 * Pure helper for testing decision table.
 */
export function shouldSkipSuspect(user, effectiveBanStatus, previousPermBansCount) {
  if (!user) return { skip: true, reason: 'User not found' };
  if (user.staff) return { skip: true, reason: 'Staff member' };
  if (effectiveBanStatus.effectivelyBanned) {
    if (effectiveBanStatus.effectiveBanType === 'permanent') {
      return { skip: true, reason: 'Already permanently banned' };
    }
    return { skip: true, reason: 'Currently temporarily banned' };
  }
  if (previousPermBansCount > 0) {
    return { skip: true, reason: 'Already permanently banned by autoBanCheaters' };
  }
  return { skip: false, reason: null };
}

/**
 * Build internal reason strings for audit logs
 */
export function buildTempBanReason(suspect, filters) {
  const { highRounds, avgPointsHigh, gameCount, highRoundPct } = suspect;
  const { days, minPoints, minRounds } = filters;
  return `[${WORKFLOW_NAME}] First offense - suspicious 5k activity detected: ${highRounds} rounds >=${minPoints} pts (avg ${avgPointsHigh}), ${gameCount} games in last ${days} days, highRoundPct=${highRoundPct}%`;
}

export function buildPermBanReason(suspect, filters, prevExpiresAt) {
  const { highRounds, avgPointsHigh, gameCount, highRoundPct, lastSeen } = suspect;
  const { days, minPoints } = filters;
  const lastSeenStr = lastSeen ? new Date(lastSeen).toISOString() : 'unknown';
  return `[${WORKFLOW_NAME}] Repeat offense - suspicious 5k activity after 14-day temp ban expired on ${new Date(prevExpiresAt).toISOString()}: ${highRounds} rounds >=${minPoints} pts (avg ${avgPointsHigh}), ${gameCount} games in last ${days} days, highRoundPct=${highRoundPct}%, lastSeen=${lastSeenStr}`;
}
