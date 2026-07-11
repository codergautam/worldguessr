/**
 * duelEnd missed (reconnect into 'end' race) — derive a fallback payload from
 * teamScores so the game-over screen can never fail to render. Returns
 * undefined for non-team games (1v1 has no client-side fallback; the screen
 * stays hidden until the real duelEnd arrives).
 *
 * Port of web components/utils/teamDuelEndFallback.js — keep in lockstep.
 *
 * Deliberately ABSENT from the team2v2 shape: autoPaired / teamHostId. Those
 * are per-recipient fields the server reads off the staging lobbies before
 * teardown (ws.js build2v2Teams) — they never ride any `game` snapshot, so a
 * client-side fallback cannot derive them. The server's reconnect replay
 * (Game.js handleReconnect → frozen lastTeamEnd) is the real fix and already
 * carries them; on this fallback the end card's Back button falls back to the
 * soloRequeue rule alone.
 */

import getMyTeam from './getMyTeam';
import type {
  DuelEndTeam2v2,
  DuelEndTeamGame,
  GameData,
} from '../../store/multiplayerStore';

export default function deriveTeamEndFallback(
  gameData: GameData | null | undefined,
): DuelEndTeam2v2 | DuelEndTeamGame | undefined {
  if (!gameData?.teamGame && !gameData?.team2v2) return undefined;
  const ts = gameData?.teamScores;
  const a = ts?.a ?? 0;
  const b = ts?.b ?? 0;
  const winningTeam = a > b ? 'a' : b > a ? 'b' : null;
  const myTeam = getMyTeam(gameData.players, gameData.myId);
  if (gameData.teamGame) {
    return {
      teamGame: true,
      teamScoring: gameData.teamScoring,
      teamScores: { a, b },
      winningTeam,
      // Stamped ONLY when the viewer's team resolved: an absent `winner`
      // lets the results synthesis derive the verdict at render time from
      // winningTeam vs myTeam (self-correcting once the roster re-syncs).
      // A frozen winner:false would show "Defeat" to a reconnecting winner.
      ...(myTeam ? { winner: winningTeam != null && winningTeam === myTeam } : {}),
      draw: a === b,
      players: gameData.players || [],
    };
  }
  return {
    team2v2: true,
    teamScores: { a, b },
    winningTeam,
    ...(myTeam ? { winner: winningTeam != null && winningTeam === myTeam } : {}),
    draw: a === b,
    players: gameData.players || [],
  };
}
