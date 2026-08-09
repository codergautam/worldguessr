import { getBackground } from '../shared/cosmetics';
import { SITE_URL } from '../constants/config';

/* ===========================================================================
 *  THE SITE BACKGROUND, AND THE COLOURS THAT GO WITH IT.
 *
 *  Mirror of lib/siteBackground.js on web, and deliberately the same shape: ONE
 *  resolver that turns an equipped sku into a URL, and ONE that turns it into
 *  the home screen's palette. Three screens ask for the URL and four components
 *  ask for the palette; three private copies of "look it up, check the type,
 *  bolt the origin on" is three chances to ship a 404.
 *
 *  WHY THE IMAGE IS FETCHED AND NOT BUNDLED: ten cities at ~250KB each is 2.5MB
 *  of binary in an app download that almost nobody uses more than one file
 *  from. expo-image caches to disk on first sight (cachePolicy 'memory-disk'),
 *  so an owner pays the download once per device and every cold start after
 *  that paints from the cache with no network at all.
 *
 *  WHY expo-image AND NOT React Native's Image, which the rest of the app uses:
 *  these files are WebP, and RN's iOS image pipeline does not decode WebP. On
 *  Android they would have worked and on iOS they would have rendered as
 *  nothing — an invisible failure, because a failed <Image> in React Native
 *  does not throw, it just paints transparent. expo-image also brings the disk
 *  cache above, which the app otherwise has for audio and nothing else.
 * ======================================================================== */

/** Absolute URL of the background a sku paints, or null for "use the stock one". */
export function backgroundUrlForSku(sku: string | null | undefined): string | null {
  const bg = getBackground(sku);
  return bg ? `${SITE_URL}${bg.path}` : null;
}

/**
 * The home screen's chrome colours.
 *
 * READY-MADE STRINGS, NOT CHANNELS, because every consumer is a StyleSheet
 * entry rather than a CSS declaration — the alpha compositing that web does
 * with rgba() var substitution has to be done here instead, and doing it once
 * beats doing it at four call sites.
 *
 * THE DEFAULTS ARE THE CURRENT GREEN LITERALS, VERBATIM. With nothing equipped
 * — which is very nearly every player — every field below is byte-identical to
 * what the screens hardcoded before this existed, so the stock app renders
 * exactly as it did and an unequip needs no reset path.
 */
export interface HomeAccent {
  /** Filled button face, and the pressed state of the translucent ones. */
  primary: string;
  /** Translucent face used on iOS, where it sits over the photograph. */
  primaryTransparent: string;
  /**
   * Opaque face used on Android.
   *
   * Android gets a flat colour rather than the translucent one for the reason
   * it always has: the elevation shadow under these surfaces renders THROUGH a
   * semi-transparent background, so the card shows its own shadow as a grey
   * bloom. The stock value (#1a4423) was hand-picked; every other city
   * approximates the same relationship by taking 75% of `surface`, which lands
   * within a couple of points of it when you run green through the same sum.
   */
  androidFlat: string;
  /** The 1.4px rims on the corner chips. */
  deep: string;
  /** Top-to-bottom wash behind the menu, densest at the top. */
  gradient: readonly [string, string, string, string, string];
  /** Footer icon buttons: the wash at 55%, and at 75% under a finger. */
  chrome: string;
  chromePressed: string;
}

const STOCK_ACCENT: HomeAccent = {
  primary: '#245734',
  primaryTransparent: 'rgba(36, 87, 52, 0.85)',
  androidFlat: '#1a4423',
  deep: '#112b18',
  gradient: [
    'rgba(20, 65, 25, 0.95)',
    'rgba(20, 65, 25, 0.8)',
    'rgba(20, 65, 25, 0.5)',
    'rgba(20, 65, 25, 0.2)',
    'transparent',
  ],
  chrome: 'rgba(20, 65, 25, 0.55)',
  chromePressed: 'rgba(20, 65, 25, 0.75)',
};

const HEX = /^#[0-9a-f]{6}$/i;

function channels(hex: string): [number, number, number] | null {
  if (typeof hex !== 'string' || !HEX.test(hex)) return null;
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function scale([r, g, b]: [number, number, number], by: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n * by)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The palette for an equipped sku, or the stock green.
 *
 * ALL OR NOTHING, same rule as web: a row with one malformed tone falls back
 * to green entirely rather than mixing a new gradient with old buttons. The
 * half-applied state is the one that looks broken.
 */
export function homeAccentFor(sku: string | null | undefined): HomeAccent {
  const bg = getBackground(sku);
  if (!bg) return STOCK_ACCENT;

  const wash = channels(bg.wash);
  const surface = channels(bg.surface);
  if (!wash || !surface || !HEX.test(bg.deep)) return STOCK_ACCENT;

  const [wr, wg, wb] = wash;
  const [sr, sg, sb] = surface;
  return {
    primary: `rgb(${sr}, ${sg}, ${sb})`,
    primaryTransparent: `rgba(${sr}, ${sg}, ${sb}, 0.85)`,
    androidFlat: scale(surface, 0.75),
    deep: bg.deep,
    gradient: [
      `rgba(${wr}, ${wg}, ${wb}, 0.95)`,
      `rgba(${wr}, ${wg}, ${wb}, 0.8)`,
      `rgba(${wr}, ${wg}, ${wb}, 0.5)`,
      `rgba(${wr}, ${wg}, ${wb}, 0.2)`,
      'transparent',
    ],
    chrome: `rgba(${wr}, ${wg}, ${wb}, 0.55)`,
    chromePressed: `rgba(${wr}, ${wg}, ${wb}, 0.75)`,
  };
}

export { STOCK_ACCENT };
