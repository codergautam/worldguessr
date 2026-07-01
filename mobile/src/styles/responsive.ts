import { useCallback } from 'react';
import { useWindowDimensions } from 'react-native';

/**
 * Tablet-aware sizing for the game surfaces.
 *
 * WHY THIS EXISTS
 * The web app scales beautifully onto an iPad for free: country buttons hit the
 * `@media (pointer: coarse)` rules (full-width, wrapping, `flex: 1 1 30/44%` —
 * every iPad is a coarse pointer), and the end-banner text is sized in
 * `em`/`vw`/`vh` so it grows to ~24–29px on a big display. The React Native app
 * has neither: it uses fixed `px` font sizes and width breakpoints
 * (`width <= 600` = phone, `width >= 1200` = large), so an iPad (shortest side
 * 768–1024) lands in tiny "default" branches and every game label reads
 * phone-small on a 11"/13" screen.
 *
 * This module gives the game UI a single, screen-size-driven multiplier so those
 * fixed px values scale up on tablets the way the web's relative units do — and,
 * per the product goal, end up a touch *larger* than web for a better mobile UX.
 */

/**
 * Shortest-side threshold (dp) at/above which we treat the device as a tablet.
 * 600dp is the long-standing Android "sw600dp" tablet bucket; every iPad
 * (mini's shortest side is 744dp) clears it, while no phone does — even a large
 * phone in portrait tops out near 440dp, and a landscape phone's shortest side
 * is its height (~390–430dp). So this cleanly separates iPads from phones in
 * either orientation.
 */
export const TABLET_MIN_SHORTEST_SIDE = 600;

export function isTabletSize(width: number, height: number): boolean {
  return Math.min(width, height) >= TABLET_MIN_SHORTEST_SIDE;
}

/**
 * Game-UI scale factor keyed on the shortest screen side.
 *   • Phones  → 1.0 (exactly — clamped, so zero change/regression risk)
 *   • iPad mini (744) → ~1.28 · iPad 10.2 (768) → ~1.32 · iPad Air/Pro11 (820–834) → ~1.41–1.44
 *   • iPad Pro 12.9 (1024) → clamped to 1.5
 *
 * Divisor 580 + floor 1 means anything below ~580dp shortest side (i.e. all
 * phones) is pinned to 1.0; the first real device above the floor is the iPad
 * mini, so there's no visible discontinuity on any actual hardware.
 */
export function gameUiScale(width: number, height: number): number {
  const shortest = Math.min(width, height);
  // Crisp 1.0 for anything that isn't a tablet, so there's no 580–600dp "dead
  // band" where a non-tablet device picks up a fractional scale. (No shipping
  // phone lands there anyway, but this keeps scale and isTablet consistent.)
  if (shortest < TABLET_MIN_SHORTEST_SIDE) return 1;
  return Math.min(1.5, shortest / 580);
}

/** Round to the nearest 0.5dp so scaled font sizes don't land on blurry subpixels. */
function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

/**
 * Hook for game components: returns the live tablet scale plus a bound `sc()`
 * helper so a component can write `sc(20)` and get the tablet-scaled value
 * (and the raw `1.0` on phones). Re-evaluates on rotation / split-view resize
 * because it reads `useWindowDimensions`.
 */
export function useGameUiScale() {
  const { width, height } = useWindowDimensions();
  const scale = gameUiScale(width, height);
  const sc = useCallback((value: number) => roundHalf(value * scale), [scale]);
  return { width, height, scale, isTablet: isTabletSize(width, height), sc };
}
