import CountryFlag from './countryFlag';
import guestNameString from '@/serverUtils/guestNameFromString';

/**
 * Renders username with optional country flag
 * @param {string} username - User's display name
 * @param {string} countryCode - ISO 3166-1 alpha-2 country code (optional)
 * @param {boolean} isGuest - Whether in CoolMath Games environment
 * @param {object} flagStyle - Optional styles for flag
 * @param {object} usernameStyle - Optional styles for username
 */
export default function UsernameWithFlag({
  username,
  countryCode = null,
  isGuest = false,
  flagStyle = {},
  usernameStyle = {}
}) {
  const displayName = isGuest ? guestNameString(username) : username;

  return (
    <>
      {countryCode && <CountryFlag countryCode={countryCode} style={flagStyle} />}
      <span style={usernameStyle}>{displayName}</span>
    </>
  );
}
