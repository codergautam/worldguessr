// Cosmetic sku -> renderable values. Hand-maintained mirror of the BACKGROUNDS,
// GLOWS and MARKERS blocks in shared/shop/catalog.js.
//
// WHY THIS IS LOCAL AND NOT FETCHED: the multiplayer roster carries only the
// SKU (ws Player.js `nameGlow`), and it arrives on the websocket the instant a
// game starts — long before, and independently of, any shop HTTP call. Without
// a local table an opponent's glow could not be painted at all until the
// storefront happened to load. The shop screen still prefers the server's
// catalogue for PRICES and the item list; only the colours live here.

/**
 * A purchasable site background: the photograph, and the palette the HOME
 * SCREEN recolours itself to while it is equipped.
 *
 * WHY THIS TABLE IS LOCAL, same argument as the glows below: the equipped sku
 * arrives on the auth payload and is read from the store on the very first
 * frame of the home screen, long before (and independently of) any shop HTTP
 * call. Fetching the catalogue to find out which image to paint would mean a
 * green menu and the stock photograph on every cold start.
 *
 * MIRROR OF shared/shop/catalog.js — same skus, same paths, same hex values.
 * Change it there and change it HERE IN THE SAME COMMIT. A mismatch is not a
 * cosmetic bug: it is the app painting a different city from the one the buyer
 * paid for.
 */
export interface BackgroundDef {
  sku: string;
  name: string;
  /** Site-relative path. The origin is bolted on in src/services/siteBackground.ts. */
  path: string;
  /** Darkest tone: the 1.4px rims on the corner chips. */
  deep: string;
  /** Mid tone: the big top-to-bottom wash behind the menu. */
  wash: string;
  /** Lightest tone: every filled button face. */
  surface: string;
}

const BACKGROUND_LIST: BackgroundDef[] = [
  // The one light row — cerulean, and the brightest palette on the shelf on
  // purpose. See the long note on this sku in shared/shop/catalog.js for why it
  // goes no lighter than this.
  { sku: 'bg_sf',        name: 'San Francisco',  path: '/backgrounds/bg-sf.webp',        deep: '#133a4d', wash: '#1d5674', surface: '#2b769c' },
  { sku: 'bg_paris',     name: 'Paris',          path: '/backgrounds/bg-paris.webp',     deep: '#101a33', wash: '#1b2d57', surface: '#28417d' },
  { sku: 'bg_rome',      name: 'Rome',           path: '/backgrounds/bg-rome.webp',      deep: '#2b2009', wash: '#4a3810', surface: '#6b521b' },
  { sku: 'bg_prague',    name: 'Prague',         path: '/backgrounds/bg-prague.webp',    deep: '#0c2229', wash: '#123a45', surface: '#1b5463' },
  { sku: 'bg_tokyo',     name: 'Tokyo',          path: '/backgrounds/bg-tokyo.webp',     deep: '#2a0b1c', wash: '#4a1330', surface: '#6b1f47' },
  { sku: 'bg_seoul',     name: 'Seoul',          path: '/backgrounds/bg-seoul.webp',     deep: '#0d1e2b', wash: '#153348', surface: '#1f4a68' },
  { sku: 'bg_singapore', name: 'Singapore',      path: '/backgrounds/bg-singapore.webp', deep: '#07262a', wash: '#0c4148', surface: '#135e68' },
  { sku: 'bg_newyork',   name: 'New York',       path: '/backgrounds/bg-newyork.webp',   deep: '#170f2e', wash: '#251a4d', surface: '#3b2a6e' },
  { sku: 'bg_rio',       name: 'Rio de Janeiro', path: '/backgrounds/bg-rio.webp',       deep: '#0a1e33', wash: '#113356', surface: '#1a4a7d' },
  { sku: 'bg_agra',      name: 'Agra',           path: '/backgrounds/bg-agra.webp',      deep: '#2b1219', wash: '#4a212c', surface: '#6b3241' },
];

const BACKGROUNDS_BY_SKU = new Map(BACKGROUND_LIST.map((b) => [b.sku, b]));

export const BACKGROUNDS: readonly BackgroundDef[] = BACKGROUND_LIST;

