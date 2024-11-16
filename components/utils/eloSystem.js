// Constants
const K = 32; // Scaling factor for Elo rating changes
const c = 500; // Factor for expected outcome calculation
const Rmin = 100; // Minimum Elo rating to avoid negative experiences
export const Ra0 = 1000; // Initial Elo rating for new players
const V = 10; // Bonus factor for victories
const L =5; // Additional scaling factor for score differences
const maxElo = 10000;

// Function to calculate expected outcome
function expectedOutcome(Ra, Rb) {
  const Qa = Math.pow(10, Ra / c);
  const Qb = Math.pow(10, Rb / c);
  return Qa / (Qa + Qb);
}

// Function to update Elo rating
function updateElo(Ra, Rb, Sa, Pa, Pb) {
  const Ea = expectedOutcome(Ra, Rb);
  const scoreFactor = Pa / (Pa + Pb);
  const victoryBonus = Sa * V;
  const newRa = Ra + K * (Sa - Ea) + L * scoreFactor + victoryBonus;
  return Math.min(maxElo, Math.round(Math.max(newRa, Rmin))); // Ensure rating doesn't drop below Rmin
}
export default function calculateOutcomes(player1Rating, player2Rating, winner) {
  const player1Outcome = winner === 1 ? 1 : winner === 0.5 ? 0.5 : 0;
  const player2Outcome = 1 - player1Outcome;

  const newRating1 = updateElo(player1Rating, player2Rating, player1Outcome ,player1Outcome, player2Outcome);
  const newRating2 = updateElo(player2Rating, player1Rating, player2Outcome,player1Outcome, player2Outcome);

  return { newRating1, newRating2 };
}
