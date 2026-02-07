/**
 * Renders a country flag as an image (works on Windows)
 * Uses flagcdn.com for flag images
 * @param {string} countryCode - ISO 3166-1 alpha-2 country code (e.g., "US")
 * @param {object} style - Optional inline styles for the container
 * @param {number} size - Flag height in em units (default: 1, scales with font size)
 */
export default function CountryFlag({ countryCode, style = {}, size = 1, marginRight = '0.4em' }) {
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
  // Use w80 for good quality at various sizes
  const flagUrl = `https://flagcdn.com/w80/${code}.png`;
  const flagUrl2x = `https://flagcdn.com/w160/${code}.png`;

  // Use 3:2 aspect ratio container - matches most common flag ratio
  const height = size;
  const width = size * 1.5;

  return (
    <img
      src={flagUrl}
      srcSet={`${flagUrl2x} 2x`}
      alt={countryCode}
      title={countryCode}
      style={{
        display: 'inline-block',
        width: `${width}em`,
        height: `${height}em`,
        marginRight: marginRight,
        verticalAlign: 'middle',
        flexShrink: 0,
        objectFit: 'cover',
        borderRadius: '2px',
        ...style
      }}
    />
  );
}
