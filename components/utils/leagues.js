const masterGradient = 'linear-gradient(to bottom, #d6ff33 0%, #4cf2a0 50%, #00d4dc 100%)';

export const leagues = {
  trekker: {
    id: 'trekker', name: 'Trekker', icon: 'trekker',
    min: 0, max: 1999,
    color: '#b0b0b0', light: '#d3d3d3', // grey
  },
  explorer: {
    id: 'explorer', name: 'Explorer', icon: 'explorer',
    min: 2000, max: 3999,
    color: '#cd7f32', // bronze
  },
  voyager: {
    id: 'voyager', name: 'Voyager', icon: 'voyager',
    min: 4000, max: 6999,
    color: '#ffd429', // gold
  },
  nomad: {
    id: 'nomad', name: 'Nomad', icon: 'nomad',
    min: 7000, max: 9999,
    color: '#9bdcf7',   },
  pathfinder: {
    id: 'pathfinder', name: 'Pathfinder', icon: 'pathfinder',
    min: 10000, max: 14999,
    color: '#cc46e2',   },
  master: {
    id: 'master', name: 'Master', icon: 'master',
    min: 15000, max: Infinity,
    color: '#4cf2a0', gradient: masterGradient,   },
};

export const subranks = [
  { baseId: 'trekker', tier: 1, roman: 'I',   min: 0,     max: 1499,  color: '#8a8a8a' },
  { baseId: 'trekker', tier: 2, roman: 'II',  min: 1500,  max: 1999,  color: '#cfcfcf' },
  { baseId: 'explorer', tier: 1, roman: 'I',  min: 2000,  max: 2999,  color: '#b06a28' },
  { baseId: 'explorer', tier: 2, roman: 'II', min: 3000,  max: 3999,  color: '#e3933f' },
  { baseId: 'voyager', tier: 1, roman: 'I',   min: 4000,  max: 4999,  color: '#d6b13e' },
  { baseId: 'voyager', tier: 2, roman: 'II',  min: 5000,  max: 5999,  color: '#ffd429' },
  { baseId: 'voyager', tier: 3, roman: 'III', min: 6000,  max: 6999,  color: '#ffe600' },
  { baseId: 'nomad', tier: 1, roman: 'I',     min: 7000,  max: 7999,  color: '#d4f6ff' },
  { baseId: 'nomad', tier: 2, roman: 'II',    min: 8000,  max: 8999,  color: '#9bdcf7' },
  { baseId: 'nomad', tier: 3, roman: 'III',   min: 9000,  max: 9999,  color: '#63bdf0' },
  { baseId: 'pathfinder', tier: 1, roman: 'I',   min: 10000, max: 10999, color: '#9b4dff' },
  { baseId: 'pathfinder', tier: 2, roman: 'II',  min: 11000, max: 11999, color: '#b347f2' },
  { baseId: 'pathfinder', tier: 3, roman: 'III', min: 12000, max: 12999, color: '#cc46e2' },
  { baseId: 'pathfinder', tier: 4, roman: 'IV',  min: 13000, max: 13999, color: '#e645cf' },
  { baseId: 'pathfinder', tier: 5, roman: 'V',   min: 14000, max: 14999, color: '#ff4fb8' },
  { baseId: 'master', tier: 1, roman: '', min: 15000, max: Infinity, color: '#4cf2a0', gradient: masterGradient },
];

for (const base of Object.values(leagues)) {
  base.tiers = subranks.filter((s) => s.baseId === base.id);
}

const buildLeague = (sub, index) => {
  const base = leagues[sub.baseId];
  const label = sub.roman ? `${base.name} ${sub.roman}` : base.name;
  const next = subranks[index + 1] || null;
  return {
    id: base.id,
    name: base.name,
    tier: sub.tier,
    roman: sub.roman,
    label,
    icon: base.icon,
    color: sub.color,
    gradient: sub.gradient || null,
    min: sub.min,
    max: sub.max,
    baseMin: base.min,
    baseMax: base.max,
    next: next ? { label: next.roman ? `${leagues[next.baseId].name} ${next.roman}` : leagues[next.baseId].name, min: next.min } : null,
  };
};

export const getLeague = (elo) => {
  const value = Number.isFinite(elo) ? elo : 0;
  for (let i = 0; i < subranks.length; i++) {
    const sub = subranks[i];
    if (value >= sub.min && value <= sub.max) {
      return buildLeague(sub, i);
    }
  }
  return buildLeague(subranks[0], 0);
};

export const getLeagueRange = (name) => {
  const league = Object.values(leagues).find((l) => l.name === name);
  if (!league) return [0, 20000];
  return [league.min, Number.isFinite(league.max) ? league.max : 20000];
};
