/* ===========================================================================
 *  ANIMATED NAME GLOWS, EXPRESSED AS A LAYER TABLE.
 *
 *  This file is the mobile counterpart of styles/nameGlow.css. It is a FAITHFUL
 *  REDUCTION, not a port: the web keyframes interpolate a whole `text-shadow`
 *  LIST — colour, radius, alpha and per-layer offsets all moving at once —
 *  and React Native accepts exactly ONE shadow per <Text>, none of whose
 *  properties can be animated on the native driver.
 *
 *  THE TRICK: DON'T ANIMATE THE SHADOW. ANIMATE WHICH SHADOW YOU CAN SEE.
 *  Every entry below is a FIXED shadow — one colour, one radius, one offset —
 *  rendered by its own fixed Text inside an Animated.View stacked under the
 *  real name. One shared UI-thread clock drives wrapper opacity; no shadow or
 *  layout property changes per frame.
 *
 *  A cross-fade between two fixed layers reads as MOVEMENT, and which movement
 *  depends on what differs between them:
 *    different OFFSET  -> the light travels          (Shadow)
 *    different COLOUR  -> the hue sweeps             (Prism)
 *    different RADIUS  -> the halo breathes          (Blaze)
 *
 *  RULES CARRIED OVER FROM THE WEB FILE, because they are about the eye and not
 *  about CSS:
 *
 *   1. NO STROBES. Amplitude and travel read from across a room; blinking does
 *      not. Every window below is wide enough that neighbouring layers overlap,
 *      so nothing ever snaps on or off. Two skus died on web for breaking this.
 *
 *   2. 32px IS THE RADIUS CEILING, and the reason is sharper here than on web:
 *      a React Native text shadow is clipped by any ancestor with
 *      `overflow: 'hidden'`, and PlayerName's clip relief is sized against this
 *      number. Raise one without the other and the halo gets sheared.
 *
 *   3. NO TWO SKUS SHARE A DURATION — 4.4 / 4.6 / 4.8s, the same three periods
 *      the web file uses, with no whole-number ratio between any pair. Two
 *      glowing names on one duel HUD drift apart instead of marching in step.
 *
 *   4. EIGHT LAYERS IS THE HARD CEILING, and this one is new. Each layer is a
 *      real shadowed Text node, and
 *      four players on a results screen multiply whatever number you pick here
 *      by four. Web can afford twelve hue stops in one shadow list; this cannot.
 *      Where a sku needed more stops than the budget allows, stops were removed
 *      and the WINDOW widened to keep the motion continuous — never by making
 *      the transitions snappier, which would break rule 1.
 *
 *   5. THE LIGHT VARIANT IS ITS OWN PALETTE, exactly as on web. A neon tuned
 *      for the dark HUD is invisible on the white between-rounds cards, and the
 *      mid-band tone that reads there looks like dirt on black. Every sku below
 *      ships both.
 *
 *   5b. AND IT IS ITS OWN AMPLITUDE, MUCH QUIETER THAN THE DARK ONE — PULLED IN
 *      TWICE, OFF THE SAME REPORT. Round one took roughly 30% of the radius and
 *      a third of the peak opacity ("the glows are too strong on white, like on
 *      pins"); round two took another ~25% off the wide layers, because the
 *      guess-pin tooltips were still where it showed. Cumulatively every light
 *      table is about HALF the radius it shipped with. A dark HUD name floats on
 *      a big sheet of glass a halo can bloom into; the light surfaces are SMALL
 *      white cards, so a halo carrying the dark side's amplitude stops reading
 *      as a halo and starts reading as the name leaking. The trim always comes
 *      out of the WIDE washing layers — never out of a spark, a point or a core,
 *      which are the small dense marks that make one sku tell apart from
 *      another. Judge a light table on a between-rounds card, never next to its
 *      dark twin. And when it is still too loud, take the RADIUS down before the
 *      opacity: a fainter wash of the same size is still a wash of that size.
 *
 *  WHEN A SKU'S COLOURS CHANGE IN shared/shop/catalog.js, they change here and
 *  in src/shared/cosmetics.ts in the same commit. Three tables, one fact.
 * ======================================================================== */

