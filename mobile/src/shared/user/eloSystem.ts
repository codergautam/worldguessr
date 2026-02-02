// Constants
const K = 50; // Scaling factor for Elo rating changes
const c = 500; // Factor for expected outcome calculation
export const INITIAL_ELO = 1000; // Initial Elo rating for new players
export const Ra0 = INITIAL_ELO; // Alias for backwards compatibility

const exponentBase = 1.7;

/**
 * Calculate expected outcome based on player ratings
 */
function expectedOutcome(Ra: number, Rb: number): number {
  const Qa = Math.pow(exponentBase, Ra / c);
  const Qb = Math.pow(exponentBase, Rb / c);
  return Qa / (Qa + Qb);
}

/**
 * Update ELO rating for a player
 */
function updateElo(Ra: number, Rb: number, Pa: number, Pb: number): number {
  const Ea = expectedOutcome(Ra, Rb);

  // https://www.desmos.com/calculator/mwnadmf8e0
  let gainedElo = K * (Pa - Ea - 0.5) + 34 - 3 * Pa;
  if (Pa === 0) {
    gainedElo = Math.min(0, gainedElo); // Curve pokes above 0 at the left side
  }

  // Quadruple the gained Elo if the player wins and their rating is below 2000
  if (Pa === 1 && Ra < 2000) {
    gainedElo *= 4;
  }

  const newRa = Ra + gainedElo;
  return Math.round(newRa);
}

export interface EloOutcome {
  newRating1: number;
  newRating2: number;
}

/**
 * Calculate new ELO ratings for both players after a match
 * @param player1Rating - Current ELO of player 1
 * @param player2Rating - Current ELO of player 2
 * @param winner - 1 if player1 wins, 0 if player2 wins, 0.5 for draw
 * @returns New ratings for both players
 */
export function calculateOutcomes(
  player1Rating: number,
  player2Rating: number,
  winner: 0 | 0.5 | 1
): EloOutcome {
  const player1Outcome = winner === 1 ? 1 : winner === 0.5 ? 0.5 : 0;
  const player2Outcome = 1 - player1Outcome;

  const newRating1 = updateElo(player1Rating, player2Rating, player1Outcome, player2Outcome);
  const newRating2 = updateElo(player2Rating, player1Rating, player2Outcome, player1Outcome);

  return { newRating1, newRating2 };
}

export default calculateOutcomes;
