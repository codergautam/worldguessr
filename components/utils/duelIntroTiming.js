// Round-1 duel VS → first-guess handoff.
// CSS in globals.scss (.hb-vs-chrome, .hb-corner-enter-*, .streetview--duel-enter,
// .duel-warning-container--exiting) must match these.
//
// Sequence:
//   0ms                 guess starts; bars slide into corners; pano fades in;
//                       VS chrome (same DOM) gets --exiting and dissolves
//   DUEL_INTRO_EXIT_MS  VS / warning chrome unmounts
//   DUEL_PANO_ENTER_MS  pano opacity transition class can clear

/** VS / warning dissolve only — does NOT gate the corner bar slide. */
export const DUEL_INTRO_EXIT_MS = 600;
/** Corner bar slide on guess start (must match .hb-corner-enter-* animation). */
export const DUEL_CORNER_SLIDE_MS = 520;
/** Pano opacity fade-in on round-1 guess (must match .streetview--duel-enter). */
export const DUEL_PANO_ENTER_MS = 750;
