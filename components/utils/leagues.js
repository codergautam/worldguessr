export const leagues = {
  'beginner': {
    min: 0,
    max: 1999,
    name: 'Beginner',
    emoji: '🎯',
    color: '#808080' // grey
  },
  'bronze': {
    min: 2000,
    max: 3999,
    name: 'Bronze',
    emoji: '📙',
    color: '#cd7f32' // bronze
  },
  'silver': {
    min: 4000,
    max: 5999,
    name: 'Silver',
    emoji: '🥈',
    color: '#c0c0c0'  // silver
  },
  'gold': {
    min: 6000,
    max: 7999,
    name: 'Gold',
    emoji: '🏅',
    color: '#ffd700' // gold
  },
  'diamond': {
    min: 8000,
    max: 10000,
    name: 'Platinum',
    emoji: '💎',
    color: '#b9f2ff' // diamond
  },
}

export const getLeague = (elo) => {
  for (const league in leagues) {
    if (elo >= leagues[league].min && elo <= leagues[league].max) {
      return leagues[league];
    }
  }
}