/** One fixed shadow, plus when in the loop it is visible. */
export interface GlowLayer {
  /** Shadow colour. Alpha comes from `peak`, never from an 8-digit hex. */
  color: string;
  /** textShadowRadius, px. Bounded by the 32px ceiling (rule 2). */
  radius: number;
  /** textShadowOffset. Positive y is DOWN, same as CSS. */
  dx: number;
  dy: number;
  /**
   * Phase in [0,1) at which this layer is fully lit. Ignored when `always`.
   */
  at: number;
  /**
   * Total width of the lit window as a fraction of the loop. The layer fades
   * linearly in over the first half of it and back out over the second, so
   * `window` of 0.4 means visible for 40% of the lap and at full strength for
   * exactly one instant. Neighbouring layers must overlap (rule 1).
   */
  window: number;
  /** Opacity at the centre of the window. This IS the layer's alpha. */
  peak: number;
  /** Constant layer: always at `peak`, no clock. At most one per sku. */
  always?: boolean;
}

export interface GlowAnim {
  /** One lap, ms. Unique per sku (rule 3). */
  durationMs: number;
  layers: GlowLayer[];
}

/** Eight, and the comment above says why. Asserted at module load. */
const MAX_LAYERS = 8;

/* ---------------------------------------------------------------------------
 *  SHADOW (sold as Comet until Aug 2026) — glow_orbit_comet, 3,000
 *
 *  A bright, tight point of light travels around the name while a soft indigo
 *  halo stays centred and still. Nothing else in the app moves like this, which
 *  is exactly why it is the top of the shop.
 *
 *  SIX POSITIONS, NOT THE WEB'S EIGHT. Straight-line interpolation between six
 *  points on a 5px circle is a hexagon whose worst deviation from true is
 *  0.67px; nobody is measuring that on a 14px name. What six buys is a layer of
 *  headroom for the constant halo inside the eight-layer budget.
 *
 *  THE WINDOW IS 0.42, WHICH IS WHY IT LOOKS LIKE A COMET AND NOT A BLINKING
 *  DOT. At 1/6 spacing a window that wide keeps two and a bit points lit at any
 *  instant, at different strengths — so what the eye actually sees is a bright
 *  head with a fading tail behind it. The web version paints that tail as its
 *  own shadow layer one step behind the head; here the overlap IS the tail, for
 *  free, which is the single best trade in this file.
 *
 *  #EEF0FF ON THE POINT IS THE SANCTIONED NEAR-WHITE, and what sanctions it is
 *  the 3px radius: at that size a pale colour is a point of light rather than a
 *  wash. The same hex on the 20px halo would be the pastel-blooms-to-white
 *  failure the palette rules exist to prevent, which is why the halo is the
 *  saturated indigo instead.
 * ------------------------------------------------------------------------ */
const ORBIT_R = 5;
const ORBIT_POINTS = 6;

function orbitPoints(color: string, radius: number, peak: number): GlowLayer[] {
  const out: GlowLayer[] = [];
  for (let i = 0; i < ORBIT_POINTS; i++) {
    const theta = (i / ORBIT_POINTS) * Math.PI * 2;
    out.push({
      color,
      radius,
      // Rounded to 0.1px: sub-pixel precision no display can show, and the
      // rounding keeps the table readable.
      dx: Math.round(Math.cos(theta) * ORBIT_R * 10) / 10,
      dy: Math.round(Math.sin(theta) * ORBIT_R * 10) / 10,
      at: i / ORBIT_POINTS,
      window: 0.42,
      peak,
    });
  }
  return out;
}

const ORBIT_DARK: GlowAnim = {
  durationMs: 4800,
  layers: [
    // The still halo. Same 20px indigo at 30% the web file paints, and the one
    // `always` layer this sku is allowed.
    { color: '#6D5BFF', radius: 20, dx: 0, dy: 0, at: 0, window: 1, peak: 0.3, always: true },
    ...orbitPoints('#EEF0FF', 3, 1),
  ],
};

