// Constants
const K = 50; // Scaling factor for Elo rating changes
const c = 500; // Factor for expected outcome calculation
const Rmin = 100; // Minimum Elo rating to avoid negative experiences
export const Ra0 = 1000; // Initial Elo rating for new players

const V = 10; // Bonus factor for victories
const L = 5; // Additional scaling factor for score differences

const maxElo = 10000;
const exponentBase = 1.7;

// Function to calculate expected outcome
function expectedOutcome(Ra, Rb) {
  const Qa = Math.pow(exponentBase, Ra / c);
  const Qb = Math.pow(exponentBase, Rb / c);
  return Qa / (Qa + Qb);
}

// Function to update Elo rating
function updateElo(Ra, Rb, Pa, Pb) {
  const Ea = expectedOutcome(Ra, Rb);

  //https://www.desmos.com/calculator/mwnadmf8e0 
  let gainedElo = K * (Pa - Ea - 0.5) + 34 - 3 * Pa;
  if(Pa === 0)
    gainedElo = Math.min(0, gainedElo); //curve pokes above 0 at the left side

  // Quadruple the gained Elo if the player wins and their rating is below 2000
  if (Pa === 1 && Ra < 2000) {
    gainedElo *= 4;
  }

  const newRa = Ra + gainedElo;
  return Math.min(maxElo, Math.round(Math.max(newRa, Rmin))); // Ensure rating doesn't drop below Rmin
}

export default function calculateOutcomes(player1Rating, player2Rating, winner) {
  const player1Outcome = winner === 1 ? 1 : winner === 0.5 ? 0.5 : 0; //1 if player1 wins
  const player2Outcome = 1 - player1Outcome;

  const newRating1 = updateElo(player1Rating, player2Rating, player1Outcome, player2Outcome);
  const newRating2 = updateElo(player2Rating, player1Rating, player2Outcome, player1Outcome);

  return { newRating1, newRating2 };
}
