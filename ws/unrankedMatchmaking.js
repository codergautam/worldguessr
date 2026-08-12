/** Rules shared by the public, 10-player unranked matchmaking path. */
export const UNRANKED_ROUND_TIME_MS = 45_000;
export const UNRANKED_JOIN_MIN_REMAINING_MS = 15_000;

/**
 * A player may enter between rounds, but never during the final 15 seconds of
 * an active round. A guessing game without a valid deadline fails closed.
 */
export function canJoinUnrankedRound(game, now = Date.now()) {
  if (game?.state !== 'guess') return true;
  if (!Number.isFinite(game.nextEvtTime)) return false;
  return game.nextEvtTime - now >= UNRANKED_JOIN_MIN_REMAINING_MS;
}