// On white, a near-white point is nothing at all, so the travelling light is the
// sku's own indigo tightened to 2px — it reads as a point beside dark glyphs
// rather than as a bruise. Same six-step walk, same window. The halo pulls in to
// 10px because a light surface has no bloom to fight: the halo is DARKER than
// the card, so it is legible at a radius where a dark-surface glow is still
// building, and going wider is how a halo turns into a smudge over black text.
// THE ORBITING POINTS KEPT EVERY NUMBER through BOTH times the light tier came
// down (rule 5b); only the still halo moved, 12px/0.25 -> 10px/0.19 -> 8px/0.14.
// A 2px point is the item, not the wash.
const ORBIT_LIGHT: GlowAnim = {
  durationMs: 4800,
  layers: [
    { color: '#4531F6', radius: 8, dx: 0, dy: 0, at: 0, window: 1, peak: 0.14, always: true },
    ...orbitPoints('#4531F6', 2, 1),
  ],
};

/* ---------------------------------------------------------------------------
 *  PRISM — glow_cycle_prism, 2,500
 *
 *  The whole colour wheel, walked once every 4.4s.
 *
 *  EIGHT HUES, 45 DEGREES APART, against the web's twelve at 30. The lap time is
 *  identical and the lap time is what the eye reads — 550ms a hue here against
 *  367ms there. Eight is what the budget allows and eight is enough, because the
 *  0.30 window keeps two adjacent hues lit at once through every handover, so
 *  the sweep is continuous rather than a series of recognisable cross-fades.
 *
 *  RADIUS ALTERNATES 12 / 22 AROUND THE WHEEL, and that is not decoration. The
 *  web version's second failure was a colour change with NO size change: hue is
 *  the weakest signal peripheral vision has, so from a metre away a 2,500-Stamp
 *  item was "a violet name that sometimes looks blue". Alternating radii make
 *  the halo breathe four times a lap while the hue turns once — two different
 *  periods, so the item never settles into a rhythm the eye can predict and then
 *  stop watching. It is the same fix, spent through the only knob this platform
 *  has.
 *
 *  NO CONSTANT LAYER. This is the one sku where a fixed-hue core would actively
 *  fight the product: a green pin under a rotating wheel. The sweep is the whole
 *  item, so all eight slots go to it.
 * ------------------------------------------------------------------------ */
function hueWheel(hexes: string[], tight: number, wide: number, peak: number): GlowLayer[] {
  return hexes.map((color, i) => ({
    color,
    // Odd stops bloom, even stops pull in: four breaths per lap against one
    // turn of the wheel.
    radius: i % 2 === 0 ? tight : wide,
    dx: 0,
    dy: 0,
    at: i / hexes.length,
    window: 0.3,
    peak,
  }));
}

// Neon weight, spread evenly round the wheel. Same family the web keyframes
// walk, sampled at 45 degrees instead of 30.
const PRISM_DARK: GlowAnim = {
  durationMs: 4400,
  layers: hueWheel(
    ['#FF3BD4', '#FF335C', '#FF7033', '#FFD633', '#C2FF33', '#33FF70', '#33C2FF', '#7033FF'],
    12,
    22,
    0.95,
  ),
};

// PITCHED INTO THE MID BAND — 45-58% lightness at high saturation — not down
// towards black. Eight hues at 30% lightness over a white card are eight shades
// of the same grey-brown: the sweep still happens and nobody can see it happen.
// Lightness is not what makes a colour visible against white; CHROMA is, and
// chroma is what a colour loses on its way to black. Radii pull in for the same
// reason the comet's do.
// 4.5/7.5 AT 0.46, DOWN FROM 6/10 AT 0.62, ITSELF DOWN FROM 8/15 AT 0.9 (rule
// 5b). This was the loudest sku in the light tier on both platforms — a wide,
// near-opaque bloom on a white card — and it stayed the loudest after the first
// trim, which is why it got a second. The BREATH is what survives both:
// tight-to-wide is still a 1.67x radius swing, so the halo pumps four times a
// lap exactly as before. It just does it inside the card instead of across it.
const PRISM_LIGHT: GlowAnim = {
  durationMs: 4400,
  layers: hueWheel(
    ['#F631C5', '#F63163', '#F65F2C', '#DCA809', '#9CC520', '#12D343', '#09A8DC', '#6331F6'],
    4.5,
    7.5,
    0.46,
  ),
};

