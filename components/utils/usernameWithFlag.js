import CountryFlag from './countryFlag';
import guestNameString from '@/serverUtils/guestNameFromString';
import { getItem } from '@/shared/shop/catalog';

/* ===========================================================================
 *  Shop name glows — THE shared recipe
 *
 *  Every glowing name on the site goes through the helpers below so the halo
 *  looks identical on the HUD, in the party lobby, on the summary screens and
 *  inside a Leaflet tooltip. Two hard rules:
 *
 *   1. The glow is strictly ADDITIVE. It only ever emits `text-shadow` (plus
 *      two custom properties the animated classes read). It NEVER emits
 *      `color` — the name's fill stays whatever the surface already decided
 *      (white on the HUD, league-coloured, black in a tooltip, or the forced
 *      cyan/red/green some screens use).
 *   2. Light surfaces need `glowLight`, not `glowDark`. A neon tuned for dark
 *      glass is invisible on a white leaflet tooltip and reads as dirt on a
 *      white leaderboard card, so the surface is an explicit argument with no
 *      "guess it" fallback.
 *
 *  The STATIC halo is always an inline style, never a class. The classes in
 *  styles/nameGlow.css do two things and only two: put the animated skus in
 *  motion, and keep the carrier the halo rides on OUT OF LAYOUT.
 *
 *  "INLINE IS REQUIRED" IS NOT "A CLASS IS FORBIDDEN", AND READING IT THAT WAY
 *  COST THE ANIMATED TIER ITS MOTION ON EVERY GUESS PIN. The inline stack is
 *  what survives where a stylesheet does not; the class is the ONLY way to reach
 *  a @keyframes, which cannot be an inline style at all. A surface that emits
 *  the shadow alone therefore sells an animated sku and renders it dead — which
 *  is exactly what the Leaflet pin tooltips and popups did until they were moved
 *  onto the nameGlowProps pair. Emit BOTH, everywhere. The class is inert where
 *  the stylesheet is missing, and the inline halo underneath is the fallback.
 *  (The mobile embed is no longer such a place: embed/entry.jsx injects
 *  nameGlow.css alongside Leaflet's own.)
 * ======================================================================== */

export const GLOW_DARK = 'dark';
export const GLOW_LIGHT = 'light';

// The animated skus (catalog `animated: true`) layer a keyframed shadow over
// the static one. Keyframed declarations outrank inline style in the cascade,
// so the animation simply takes over while it runs — and where the stylesheet
// never arrives (embed) the inline static glow is what you get.
// REGISTRY ONLY — the shadow recipe above and below this block is untouched.
// A sku listed here must have a matching @keyframes rule in styles/nameGlow.css
// and `animated: true` in shared/shop/catalog.js; a sku missing from here is
// sold as animated and renders static everywhere.
const ANIMATED_GLOW_CLASS = {
  glow_ember_flame: 'wg-nameglow--flame',
  glow_cycle_prism: 'wg-nameglow--cycle',
  glow_orbit_comet: 'wg-nameglow--orbit',
};

/** Hex for a glow sku on a given surface, or null (unknown/non-glow sku). */
export function glowColorFor(sku, surface = GLOW_DARK) {
  if (!sku) return null;
  const item = getItem(sku);
  if (!item || item.type !== 'glow') return null;
  return (surface === GLOW_LIGHT ? item.glowLight : item.glowDark) || null;
}

/**
 * The shadow stack itself, or null. Same idiom as the league-coloured "(elo)"
 * suffix the duel bars and the party lobby already render
 * (`0 0 10px <color>60`), widened into a halo on dark glass and pulled in to a
 * shorter version of the same four layers on white — a wide bloom on white
 * reads as smudge.
 *
 * The dark stack ends with the plain black drop shadow `.player-name` already
 * carries. `text-shadow` does not merge: the moment a glowing name sets its
 * own, the inherited legibility shadow is gone, and white-on-glass names go
 * soft over a bright backdrop. Re-stating it costs nothing (it is invisible
 * against dark pixels) and keeps a purchase from degrading readability.
 *
 * Use this directly wherever a class cannot follow (Leaflet tooltips/popups,
 * which are portalled outside the React tree and, on mobile, outside the
 * stylesheet entirely).
 */
