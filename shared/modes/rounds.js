// Thin re-export: the quiz core lives in @mapfinder/quiz-kit/core (one source of
// truth for WG and MapFinder). Keep this path: ws/, api/, scripts/ and tests import it.
export {
  choicePoint, generateRounds, pickLanguageChoices, poolSize, seededRng,
} from '@mapfinder/quiz-kit/core';