/** Definition for a background sku, or null. Never throws — fed off the wire. */
export function getBackground(sku: string | null | undefined): BackgroundDef | null {
  if (typeof sku !== 'string' || !sku) return null;
  return BACKGROUNDS_BY_SKU.get(sku) ?? null;
}

export interface GlowDef {
  sku: string;
  name: string;
  /** Glow colour on dark surfaces (HUD, menus, leaderboards, results). */
  dark: string;
  /**
   * Glow colour on LIGHT surfaces (white between-rounds cards, map tooltips).
   *
   * This column is pitched into a vivid MID band — 44.9-57.8% lightness at
   * 74-92% saturation — not the 700/800-level near-blacks it used to hold.
   * Those read as one grey drop shadow on a white card whatever sku they came
   * from, because hue is the first thing a colour gives up on its way to black.
   * The nine light hues are spread by brute force in shared/shop/catalog.js to
   * a 27.0 degree minimum; keep this file byte-identical to that one.
   */
  light: string;
  /**
   * True = this sku moves. IT NOW MOVES HERE TOO. This flag used to mean "moves
   * on web, still frame in the app", because `textShadowRadius` is not a
   * native-driver property and driving it from JS would stutter the exact
   * screens (duel HUD, results) these appear on. Both of those facts are still
   * true and neither is worked around: src/components/NameGlowHalo.tsx
   * animates nothing but OPACITY, over a stack of fixed shadows declared in
   * src/shared/glowKeyframes.ts.
   *
   * The flag survives because two things still read it — the shop's "Animated"
   * chip, and the reduced-motion fallback, which drops back to the static
   * `dark`/`light` colour below. Do not "fix" anything here by animating a
   * shadow property on the JS thread; that is still the trap it always was.
   */
  animated: boolean;
}

const GLOW_LIST: GlowDef[] = [
  // STATIC TIER, 500. "Ember", "Mint" and "Crimson" were DELETED in the same
  // commit as the web catalogue: each was a flat halo in a hue an animated sku
  // already owned, i.e. the cheapest possible version of an item sitting next
  // to it on the same shelf. "Azure" went later and for a blunter reason: the
  // owner looked at it and it looked bad.
  { sku: 'glow_ice',      name: 'Ice',      dark: '#00E5FF', light: '#09B9DC', animated: false },
  { sku: 'glow_rose',     name: 'Rose',     dark: '#FF4FD8', light: '#F631BB', animated: false },
  { sku: 'glow_amethyst', name: 'Amethyst', dark: '#B155F7', light: '#A131F6', animated: false },
  { sku: 'glow_gold',     name: 'Gold',     dark: '#FFE30A', light: '#CBB61A', animated: false },
  // ANIMATED TIER — animated on BOTH platforms now (see GlowDef.animated).
  //
  // These three rows are a byte-for-byte mirror of ANIMATED_GLOWS in
  // shared/shop/catalog.js: same skus, same price order, same hex values, same
  // names, same `animated` flag. EVERY GLOW NAME IS ONE WORD — "Living Flame",
  // "Prism Cycle" and "Comet Orbit" became Blaze, Prism and Comet (Comet later
  // became Shadow), and the skus did not move with them, because ownership is
  // keyed on the sku. They have drifted before. When a glow is added, changed or
  // repriced there, change it HERE IN THE SAME COMMIT — a mismatch is not a
  // cosmetic bug, it is the app painting a different colour from the one the
  // buyer saw in the web shop for an item they already own.
  //
  // The colours are the STATIC fallback BOTH animations resolve to: what a
  // reduced-motion user sees, what a Leaflet tooltip in the embed bundle gets,
  // and what any client too old for the layer table renders. That is exactly
  // what makes them the right values here, and why they still have to be vivid
  // and hue-separated rather than pastel.
  //
  // SIX SKUS HAVE BEEN DELETED FROM THIS TIER OVER TIME and none of them is
  // coming back: "Neon Flicker" and "Electric Arc" were strobes (a strobe does
  // not read from across a card); "Sonar Ping" and "Shockwave" were the same
  // expanding-ring motion as each other, which is worse — a shopper could not
  // tell them apart, so the ladder between them meant nothing; "Spectrum Nova"
  // was Prism with two numbers turned up, which is the same failure one
  // tier higher; and "Aurora Pulse" (1,500, the entry rung and the only breath)
  // was cut on sight. The tier now opens at 2,500.
  //
  // THE WHOLE GRADIENT TIER WENT WITH IT — four static two-tone skus at 800 plus
  // Spectrum Nova — and so did the `gradient` field this interface used to
  // carry. It only ever meant "web paints a second hue on the wide layers",
  // which this platform could never do anyway (React Native accepts exactly ONE
  // textShadow per Text: one colour, one radius), so with the skus gone the flag
  // described nothing and was deleted rather than left reading `false` on every
  // row forever.
  { sku: 'glow_ember_flame',     name: 'Blaze', dark: '#FF7D1A', light: '#DC6409', animated: true },
  // #F0ABFC -> #FF3BD4 alongside the web catalogue: the old value was a pastel,
  // and a pastel is precisely what a still fallback cannot afford.
  // Its LIGHT value later moved magenta -> green, again alongside the web
  // catalogue, where the reasoning lives: the spectrum sweep makes this the one
  // sku whose resting hue is free.
  { sku: 'glow_cycle_prism',     name: 'Prism', dark: '#1AFF00', light: '#40D214', animated: true },
  // The top of the shop now that Spectrum Nova is gone.
  { sku: 'glow_orbit_comet',     name: 'Shadow', dark: '#6D5BFF', light: '#4531F6', animated: true },
];

