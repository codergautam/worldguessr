const players = new Map();
const games = new Map();
const disconnectedPlayers=  new Map();

// Single source of truth for "online" — must match /platformdist filter.
// Excludes unverified (still-connecting / scanners / bots) and disconnected
// (still inside the 30s rejoin grace window).
function getOnlinePlayerCount() {
  let cnt = 0;
  for (const player of players.values()) {
    if (!player.verified || player.disconnected) continue;
    cnt++;
  }
  return cnt;
}

export { games, players, disconnectedPlayers, getOnlinePlayerCount };
