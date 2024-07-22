// Constants
const K = 32; // Scaling factor for Elo rating changes
const c = 400; // Factor for expected outcome calculation
const Rmin = 100; // Minimum Elo rating to avoid negative experiences
export const Ra0 = 1000; // Initial Elo rating for new players
const V = 10; // Bonus factor for victories
const L = 5; // Additional scaling factor for score differences

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
  return Math.max(newRa, Rmin); // Ensure rating doesn't drop below Rmin
}

// // Example usage
// const playerA = { name: 'Player A', rating: 1500 };
// const playerB = { name: 'Player B', rating: 1480 };

// const pointsA = 320; // Points scored by Player A
// const pointsB = 2596; // Points scored by Player B
// const matchOutcomeA = 0;

// const newRatingA = updateElo(playerA.rating, playerB.rating, matchOutcomeA, pointsA, pointsB);
// const newRatingB = updateElo(playerB.rating, playerA.rating, 1 - matchOutcomeA, pointsB, pointsA);

// console.log(`${playerA.name}'s new rating: ${newRatingA}`);
// console.log(`${playerB.name}'s new rating: ${newRatingB}`);

export default function calculateOutcomes(player1Rating, player2Rating, player1Score, player2Score) {
  const player1Outcome = player1Score > player2Score ? 1 : player1Score === player2Score ? 0.5 : 0;
  const player2Outcome = 1 - player1Outcome;

  const newRating1 = updateElo(player1Rating, player2Rating, player1Outcome, player1Score, player2Score);
  const newRating2 = updateElo(player2Rating, player1Rating, player2Outcome, player2Score, player1Score);

  return { newRating1, newRating2 };
}