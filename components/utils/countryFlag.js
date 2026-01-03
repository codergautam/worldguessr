import { useEffect, useRef } from 'react';
import twemoji from 'twemoji';

/**
 * Renders a country flag emoji using Twemoji for cross-platform consistency
 * @param {string} countryCode - ISO 3166-1 alpha-2 country code (e.g., "US")
 * @param {object} style - Optional inline styles
 */
export default function CountryFlag({ countryCode, style = {} }) {
  const flagRef = useRef(null);

  useEffect(() => {
    if (flagRef.current && countryCode) {
      // Parse emoji to Twemoji image
      twemoji.parse(flagRef.current, {
        folder: 'svg',
        ext: '.svg'
      });
    }
  }, [countryCode]);

  // Return null if no country code or empty string (user opted out)
  if (!countryCode || countryCode === '') {
    return null;
  }

  // Validate country code format
  if (typeof countryCode !== 'string' || countryCode.length !== 2) {
    return null;
  }

  // Convert country code to regional indicator symbols (emoji flags)
  // Formula: Each letter A-Z maps to Unicode Regional Indicator Symbol A-Z
  // 0x1F1E6 is the code for Regional Indicator Symbol Letter A
  const flag = String.fromCodePoint(
    ...[...countryCode.toUpperCase()].map(c => 0x1F1E6 - 65 + c.charCodeAt(0))
  );

  return (
    <span
      ref={flagRef}
      style={{
        display: 'inline-block',
        marginRight: '6px',
        fontSize: '1.2em',
        lineHeight: 1,
        verticalAlign: 'middle',
        ...style
      }}
      title={countryCode}
    >
      {flag}
    </span>
  );
}
