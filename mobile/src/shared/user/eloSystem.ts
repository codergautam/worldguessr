// Hand-maintained mirror of the rating constants mobile actually renders with.
// THESE HAVE DRIFTED BEFORE — when components/utils/eloSystem.js changes a
// value mirrored here, change this file in the same commit;
// test/eloSystem.test.js pins the two platforms together.
//
// The rating ARITHMETIC deliberately does not live here. Ratings are computed
// in exactly one place — the server (ws/classes/Game.js via the web module) —
// and every mobile surface renders server-sent numbers (EloChangeDisplay gets
// oldElo/newElo off the wire). A full mirror of the v1 formula and the v2
// calculateTransfer/kFactor/placementSeed math shipped here until Aug 14 2026
// with zero mobile callers; it was deleted rather than kept in sync. If mobile
// ever needs client-side prediction (a pregame "win +X / lose −Y" preview),
// mirror calculateTransfer back from the web module — do not re-derive it.

// League cutoffs on the v2 scale — the single definition on THIS platform;
// ./leagues.ts builds its tier table from these. Mirrors the same constants
// in components/utils/eloSystem.js.
export const EXPLORER_MIN = 800, VOYAGER_MIN = 1000, NOMAD_MIN = 1300, LEGEND_MIN = 1800;

// Where a brand-new account starts before placements have run, and the value
// every "this rating is missing, use the default" fallback must resolve to.
// Mirrors ENTRY_RATING (eloSystem.js) / STARTING_ELO (ratingFlags.js) on web.
//
// STARTING_ELO exists because `?? 1000` was typed by hand across both
// platforms. That was correct on the Season 0 scale and badly wrong on v2,
// where 1000 sits inside VOYAGER (1000-1299) — above roughly 85% of the
// ladder — so an account whose rating failed to load was silently painted as
// a gold-badge Voyager.
export const ENTRY_RATING = 500;
export const STARTING_ELO = ENTRY_RATING;
