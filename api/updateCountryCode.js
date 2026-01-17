import User from '../models/User.js';
import cachegoose from 'recachegoose';
import { VALID_COUNTRY_CODES } from '../serverUtils/timezoneToCountry.js';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { token, countryCode } = req.body;

  // Validate inputs
  if (typeof token !== 'string' || !token) {
    return res.status(400).json({ message: 'Invalid token' });
  }

  // Allow null or empty string to remove flag, or a valid country code string
  if (countryCode !== null && countryCode !== '' && typeof countryCode !== 'string') {
    return res.status(400).json({ message: 'Invalid country code format' });
  }

  // Validate country code format if provided (not empty and not null)
  if (countryCode && countryCode !== '') {
    const upperCode = countryCode.toUpperCase();

    if (!VALID_COUNTRY_CODES.includes(upperCode)) {
      return res.status(400).json({ message: 'Invalid country code. Must be a valid ISO 3166-1 alpha-2 code.' });
    }
  }

  try {
    // Find user by token
    const user = await User.findOne({ secret: token });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user is banned
    if (user.banned) {
      const isActiveBan = user.banType === 'permanent' ||
        (user.banType === 'temporary' && user.banExpiresAt && new Date(user.banExpiresAt) > new Date());
      if (isActiveBan) {
        return res.status(403).json({ message: 'Banned users cannot update their flag' });
      }
    }

    // Update country code
    // Important: Use empty string "" for "user opted out" (not null)
    // null = "not set yet" (will be auto-assigned on next login)
    // "" = "user explicitly removed flag" (won't be auto-assigned)
    const newCountryCode = (countryCode === '' || countryCode === null)
      ? ''  // Always use empty string for removal/opt-out
      : countryCode.toUpperCase();

    user.countryCode = newCountryCode;
    await user.save();

    // Clear caches for this user
    cachegoose.clearCache(`publicData_${user._id.toString()}`, (error) => {
      if (error) {
        console.error('Error clearing publicData cache', error);
      }
    });

    // Clear auth cache so next auth request gets fresh data
    cachegoose.clearCache(`userAuth_${token}`, (error) => {
      if (error) {
        console.error('Error clearing userAuth cache', error);
      }
    });

    return res.status(200).json({ success: true, countryCode: newCountryCode || null });
  } catch (error) {
    console.error('Error updating country code:', error);
    return res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
}