export function nameGlowShadow(sku, surface = GLOW_DARK) {
  const c = glowColorFor(sku, surface);
  if (!c) return null;
  // ONE COLOUR, FOUR LAYERS. This used to paint the TIGHT layers in `c` and the
  // WIDE ones in a second hex, resolved by a sibling helper, for the gradient
  // tier. That tier is gone, and with it the only data that ever made the two
  // differ — the outer colour resolved to `c` for every surviving sku, on every
  // surface — so the second colour, its two catalogue columns and its resolver
  // were deleted rather than left as a branch with nothing to exercise it. The
  // strings below are character-for-character what they emitted before: same
  // layers, same radii, same alphas.
  //
  // THE TIGHTEST LAYER IS FULLY OPAQUE ON BOTH SURFACES, and it is the single
  // thing that keeps these skus telling apart. A translucent innermost ring
  // blends toward whatever is behind it at the glyph edge, and once that
  // happens every hue arrives at the same place: toward WHITE on the dark
  // surface (pastels blooming out), and toward GREY on the light one, because
  // a low-alpha colour over a white card is just a paler version of itself and
  // paler-plus-white is where hue goes to die. An opaque core pins the hue
  // right against the letterform and the wider translucent layers carry it
  // outward from something that is already unambiguously coloured.
  //
  // The light stack is the SAME FOUR LAYERS, much shorter: 9px of total reach
  // against the dark stack's 24, and alphas that fall away far faster
  // (8C/2E/12 against E6/80/40). A light surface needs less reach because it
  // has no bloom to fight — the halo is DARKER than the card, so it is legible
  // at a radius where a dark-surface glow would still be building. Going wider
  // here is how a halo turns into a smudge over black text. Both numbers stay
  // well under the 32px painted-radius contract styles/nameGlow.css documents.
  //
  // IT HAS NOW BEEN PULLED IN TWICE, OFF THE SAME REPORT, AND THE SECOND PASS IS
  // THE INTERESTING ONE. It started at 5/11/18px at CC/66/33, came to
  // 4/8/13px at A6/40/1A ("the glows are too strong on white, like on pins"),
  // and is now 3.5/6/9px at 8C/2E/12 because that was still too strong on the
  // one surface that matters most. THE JUDGING SURFACE IS THE SMALLEST ONE: a
  // Leaflet guess-pin tooltip is a ~90x22px white box, so any layer whose radius
  // approaches the box's own half-height stops being a halo around the label and
  // becomes the label bleeding out past every edge of the chrome — and three of
  // those on one results map is fog rather than four names. 9px of reach on a
  // ~13px cap-height name is a rim that hugs the glyphs; 13px was not.
  //
  // THE LESSON, IF THIS EVER READS TOO STRONG AGAIN: the number that offends is
  // the OUTERMOST radius, not the alpha ladder. Halving alpha on a wide layer
  // leaves a wash of the same SIZE, just fainter, and a faint wash the size of
  // the tooltip still reads as leakage. Pull the radius in first, then take the
  // alpha down to match.
  //
  // THE FIX CAME OUT OF THE WIDE LAYERS AND NOT THE CORE, which is rule 3b in
  // styles/nameGlow.css and is the whole reason this still looks like nine
  // different items. The 2px innermost ring stays FULLY OPAQUE: it is what pins
  // the hue against the letterform, and the moment it goes translucent over a
  // white card every sku resolves toward the card and turns into the same grey
  // rim. Softening a light halo means less REACH and less alpha further out,
  // never a paler edge.
  //
  // The light branch emits NO black legibility layer: light surfaces draw dark
  // text, where a black drop shadow is dirt rather than legibility. The dark
  // branch's trailing `0 2px 4px rgba(0,0,0,0.85)` is the shadow `.player-name`
  // already carries, restated because text-shadow does not merge.
  return surface === GLOW_LIGHT
    ? `0 0 2px ${c}, 0 0 3.5px ${c}8C, 0 0 6px ${c}2E, 0 0 9px ${c}12`
    : `0 0 2px ${c}, 0 0 6px ${c}E6, 0 0 14px ${c}80, 0 0 24px ${c}40, 0 2px 4px rgba(0,0,0,0.85)`;
}

