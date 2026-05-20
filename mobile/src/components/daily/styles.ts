// Daily Challenge color tokens — ported from styles/daily.scss
export const dailyColors = {
  // Primary
  green: '#4CAF50',
  greenDark: '#1f9d55',
  greenDarker: '#16864a',
  greenGradientFrom: '#2ecc71',

  // Tiers / score bars
  barHigh: '#4CAF50',
  barMid: '#FFC107',
  barLow: '#F44336',

  // Stars
  bronze: '#b6b2b2',
  silver: '#CD7F32',
  gold: 'gold',

  // Streak
  streakOrange: '#ff7a1a',
  streakOrangeDark: '#e04b1a',
  streakOrangeLight: '#ffd27a',
  streakRed: '#dc3545',
  diamondLight: '#e4f9ff',
  diamondDark: '#5ed0e6',

  // History bar tiers
  tierLowFrom: '#ff6b6b',
  tierLowTo: '#c73030',
  tierMidFrom: '#ffd54f',
  tierMidTo: '#c68a00',
  tierHighFrom: '#6ed890',
  tierHighTo: '#2f8a4b',
  tierGoldFrom: '#ffe68a',
  tierGoldTo: '#ffb300',
  tierPlatinumFrom: '#f5faff',
  tierPlatinumTo: '#b9f2ff',

  // Surfaces
  cardBg: 'rgba(0,0,0,0.6)',
  cardBgSolid: '#0c1f12',
  cardBorder: 'rgba(255,255,255,0.08)',
  backdrop: 'rgba(0,0,0,0.7)',
  backdropDeep: 'rgba(0,0,0,0.85)',
  pillBg: 'rgba(255,255,255,0.06)',
  pillBorder: 'rgba(255,255,255,0.1)',

  // Warning / accent
  warningBg: 'rgba(255,193,7,0.10)',
  warningBorder: 'rgba(255,193,7,0.28)',
  warningText: 'rgba(255,230,170,0.95)',
  errorBg: 'rgba(220,53,69,0.15)',
  errorBorder: 'rgba(220,53,69,0.5)',
} as const;

export const dailyTimings = {
  // Entrance/exit timings (ms)
  landingEntrance: 550,
  backdropFade: 500,
  sectionStaggerStep: 80,
  resultsModalAppear: 400,
  badgePop: 400,
  scoreCountUp: 1200,
  starStagger: 500,
  flameEntering: 800,
  flameHolding: 2700,
  flameLeaving: 700,
  flameTotal: 4200,
  streakPulse: 2400,
  shareIdlePulse: 2600,
  shareShine: 4200,
  confirmIconEnter: 500,
} as const;
