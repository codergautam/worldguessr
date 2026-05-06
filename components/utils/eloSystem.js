// Constants
const K = 50; // Scaling factor for Elo rating changes
const c = 500; // Factor for expected outcome calculation
export const Ra0 = 1000; // Initial Elo rating for new players

const V = 10; // Bonus factor for victories
const L = 5; // Additional scaling factor for score differences

const exponentBase = 1.7;

// Player rank thresholds
const RANKS = {
  TREKKER: { min: 0, max: 1999 },
  EXPLORER: { min: 2000, max: 4999 },
  VOYAGER: { min: 5000, max: 7999 },
  NOMAD: { min: 8000, max: 20000 }
};

// Here are some alternative thresholds that are more inline 
// with the standard ELO rating system, where having over 2000 ELO is 
// considered being a very experienced player
// I recommend making a new player start with around 50 ELO

// // Player rank thresholds
// const RANKS = {
//   TREKKER: { min: 0, max: 249 },
//   EXPLORER: { min: 250, max: 499 },
//   VOYAGER: { min: 1000, max: 1999 },
//   NOMAD: { min: 2000, max: 20000 }
// };


// Get dynamic K factor based on player's rating tier
function getDynamicK(rating) {
  if (rating >= RANKS.NOMAD.min) return 16;      // Nomad: minimal changes
  if (rating >= RANKS.VOYAGER.min) return 24;    // Voyager: moderate changes
  if (rating >= RANKS.EXPLORER.min) return 32;   // Explorer: larger changes
  return 40;                                      // Trekker: significant changes
}

// Function to calculate expected outcome
function expectedOutcome(Ra, Rb) {
  const Qa = Math.pow(exponentBase, Ra / c);
  const Qb = Math.pow(exponentBase, Rb / c);
  return Qa / (Qa + Qb);
}

// Function to update Elo rating
function updateElo(Ra, Rb, Pa, Pb) {
  const Ea = expectedOutcome(Ra, Rb);
  const K = getDynamicK(Ra);

  //https://www.desmos.com/calculator/mwnadmf8e0 
  let gainedElo = K * (Pa - Ea - 0.5) + 34 - 3 * Pa;
  if(Pa === 0)
    gainedElo = Math.min(0, gainedElo); //curve pokes above 0 at the left side


  // Penalty multiplier for upset losses (losing to much lower-rated player)
  if (Pa === 0 && Ra > Rb) {
    const ratingDiff = Ra - Rb;
    const upsetPenalty = Math.min(ratingDiff / 200, 1.5); // Max 1.5x penalty
    gainedElo *= (1 + upsetPenalty);
  }

    // Bonus multiplier for upset wins (beating much higher-rated player)
  if (Pa === 1 && Ra < Rb) {
    const ratingDiff = Rb - Ra;
    const upsetBonus = Math.min(ratingDiff / 400, 1); // Max 1x bonus
    gainedElo *= (1 + upsetBonus * 0.5);
  }

  let newRa = Ra + gainedElo;
  // Ensure rating never goes below 0
  newRa = Math.max(0, newRa);

  return Math.round(newRa);
}

export default function calculateOutcomes(player1Rating, player2Rating, winner) {
  const player1Outcome = winner === 1 ? 1 : winner === 0.5 ? 0.5 : 0; //1 if player1 wins
  const player2Outcome = 1 - player1Outcome;

  const newRating1 = updateElo(player1Rating, player2Rating, player1Outcome, player2Outcome);
  const newRating2 = updateElo(player2Rating, player1Rating, player2Outcome, player1Outcome);

  return { newRating1, newRating2 };
}
