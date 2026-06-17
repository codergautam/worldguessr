import { players } from './states.js';

function isActivePlayer(player) {
  return !!player && player.verified && !player.disconnected;
}

function getActivePlayerCount() {
  let count = 0;
  for (const player of players.values()) {
    if (isActivePlayer(player)) count++;
  }
  return count;
}

function getPlatformDistribution() {
  const dist = {};
  for (const player of players.values()) {
    if (!isActivePlayer(player)) continue;
    const platform = player.platform || 'empty';
    dist[platform] = (dist[platform] || 0) + 1;
  }
  return dist;
}

export { getActivePlayerCount, getPlatformDistribution };
