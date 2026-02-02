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
  background: '#000000',
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

export type ColorKey = keyof typeof colors;
