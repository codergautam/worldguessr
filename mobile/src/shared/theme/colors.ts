/**
 * WorldGuessr color palette - matches globals.scss
 */
export const colors = {
  // Primary colors
  primary: '#245734',
  primaryDark: '#112b18',
  primaryTransparent: 'rgba(36, 87, 52, 0.85)',
  darkTransparent: 'rgba(0, 0, 0, 0.4)',

  // Base RGB values for gradients
  baseR: 20,
  baseG: 65,
  baseB: 25,

  // League colors
  trekker: '#808080',      // grey
  trekkerLight: '#d3d3d3', // light grey
  explorer: '#cd7f32',     // bronze
  voyager: '#ffd700',      // gold
  nomad: '#b9f2ff',        // diamond

  // Semantic colors
  success: '#4ade80',
  successGlow: '#22c55e',
  warning: '#fbbf24',
  warningGlow: '#f59e0b',
  error: '#ef4444',
  errorGlow: '#dc2626',

  // Health bar colors
  healthHigh: '#4ade80',
  healthMedium: '#fbbf24',
  healthLow: '#ef4444',

  // UI colors
  white: '#ffffff',
  black: '#000000',
  text: '#ffffff',
  textSecondary: 'rgba(255, 255, 255, 0.8)',
  textMuted: 'rgba(255, 255, 255, 0.6)',

  // Background colors
  // Brand dark green — same as the splash/adaptive-icon background (app.json).
  // Used as the nav transition backdrop AND every screen's root bg, so a screen
  // sliding in never flashes black before its content (panorama/map/images) paints.
  background: '#112b18',
  card: 'rgba(36, 87, 52, 0.7)',
  cardBorder: 'rgba(255, 255, 255, 0.1)',
  overlay: 'rgba(0, 0, 0, 0.7)',
} as const;

/**
 * Get health bar color based on percentage
 */
export function getHealthColor(percentage: number): { bg: string; glow: string } {
  if (percentage > 60) return { bg: colors.healthHigh, glow: colors.successGlow };
  if (percentage > 30) return { bg: colors.healthMedium, glow: colors.warningGlow };
  return { bg: colors.healthLow, glow: colors.errorGlow };
}

/**
 * Glossy 3-stop gradients (light → base → deep) for each health band, used by the
 * duel health bars. All three are rendered stacked and cross-faded by HP% on the
 * UI thread, so they are exported as a set rather than picked one at a time.
 * Thresholds match getHealthColor: high >60%, medium 30–60%, low ≤30%.
 */
export const HEALTH_GRADIENTS = {
  high: ['#86efac', '#4ade80', '#22c55e'],
  medium: ['#fde68a', '#fbbf24', '#f59e0b'],
  low: ['#fca5a5', '#ef4444', '#dc2626'],
} as const;

export type HealthBand = keyof typeof HEALTH_GRADIENTS;

export type ColorKey = keyof typeof colors;
