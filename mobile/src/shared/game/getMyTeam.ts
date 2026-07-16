/**
 * The one way to resolve the local player's team from a roster.
 * Port of web components/utils/getMyTeam.js — keep in lockstep.
 *
 * Returns 'a' | 'b' | null — NEVER a silent 'a' default: a roster lookup miss
 * (fallback-derived data, race before a snapshot lands) must render neutrally,
 * not invert Your/Enemy framing, pin colors or the Victory/Defeat headline.
 * Callers that need an orientation should skip rendering on null instead.
 */
export default function getMyTeam(
  players: Array<{ id: string; team?: string }> | null | undefined,
  myId: string | null | undefined,
): 'a' | 'b' | null {
  if (!Array.isArray(players) || myId == null) return null;
  const team = players.find((p) => p.id === myId)?.team;
  return team === 'a' || team === 'b' ? team : null;
}