const GLOWS_BY_SKU = new Map(GLOW_LIST.map((g) => [g.sku, g]));

export const GLOWS: readonly GlowDef[] = GLOW_LIST;

/** Definition for a glow sku, or null. Never throws — fed straight off the wire. */
export function getGlow(sku: string | null | undefined): GlowDef | null {
  if (typeof sku !== 'string' || !sku) return null;
  return GLOWS_BY_SKU.get(sku) ?? null;
}

/**
 * The halo colour to paint for a sku on a given surface, or null for "no glow".
 *
 * `onLight` is not a nicety — it is the difference between a visible name and a
 * broken one. A neon that reads on the dark HUD is INVISIBLE on the white
 * between-rounds cards, and the deep tone that reads there looks like dirt on
 * black. Every call site that renders on a light surface must pass it.
 *
 * An unknown sku (a glow shipped to the server before this build) returns null:
 * no glow is correct, a guessed colour is not.
 */
export function resolveGlowColor(
  sku: string | null | undefined,
  onLight = false,
): string | null {
  const glow = getGlow(sku);
  if (!glow) return null;
  return onLight ? glow.light : glow.dark;
}

/**
 * Marker skus -> the pin IMAGE, for the shop's preview thumbnails.
 *
 * A pin is a picture, never a glyph and never a shape drawn in code: the map
 * (web and the mobile WebView alike) draws these exact PNGs, so the shop card
 * has to show the same file or it is advertising something the player will not
 * get. `require` returns Metro's asset handle, which is what <Image source>
 * wants.
 *
 * The files are copies of the web ones (public/pins/gold.png, public/src.png)
 * because Metro only watches mobile/ and /shared — it cannot reach public/.
 * Re-copy them if the web art changes.
 */
export const MARKER_PIN_IMAGES: Record<string, number> = {
  marker_gold_pin: require('../../assets/pins/gold.png'),
  marker_neon_orange_pin: require('../../assets/pins/neonorange.png'),
  marker_neon_pink_pin: require('../../assets/pins/neonpink.png'),
  marker_emerald_pin: require('../../assets/pins/emerald.png'),
  marker_rainbow_pin: require('../../assets/pins/rainbow.png'),
};

/** The pin the map falls back to with no skin equipped — the Default card. */
export const STOCK_PIN_IMAGE: number = require('../../assets/pins/src.png');

export function resolveMarkerPin(sku: string | null | undefined): number | null {
  if (typeof sku !== 'string' || !sku) return null;
  return MARKER_PIN_IMAGES[sku] ?? null;
}
