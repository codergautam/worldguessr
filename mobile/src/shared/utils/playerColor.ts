const PLAYER_COLORS = [
  '#4ade80',
  '#60a5fa',
  '#fbbf24',
  '#f472b6',
  '#a78bfa',
  '#fb7185',
  '#2dd4bf',
  '#f97316',
  '#38bdf8',
  '#c084fc',
];

export function getPlayerColor(playerId?: string | null): string {
  const stableId = playerId || 'unknown-player';
  let hash = 0;
  for (let i = 0; i < stableId.length; i += 1) {
    hash = (hash * 31 + stableId.charCodeAt(i)) >>> 0;
  }
  return PLAYER_COLORS[hash % PLAYER_COLORS.length];
}
