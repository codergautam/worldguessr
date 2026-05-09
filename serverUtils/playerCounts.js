import { players } from './states.js';

export function getActivePlayers() {
  return [...players.values()].filter((player) => player.verified && !player.disconnected);
}

export function getActivePlayerCount() {
  return getActivePlayers().length;
}

export function getPlatformDistribution() {
  const dist = {};
  for (const player of getActivePlayers()) {
    const platform = player.platform || 'empty';
    dist[platform] = (dist[platform] || 0) + 1;
  }
  return dist;
}
