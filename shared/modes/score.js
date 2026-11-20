// Thin re-export: the quiz core lives in @mapfinder/quiz-kit/core (one source of
// truth for WG and MapFinder). Keep this path: ws/, api/, scripts/ and tests import it.
export {
  MAX_TRIES, TRY_POINTS, choicePoints, haversineKm, pointsForDistance, scoreGuess, scoreGuessDetailed,
} from '@mapfinder/quiz-kit/core';
