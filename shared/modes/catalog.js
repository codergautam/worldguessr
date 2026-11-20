// Thin re-export: the quiz core lives in @mapfinder/quiz-kit/core (one source of
// truth for WG and MapFinder). Keep this path: ws/, api/, scripts/ and tests import it.
export {
  DEFAULT_MODE, MODES, NO_TIMER_SECONDS, REGIONS, effectiveTimePerRound, getMode, isQuizMode, isRegion, isSelectableMode, usesPanorama,
} from '@mapfinder/quiz-kit/core';

// Quiz parties are switched off for now (singleplayer first). True brings back
// the Party button on the quiz hub, the Game row in the party options and the
// server accepting a quiz mode for a party.
export const QUIZ_PARTIES = false;