/**
 * Everything a DOM node needs to wear a glow: `{ className, style }`, or null
 * when the sku is absent/unknown. `style` carries the static stack plus the
 * two custom properties the animated keyframes interpolate between.
 *
 * A GLOW ADDS PAINT AND NOTHING ELSE — no width, no wrapping, no ellipsis, no
 * shrink. By default `className` is the BOXLESS carrier `.wg-nameglow`
 * (`display: contents`), so wrapping a name in it is layout-invisible: the text
 * lays out as a direct child of whatever the parent was and the halo arrives by
 * inheritance. This is the fix for "buying a glow makes my name a bit
 * narrower"; styles/nameGlow.css has the full autopsy.
 *
 * `ownBox: true` FOR A CALLER THAT ALREADY HAS THE ELEMENT — a name box with
 * its own `overflow: hidden` for an ellipsis, which is the only kind of box
 * that can shear a halo. The carrier class is dropped (that box must keep its
 * own display), and the caller is responsible for putting `wg-name-clip` (or
 * `wg-glow-room`, if it declares its truncation in a stylesheet) on it —
 * UNCONDITIONALLY, glow or not, so the box is the same box either way.
 *
 * `animated: false` suppresses the keyframes and leaves the static halo. Pass
 * it from LONG or VIRTUALISED lists — leaderboards, chat logs, history. A
 * `text-shadow` animation is main-thread PAINT, so a hundred of them on one
 * screen is a hundred repaints a frame; the same reasoning caps the mobile rig
 * (mobile/src/components/PlayerName.tsx `animated`). Bounded surfaces — a HUD,
 * a lobby, your own name in the navbar — keep the motion they were sold.
 */
export function nameGlowProps(sku, surface = GLOW_DARK, { animated = true, ownBox = false } = {}) {
  const shadow = nameGlowShadow(sku, surface);
  if (!shadow) return null;
  const c = glowColorFor(sku, surface);
  const anim = animated && ANIMATED_GLOW_CLASS[sku]
    ? `${ANIMATED_GLOW_CLASS[sku]} wg-nameglow--${surface}`
    : null;
  return {
    // Empty only for a static sku on a caller's own box — where there is
    // genuinely no class to add, and `undefined` keeps a stray "" off the DOM.
    className: [ownBox ? null : 'wg-nameglow', anim].filter(Boolean).join(' ') || undefined,
    style: {
      textShadow: shadow,
      '--wg-glow': c,
      '--wg-glow-soft': `${c}${surface === GLOW_LIGHT ? '40' : '60'}`,
    },
  };
}

/**
 * Wrap a bare name in its glow, or hand it back untouched.
 *
 * Four surfaces (the navbar pill, the public profile header, the account modal
 * title, the Hall of Fame row) each wrote the identical
 * `glow ? <span …>{name}</span> : name` ternary, and each one was a chance to
 * forget the carrier class and reintroduce the layout the glow is not allowed
 * to have. There is one of them now.
 *
 * Only for glows from `nameGlowProps(...)` WITHOUT `ownBox` — the span it makes
 * is the boxless carrier and must not be handed layout styles.
 */
export function GlowName({ glow, children }) {
  if (!glow) return children;
  return <span className={glow.className} style={glow.style}>{children}</span>;
}

