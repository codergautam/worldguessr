/**
 * Renders a country flag as an image (works on Windows)
 * Uses flagcdn.com for flag images
 * @param {string} countryCode - ISO 3166-1 alpha-2 country code (e.g., "US")
 * @param {object} style - Optional inline styles
 * @param {number} size - Flag width in pixels (default: 24, supported: 20, 40, 80, 160, 320)
 */
export default function CountryFlag({ countryCode, style = {}, size = 24 }) {
  // Return null if no country code or empty string (user opted out)
  if (!countryCode || countryCode === '') {
    return null;
  }

  // Validate country code format
  if (typeof countryCode !== 'string' || countryCode.length !== 2) {
    return null;
  }

  const code = countryCode.toLowerCase();
  // Use flagcdn.com with width-based URLs (supported widths: 20, 40, 80, 160, 320, 640)
  // Use w40 for 1x and w80 for 2x retina displays
  const flagUrl = `https://flagcdn.com/w40/${code}.png`;
  const flagUrl2x = `https://flagcdn.com/w80/${code}.png`;

  return (
    <img
      src={flagUrl}
      srcSet={`${flagUrl2x} 2x`}
      alt={countryCode}
      title={countryCode}
      style={{
        display: 'inline-block',
        marginRight: '6px',
        height: `${size}px`,
        width: 'auto',
        verticalAlign: 'middle',
        ...style
      }}
    />
  );
}
