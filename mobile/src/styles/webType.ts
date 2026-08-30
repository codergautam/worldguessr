/**
 * Ports of the web homepage's type formulas (styles/globals.scss), so the app
 * renders the SAME sizes mobile web does at every viewport. Web sizes its home
 * nav with `min(vw-clamp, vh-clamp)` pairs; 1em = 16px there. Keeping these as
 * formulas rather than breakpoint tables is the point: landscape, tablets and
 * odd aspect ratios land exactly where web lands, with no new tiers to tune.
 *
 * Numbers this replaced (why the app looked "giant" next to mobile web):
 * title 39px vs web ~29px portrait / ~24px landscape; menu rows fixed 24px vs
 * web ~21px portrait / ~18px landscape — and RN additionally honoured the OS
 * font scale, which web ignores entirely. HOME_MAX_FONT_MULT caps that second
 * inflation while leaving accessibility some headroom.
 */

const EM = 16;

function cssClamp(min: number, val: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

/**
 * `.home__title`: max(min(clamp(1.8em, 4vw, 13em), clamp(1.5em, 6vh, 8em)), 1.5 x --homeMenuSize).
 * TITLE_SCALE (Aug 23 user ruling, same idea as NAV_SCALE): the wordmark runs
 * 10% larger than strict web parity in-app. Scale the FORMULA, never hardcode.
 * The floor (Aug 29): the wordmark leads the rail at every viewport, never
 * the menu rows. homeMenuTextSize carries NAV_SCALE and this carries
 * TITLE_SCALE, both 1.1, so the 1.5x ratio is web's.
 */
const TITLE_SCALE = 1.1;
/** `.home__title`'s own formula (web --homeTitleBase), before scale or floor. */
function homeTitleBase(width: number, height: number): number {
  return Math.min(
    cssClamp(1.8 * EM, 0.04 * width, 13 * EM),
    cssClamp(1.5 * EM, 0.06 * height, 8 * EM),
  );
}
export function homeTitleSize(width: number, height: number): number {
  const formula = TITLE_SCALE * homeTitleBase(width, height);
  return Math.round(Math.max(formula, 1.5 * homeMenuTextSize(width, height)));
}

/**
 * NAV_SCALE (Aug 23 user ruling): the menu's type runs 10% larger than strict
 * web parity — at hand-held distance the web-exact size felt too small in-app.
 * Scale the FORMULA, never hardcode sizes back in. It applied to the
 * .g2_nav_text rows; the menu that replaced them (styles/homeMenu.css)
 * inherits it through homeMenuTextSize below.
 */
const NAV_SCALE = 1.1;

/**
 * `--homeMenuSize` (styles/homeMenu.css). Two branches, like the CSS:
 *  - phones / short viewports (web's `(max-height: 680px), (max-width: 600px)`,
 *    = isCompact): min(clamp(1.3rem, 1.85vw, 3.2rem), clamp(1.1rem, 3.4vh, 3rem)),
 *    fixed floors so rows stay tappable while the mark sits at its own floor;
 *  - everything else: clamp(1.3rem, 55% of the mark's formula, 3rem), so the
 *    menu shrinks and grows WITH the wordmark (owner, Aug 29: a menu that
 *    stopped shrinking while the mark kept going was "a bug").
 * ~36px at 1080p, ~47px at 1440p, ~48px at 4K, 21px floor on phones.
 * The one size the home menu is built from: rows are 1x, a glyph 1.05x of
 * its row, the rules' margin 0.3x — ModeItem.tsx derives those, same ratios
 * as the CSS.
 */
export function homeMenuTextSize(width: number, height: number): number {
  const compact = width < 600 || height < 680;
  const size = compact
    ? Math.min(
        cssClamp(1.3 * EM, 0.0185 * width, 3.2 * EM),
        cssClamp(1.1 * EM, 0.034 * height, 3 * EM),
      )
    : cssClamp(1.3 * EM, homeTitleBase(width, height) * 0.55, 3 * EM);
  return Math.round(NAV_SCALE * size);
}

/** `.g2_text`: min(clamp(1.1em, 1.8vw, 2.3em), clamp(0.9em, 2.5vh, 2em)) */
export function smallTextSize(width: number, height: number): number {
  return Math.round(
    Math.min(
      cssClamp(1.1 * EM, 0.018 * width, 2.3 * EM),
      cssClamp(0.9 * EM, 0.025 * height, 2 * EM),
    ),
  );
}

/**
 * Web ignores the OS font-scale setting completely; letting RN apply a 1.3x
 * system scale on top of web-parity sizes reinflates the exact layout this
 * file exists to fix. 1.2 is the middle ground: large-text users still get
 * larger text, and the home layout stays collision-free.
 */
export const HOME_MAX_FONT_MULT = 1.2;
