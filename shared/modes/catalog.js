// Quiz mode registry: the ONE place that says what a mode shows, how the
// player answers, and what the answer is. Server (ws/classes/Game.js), web
// client and (later) mobile all read this file; nothing else may hard-code a
// mode's shape.
//
// Pure data, no imports. Metro only watches /shared and /public/locales, so
// anything here that reached into components/ or public/*.json would break the
// mobile bundle (see shared/locations/repeatGuard.js for the same rule).
//
// Field meanings:
//   stimulus  what the player looks at: 'pano' | 'flag' | 'outline' | 'text' | 'image'
//   input     how they answer: 'map' (click the world map) | 'choice' (buttons)
//   target    what counts as right: 'point' (distance), 'country' (polygon),
//             'language' (choice id)
//   pool      which round pool rounds.js draws from
//   missMaxDist  for country targets: the maxDist fed to the distance curve when
//             the click lands outside the answer. 5000 so a neighbouring
//             country 150 km off scores ~3700, not the ~4600 that 20000 pays.
//   maxXpPerRound  ceiling on XP a quiz round may earn (storeGame clamps it).
//             CountryGuessr already uses 20; flags at points/50 would pay
//             ~100 XP per five-second round.
//   group     the Quizzes page's heading for the mode once there are many
//             (locale key quizGroup<Group>)
//   enabled   false = not selectable yet (image modes wait for a manifest)

export const DEFAULT_MODE = 'classic';
// The lobby's "timer off" sentinel (24h in seconds), see ws/ws.js updateGameOptions.
export const NO_TIMER_SECONDS = 60 * 60 * 24;

export const REGIONS = Object.freeze([
  'all',
  'Africa',
  'Asia',
  'Europe',
  'North America',
  'South America',
  'Oceania',
]);

const QUIZ_XP_CAP = 20;

export const MODES = Object.freeze({
  classic: Object.freeze({
    id: 'classic',
    stimulus: 'pano',
    input: 'map',
    target: 'point',
    pool: null,
    defaultTimePerRound: 30,
    defaultRounds: 5,
    timerRequired: false,
    supportsRegion: false,
    maxXpPerRound: 100,
    enabled: true,
  }),
  flags: Object.freeze({
    id: 'flags',
    stimulus: 'flag',
    input: 'map',
    target: 'country',
    pool: 'countries',
    defaultTimePerRound: 20,
    defaultRounds: 10,
    timerRequired: false,
    supportsRegion: true,
    missMaxDist: 5000,
    maxXpPerRound: QUIZ_XP_CAP,
    group: 'countries',
    enabled: true,
  }),
  shapes: Object.freeze({
    id: 'shapes',
    stimulus: 'outline',
    input: 'map',
    target: 'country',
    pool: 'shapes',
    defaultTimePerRound: 30,
    defaultRounds: 10,
    timerRequired: false,
    supportsRegion: true,
    missMaxDist: 5000,
    maxXpPerRound: QUIZ_XP_CAP,
    group: 'countries',
    enabled: true,
  }),
  languages: Object.freeze({
    id: 'languages',
    stimulus: 'text',
    input: 'choice',
    target: 'language',
    pool: 'languages',
    choices: 6,
    defaultTimePerRound: 20,
    defaultRounds: 10,
    timerRequired: true,
    supportsRegion: false,
    maxXpPerRound: QUIZ_XP_CAP,
    group: 'culture',
    enabled: true,
  }),
  landmarks: Object.freeze({
    id: 'landmarks',
    stimulus: 'image',
    input: 'map',
    target: 'point',
    pool: 'manifest',
    defaultTimePerRound: 30,
    defaultRounds: 10,
    timerRequired: false,
    supportsRegion: false,
    maxXpPerRound: QUIZ_XP_CAP,
    group: 'photos',
    enabled: false,
  }),
  animals: Object.freeze({
    id: 'animals',
    stimulus: 'image',
    input: 'map',
    target: 'country',
    pool: 'manifest',
    defaultTimePerRound: 30,
    defaultRounds: 10,
    timerRequired: false,
    supportsRegion: true,
    missMaxDist: 5000,
    maxXpPerRound: QUIZ_XP_CAP,
    group: 'photos',
    enabled: false,
  }),
  food: Object.freeze({
    id: 'food',
    stimulus: 'image',
    input: 'map',
    target: 'country',
    pool: 'manifest',
    defaultTimePerRound: 30,
    defaultRounds: 10,
    timerRequired: false,
    supportsRegion: true,
    missMaxDist: 5000,
    maxXpPerRound: QUIZ_XP_CAP,
    group: 'photos',
    enabled: false,
  }),
});

// null/undefined -> classic (old clients and old saves omit the field);
// an unknown id -> null so callers can reject it.
export function getMode(id) {
  if (id == null || id === '') return MODES[DEFAULT_MODE];
  return MODES[id] || null;
}

export function isQuizMode(id) {
  const spec = getMode(id);
  return !!spec && spec.id !== DEFAULT_MODE;
}

// Does a mode play on a Street View panorama? Only those want the pano, its
// preloads and its loading cover; every other mode brings its own screen.
// An unknown id counts as classic, so a stray value never hides the pano.
export function usesPanorama(id) {
  return (getMode(id) || MODES[DEFAULT_MODE]).stimulus === 'pano';
}

// Selectable by a party host or the singleplayer picker.
export function isSelectableMode(id) {
  const spec = getMode(id);
  return !!spec && spec.enabled;
}

export function isRegion(value) {
  return REGIONS.includes(value);
}

// The single timer rule: a mode whose scoring needs a clock (speed bonus)
// cannot run with the timer off, so the "off" sentinel becomes the mode's
// default. Everything else passes through untouched.
export function effectiveTimePerRound(id, seconds) {
  const spec = getMode(id);
  if (spec && spec.timerRequired && seconds === NO_TIMER_SECONDS) {
    return spec.defaultTimePerRound;
  }
  return seconds;
}
