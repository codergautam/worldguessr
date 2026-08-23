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
 * `.home__title`: min(clamp(1.8em, 4vw, 13em), clamp(1.5em, 6vh, 8em)).
 * TITLE_SCALE (Aug 23 user ruling, same idea as NAV_SCALE): the wordmark runs
 * 10% larger than strict web parity in-app. Scale the FORMULA, never hardcode.
 */
const TITLE_SCALE = 1.1;
export function homeTitleSize(width: number, height: number): number {
  return Math.round(
    TITLE_SCALE *
      Math.min(
        cssClamp(1.8 * EM, 0.04 * width, 13 * EM),
        cssClamp(1.5 * EM, 0.06 * height, 8 * EM),
      ),
  );
}

/**
 * `.g2_nav_text`: min(clamp(1.3em, 2.5vw, 4em), clamp(1.1em, 3.5vh, 3.2em)).
 * NAV_SCALE (Aug 23 user ruling): menu rows run 10% larger than strict web
 * parity — at hand-held distance the web-exact ~21px felt too small in-app.
 * Scale the FORMULA, never hardcode sizes back in.
 */
const NAV_SCALE = 1.1;
export function navTextSize(width: number, height: number): number {
  return Math.round(
    NAV_SCALE *
      Math.min(
        cssClamp(1.3 * EM, 0.025 * width, 4 * EM),
        cssClamp(1.1 * EM, 0.035 * height, 3.2 * EM),
      ),
  );
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
