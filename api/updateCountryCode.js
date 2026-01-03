import User from '../models/User.js';
import cachegoose from 'recachegoose';

// Comprehensive list of valid ISO 3166-1 alpha-2 country codes
const VALID_COUNTRY_CODES = [
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
  'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS',
  'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN',
  'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE',
  'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF',
  'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM',
  'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM',
  'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC',
  'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK',
  'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA',
  'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG',
  'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW',
  'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS',
  'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO',
  'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI',
  'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW'
];

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

    // Clear publicData cache for this user
    cachegoose.clearCache(`publicData_${user._id.toString()}`, (error) => {
      if (error) {
        console.error('Error clearing cache', error);
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
