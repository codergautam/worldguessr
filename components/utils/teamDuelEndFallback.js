// duelEnd missed (reconnect into 'end' race) — derive a fallback payload from
// teamScores so the game-over screen can never fail to render. Returns
// undefined for non-team games (1v1 has no client-side fallback; the screen
// stays hidden until the real duelEnd arrives).
//
// Used by BOTH RoundOverScreen mounts (home.js public overlay, gameUI private
// overlay) — keep this the single source so the derivations can't drift.
// Deliberately ABSENT from the team2v2 shape: autoPaired / teamHostId. Those
// are per-recipient fields the server reads off the staging lobbies before
// teardown (ws.js build2v2Teams) — they never ride any `game` snapshot, so
// this fallback cannot derive them. The server's reconnect replay
// (Game.js handleReconnect → frozen lastTeamEnd) is the real fix and already
// carries them; on this fallback the end card's Back button falls back to the
// soloRequeue rule alone.
export default function deriveTeamEndFallback(gameData) {
  if (!gameData?.teamGame && !gameData?.team2v2) return undefined;
  const ts = gameData?.teamScores;
  const a = ts?.a ?? 0, b = ts?.b ?? 0;
  const winningTeam = a > b ? 'a' : b > a ? 'b' : null;
  const myTeam = (gameData.players || []).find(p => p.id === gameData.myId)?.team;
  if (gameData.teamGame) {
    return {
      teamGame: true,
      teamScoring: gameData.teamScoring,
      teamScores: { a, b },
      winningTeam,
      // Per-viewer verdict, stamped ONLY when the viewer's team resolved.
      // An unresolved myTeam must leave `winner` ABSENT — RoundOverScreen's
      // `typeof data.winner === 'boolean'` check then falls through to its
      // render-time winningTeam-vs-myTeam derivation, which self-corrects
      // once the roster re-syncs. A frozen `winner:false` here showed
      // "Defeat" to winners who reconnected with a teamless roster entry.
      ...(myTeam ? { winner: winningTeam != null && winningTeam === myTeam } : {}),
      draw: a === b,
      players: gameData.players || []
    };
  }
  return {
    team2v2: true,
    teamScores: { a, b },
    winningTeam,
    winner: winningTeam != null && winningTeam === myTeam,
    draw: a === b,
    players: gameData.players || []
  };
}
