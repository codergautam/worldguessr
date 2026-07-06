// duelEnd missed (reconnect into 'end' race) — derive a fallback payload from
// teamScores so the game-over screen can never fail to render. Returns
// undefined for non-team games (1v1 has no client-side fallback; the screen
// stays hidden until the real duelEnd arrives).
//
// Used by BOTH RoundOverScreen mounts (home.js public overlay, gameUI private
// overlay) — keep this the single source so the derivations can't drift.
export default function deriveTeamEndFallback(gameData) {
  if (!gameData?.teamGame && !gameData?.team2v2) return undefined;
  const ts = gameData?.teamScores;
  const a = ts?.a ?? 0, b = ts?.b ?? 0;
  const winningTeam = a > b ? 'a' : b > a ? 'b' : null;
  if (gameData.teamGame) {
    // Cumulative team party: no per-player verdict here — RoundOverScreen
    // derives Victory/Defeat from winningTeam vs the viewer's team.
    return {
      teamGame: true,
      teamScoring: gameData.teamScoring,
      teamScores: { a, b },
      winningTeam,
      draw: a === b,
      players: gameData.players || []
    };
  }
  const myTeam = (gameData.players || []).find(p => p.id === gameData.myId)?.team;
  return {
    team2v2: true,
    teamScores: { a, b },
    winningTeam,
    winner: winningTeam != null && winningTeam === myTeam,
    draw: a === b,
    players: gameData.players || []
  };
}
