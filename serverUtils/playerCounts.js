import { players } from './states.js';

function isActivePlayer(player) {
  // Duel bots live in the players map but are not humans online.
  return !!player && player.verified && !player.disconnected && !player.isBot;
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
