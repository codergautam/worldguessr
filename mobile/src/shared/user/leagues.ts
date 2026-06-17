export interface League {
  min: number;
  max: number;
  name: string;
  emoji: string;
  color: string;
  light?: string;
}

export const leagues: Record<string, League> = {
  'explorer': {
    min: 0,
    max: 1999,
    name: 'Trekker',
    emoji: '🥾',
    color: '#808080', // grey
    light: '#d3d3d3' // light grey
  },
  'trekker': {
    min: 2000,
    max: 4999,
    name: 'Explorer',
    emoji: '🧭',
    color: '#cd7f32' // bronze
  },
  'voyager': {
    min: 5000,
    max: 7999,
    name: 'Voyager',
    emoji: '🚢',
    color: '#ffd700' // gold
  },
  'nomad': {
    min: 8000,
    max: 20000,
    name: 'Nomad',
    emoji: '🌍',
    color: '#b9f2ff' // diamond
  },
};

/**
 * Get league based on ELO rating
 */
export function getLeague(elo: number): League {
  for (const league in leagues) {
    if (elo >= leagues[league].min && elo <= leagues[league].max) {
      return leagues[league];
    }
  }
  // Return first league as default
  return leagues[Object.keys(leagues)[0]];
}

/**
 * Get ELO range for a league by name
 */
export function getLeagueRange(name: string): [number, number] {
  const league = Object.values(leagues).find(league => league.name === name);
  if (!league) {
    return [0, 1999]; // Default to first league
  }
  return [league.min, league.max];
}