/**
 * nameGlowProps, memoised for LIST rendering.
 *
 * The props are a pure function of (sku, surface, animated) and there are nine
 * skus, so the whole reachable result set is a handful of frozen objects — but a
 * hundred-row chat log or leaderboard calling nameGlowProps per row per render
 * mints a hundred fresh style objects each time, every one of which is a new
 * identity that defeats any memo downstream of it.
 *
 * This is the same cache components/shop/ItemPreview.js kept privately for the
 * storefront, lifted here so the surfaces that actually render at list scale can
 * share it instead of each growing their own.
 */
const GLOW_PROPS_CACHE = new Map();

export function cachedNameGlowProps(sku, surface = GLOW_DARK, { animated = true, ownBox = false } = {}) {
  if (!sku) return null;
  const key = `${sku}|${surface}|${animated ? 1 : 0}|${ownBox ? 1 : 0}`;
  if (!GLOW_PROPS_CACHE.has(key)) {
    GLOW_PROPS_CACHE.set(key, nameGlowProps(sku, surface, { animated, ownBox }));
  }
  return GLOW_PROPS_CACHE.get(key);
}

// THE TRUNCATION THAT USED TO LIVE HERE IS DELETED, and its deletion is the fix
// rather than a side effect of one. It was a six-property inline recipe
// (`display: inline-block; max-width: 100%; overflow: hidden; text-overflow:
// ellipsis; white-space: nowrap; min-width: 0`) applied to the name ONLY WHEN A
// GLOW RESOLVED — so a player who bought one got a different box from the player
// beside him who had not: `min-width: 0` let it shrink past the min-content
// floor bare text holds, `inline-block` + `nowrap` swapped wrapping for an
// ellipsis, and promoting a text node to an element split the anonymous flex
// item it shared with the "#3 - " in front of it, so the row's `gap` started
// firing. All of that reads, correctly, as "my name got a bit narrower when I
// equipped a glow".
//
// Truncation is a property of the SURFACE, not of a purchase. Where a username
// has to ellipsise, the surface says so on its own box — `wg-name-clip`
// (styles/nameGlow.css), applied whether or not anything is equipped, which is
// also where the halo's 34px of clip relief comes from.
//
/**
 * Renders username with optional country flag
 * @param {string} username - User's display name
 * @param {string} countryCode - ISO 3166-1 alpha-2 country code (optional)
 * @param {boolean} isGuest - Whether in CoolMath Games environment
 * @param {object} flagStyle - Optional styles for flag
 * @param {object} usernameStyle - Optional styles for username
 * @param {string} nameGlow - Equipped glow sku (cosmetics.equipped.nameGlow)
 * @param {'dark'|'light'} glowSurface - Which glow variant this surface needs
 * @param {boolean} animatedGlow - false in long/virtualised lists (see nameGlowProps)
 */
export default function UsernameWithFlag({
  username,
  countryCode = null,
  isGuest = false,
  flagStyle = {},
  usernameStyle = {},
  nameGlow = null,
  glowSurface = GLOW_DARK,
  animatedGlow = true
}) {
  const displayName = isGuest ? guestNameString(username) : username;
  const glow = nameGlowProps(nameGlow, glowSurface, { animated: animatedGlow });
  // `usernameStyle` gets a REAL box, and it gets its own, INSIDE the glow's.
  // The two cannot share one element: the glow's carrier is `display: contents`
  // and would silently drop a background, a padding or a width handed to it.
  // Nested, each does its own job and the halo still reaches the text — it is a
  // `text-shadow`, and text-shadow inherits.
  const named = Object.keys(usernameStyle || {}).length > 0
    ? <span style={usernameStyle}>{displayName}</span>
    : displayName;

  return (
    <>
      {/* No wrapper when there is no glow, and a boxless one when there is:
          either way the name lays out exactly as the bare text node did. */}
      <GlowName glow={glow}>{named}</GlowName>
      {countryCode && ' '}
      {countryCode && <CountryFlag countryCode={countryCode} marginRight="0" style={flagStyle} />}
    </>
  );
}
