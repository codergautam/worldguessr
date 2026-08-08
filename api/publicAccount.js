import User from '../models/User.js';

export const USERNAME_CHANGE_COOLDOWN = 30 * 24 * 60 * 60 * 1000; // 30 days

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Extract the user ID from the request body
  const { id } = req.body;
  
  // Validate user ID
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ message: 'Valid user ID is required' });
  }

  try {
    // Find user by the provided ID only (no secrets in public endpoints)
    const user = await User.findById(id).cache(20, `publicData_${id}`);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
// convert lastNameChange to number
    const lastNameChange = user.lastNameChange ? new Date(user.lastNameChange).getTime() : 0;


    // Get public data
    const publicData = {
      username: user.username,
      totalXp: user.totalXp,
      createdAt: user.created_at,
      gamesLen: user.totalGamesPlayed || 0,
      lastLogin: user.lastLogin || user.created_at,
      canChangeUsername: !user.lastNameChange || Date.now() - lastNameChange > USERNAME_CHANGE_COOLDOWN,
      daysUntilNameChange: lastNameChange ? Math.max(0, Math.ceil((lastNameChange + USERNAME_CHANGE_COOLDOWN - Date.now()) / (24 * 60 * 60 * 1000))) : 0,
      recentChange: user.lastNameChange ? Date.now() - lastNameChange < 24 * 60 * 60 * 1000 : false,
      countryCode: user.countryCode || null,
      // Entitlements. Mobile's refreshAccount() reads this endpoint, so without
      // them a purchase or an equip is invisible until the app is restarted.
      // Only the EQUIPPED items are exposed, never the owned list — what a
      // player has equipped is already rendered publicly next to their name;
      // their full inventory is not.
      // The 20s cache above is keyed `publicData_<id>` precisely so
      // api/stampShop.js can clear it the moment either one changes.
      stamps: user.stamps || 0,
      cosmetics: {
        equipped: {
          background: user.cosmetics?.equipped?.background || null,
          nameGlow: user.cosmetics?.equipped?.nameGlow || null,
          markerSkin: user.cosmetics?.equipped?.markerSkin || null,
        },
      },
    };

    // Return the public data
    return res.status(200).json(publicData);
} catch (error) {
    return res.status(500).json({ message: 'An error occurred', error: error.message });
  }
}
