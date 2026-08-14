export const DEFAULT_POST_GUESS_SECONDS = 20;
export const RANKED_DUEL_POST_GUESS_SECONDS = 15;

// Ranked 1v1 uses the faster GeoGuessr-style finish. Team modes and casual
// multiplayer keep their existing 20-second window.
export function postGuessSecondsFor(game) {
  const ranked1v1 = game?.public === true
    && game?.duel === true
    && game?.teamDuel !== true
    && game?.teamGame !== true;
  return ranked1v1 ? RANKED_DUEL_POST_GUESS_SECONDS : DEFAULT_POST_GUESS_SECONDS;
}