/* ---------------------------------------------------------------------------
 *  BLAZE — glow_ember_flame, 2,500
 *
 *  A warm halo breathing unevenly, throwing sparks. The upward bias is the
 *  entire difference between "a fire" and "a name with twinkles on it", so both
 *  spark layers travel UP (negative y) and to opposite sides.
 *
 *  THE STOPS ARE UNEVENLY SPACED ON PURPOSE: 0 / 0.27 / 0.62 for the breath and
 *  0.15 / 0.55 for the sparks. Nothing lands on a beat, so the loop never
 *  resolves into a rhythm — the same reason the web version runs an eleven-stop
 *  grid of 7/11/9/13 percent segments instead of an even one.
 *
 *  A SPARK IS ONE LIT MOMENT. It fades up out of nothing at its offset and back
 *  to nothing: appear, climb, gone, which is what an ember does. On web the
 *  climb is a real interpolated journey across five keyframes; here the offset
 *  is fixed and the fade does the work. That is the honest limit of this
 *  platform, and a spark that appears and dies at one point still reads as an
 *  ember because it is small, hot and off-centre — the three things that make it
 *  not-the-halo.
 *
 *  THE SPARKS ARE THE HOTTEST THING IN THE STACK on dark (#FFF3C4 at 2px, 88%
 *  lightness) and the DARKEST on light (#C2410C at 1.5px, 35% against the base's
 *  45%). Same object, opposite background: on black a spark reads by being
 *  brighter than its surroundings, on white by being denser. Getting this
 *  backwards is how a spark becomes an invisible smudge.
 * ------------------------------------------------------------------------ */
const FLAME_DARK: GlowAnim = {
  durationMs: 4600,
  layers: [
    // The breath: one hue, three radii, uneven spacing. 19px is the widest this
    // sku ever gets, matching the web flare.
    { color: '#FF7D1A', radius: 8, dx: 0, dy: 0, at: 0, window: 0.55, peak: 0.85 },
    { color: '#FFA31A', radius: 19, dx: 0, dy: 0, at: 0.27, window: 0.55, peak: 0.95 },
    { color: '#FF5E00', radius: 11, dx: 0, dy: 0, at: 0.62, window: 0.55, peak: 0.8 },
    // Sparks: tight, pale, off-centre, rising. Narrow windows — they are events,
    // not texture — but never so narrow they read as a blink (rule 1).
    { color: '#FFF3C4', radius: 2, dx: 4, dy: -7, at: 0.15, window: 0.22, peak: 1 },
    { color: '#FFF7D4', radius: 2.5, dx: -5.5, dy: -6, at: 0.55, window: 0.22, peak: 1 },
  ],
};

// Mid-band orange and gold rather than the deep end of those hues: the light
// palette used to be three browns a few degrees apart at partial opacity over a
// white card, which is a fire you can only find by being told it is there.
// THE BREATH CAME IN TWICE, THE SPARKS NEVER DID (rule 5b): 4/7.5/5px at
// 0.42/0.46/0.38, down from 5/10/6.5px at 0.55/0.6/0.5, itself down from
// 7/15/9px at 0.8/0.9/0.75. A spark is 1.5-2px and off-centre, so it was never
// part of what read as "too strong on white" — the wide warm wash was, and it
// took two passes to get that wash inside the card.
const FLAME_LIGHT: GlowAnim = {
  durationMs: 4600,
  layers: [
    { color: '#DC6409', radius: 4, dx: 0, dy: 0, at: 0, window: 0.55, peak: 0.42 },
    { color: '#DCA409', radius: 7.5, dx: 0, dy: 0, at: 0.27, window: 0.55, peak: 0.46 },
    { color: '#F0660A', radius: 5, dx: 0, dy: 0, at: 0.62, window: 0.55, peak: 0.38 },
    { color: '#C2410C', radius: 1.5, dx: 3.5, dy: -6, at: 0.15, window: 0.22, peak: 1 },
    { color: '#A8380A', radius: 2, dx: -4.5, dy: -5, at: 0.55, window: 0.22, peak: 1 },
  ],
};

