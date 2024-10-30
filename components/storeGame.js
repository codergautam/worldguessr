import User from '../models/User.js';

const pendingUpdates = []; // Queue to store pending updates

// Function to process pending updates
async function processPendingUpdates() {
  if (pendingUpdates.length === 0) return;

  // Group updates by user secret
  const updatesByUser = {};
  pendingUpdates.forEach(({ secret, xp, timeTaken, latLong }) => {
    if (!updatesByUser[secret]) {
      updatesByUser[secret] = [];
    }
    updatesByUser[secret].push({ xp, timeTaken, latLong });
  });

  for (const secret in updatesByUser) {
    const userUpdates = updatesByUser[secret];
    const user = await User.findOne({ secret });

    if (!user) continue; // Skip if user is not found

    if (user.banned) {
      continue; // Skip banned users
    }

    try {
      userUpdates.forEach(({ xp, timeTaken, latLong }) => {
        user.games.push({
          xp,
          timeTaken,
          latLong,
          time: new Date(),
        });
        user.totalGamesPlayed += 1;
        user.totalXp += xp;
      });
      console.log(`Processed ${userUpdates.length} updates for user ${secret}`);

      await user.save();
    } catch (error) {
      console.error(`Error saving user ${secret}:`, error.message);
    }
  }

  // Clear the pending updates queue after processing
  pendingUpdates.length = 0;
}

// Set an interval to process updates every 30 seconds
setInterval(processPendingUpdates, 30000);

export default async function storeGame(secret, xp, timeTaken, latLong) {
  if (!secret || !xp || !timeTaken || !latLong) {
    return { success: false, message: 'Missing required fields' };
  }
  if (
    typeof secret !== 'string' ||
    typeof xp !== 'number' ||
    typeof timeTaken !== 'number' ||
    !Array.isArray(latLong) ||
    latLong.length !== 2 ||
    typeof latLong[0] !== 'number' ||
    typeof latLong[1] !== 'number'
  ) {
    return { success: false, message: 'Invalid input types or latLong format' };
  }

  // Push the game data to the pending updates queue
  pendingUpdates.push({ secret, xp, timeTaken, latLong });
  return { success: true };
}