const ANIMS: Record<string, { dark: GlowAnim; light: GlowAnim }> = {
  glow_orbit_comet: { dark: ORBIT_DARK, light: ORBIT_LIGHT },
  glow_cycle_prism: { dark: PRISM_DARK, light: PRISM_LIGHT },
  glow_ember_flame: { dark: FLAME_DARK, light: FLAME_LIGHT },
};

// Rules 2 and 4, enforced rather than described. A table this long is edited by
// hand and "I'll remember the ceiling" is not a mechanism. Dev-only: in
// production a bad table degrades to a slightly expensive glow, which is not
// worth crashing a game over.
if (__DEV__) {
  for (const [sku, pair] of Object.entries(ANIMS)) {
    for (const variant of [pair.dark, pair.light]) {
      if (variant.layers.length > MAX_LAYERS) {
        console.warn(`[glowKeyframes] ${sku} declares ${variant.layers.length} layers, ceiling is ${MAX_LAYERS}`);
      }
      for (const l of variant.layers) {
        if (l.radius > 32) console.warn(`[glowKeyframes] ${sku} layer radius ${l.radius} exceeds the 32px ceiling`);
      }
    }
  }
  const periods = Object.values(ANIMS).map((p) => p.dark.durationMs);
  if (new Set(periods).size !== periods.length) {
    console.warn('[glowKeyframes] two skus share a duration — they will march in step on one HUD (rule 3)');
  }
}

/**
 * The animation for a sku on a surface, or null when it does not animate.
 *
 * Null is the answer for every static sku and for anything unknown — an unknown
 * sku is a glow shipped to the server before this build, and the caller falls
 * back to the static halo in src/shared/cosmetics.ts, which is the same thing
 * this whole tier did before the rig existed.
 */
export function getGlowAnim(sku: string | null | undefined, onLight = false): GlowAnim | null {
  if (typeof sku !== 'string' || !sku) return null;
  const pair = ANIMS[sku];
  if (!pair) return null;
  return onLight ? pair.light : pair.dark;
}

/**
 * The widest radius plus travel any layer of this sku reaches, in px.
 *
 * Informational on its own; what it exists for is to keep GLOW_CLIP_RELIEF
 * below honest when this table is edited.
 */
export function glowReach(anim: GlowAnim | null): number {
  if (!anim) return 0;
  let max = 0;
  for (const l of anim.layers) {
    max = Math.max(max, l.radius + Math.max(Math.abs(l.dx), Math.abs(l.dy)));
  }
  return max;
}

/**
 * How much paint room a glowing name needs on every side, in px.
 *
 * NameGlowHalo also uses this number to grow each decorative Text node's native
 * paint box, then takes it back as padding so the glyph layout does not move.
 * A consumer that deliberately clips a row/card still needs the same allowance
 * at that exact outer boundary or it will shear the escaped halo again.
 *
 * WHERE THIS GOES, AND IT IS NOT WHERE YOU EXPECT. React Native clips at the
 * PADDING box of whichever ancestor sets `overflow: 'hidden'` — so the relief
 * has to be applied to THAT element, not to the name. Padding on a box that
 * does not itself clip buys nothing. The pattern is padding plus an equal
 * negative margin, which grows the clip region while leaving the element's
 * outer size, and therefore the whole layout, byte-for-byte unchanged.
 *
 * 34 rather than the ~25 the table actually reaches, deliberately: it is the
 * same number styles/nameGlow.css contracts to on web (.wg-glow-room) and the
 * same number the shop's preview stage pads by, so one figure covers the app,
 * the site and the storefront. Over-padding a clip region costs nothing — a
 * region with no shadow in it draws no shadow.
 *
 * Vertical-only application is often the right call on a `flex: 1` row; see the
 * note in src/components/multiplayer/PlayerList.tsx, which explains why.
 */
export const GLOW_CLIP_RELIEF = 34;
