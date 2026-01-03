import ct from 'countries-and-timezones';

/**
 * Converts an IANA timezone string to ISO 3166-1 alpha-2 country code
 * @param {string} timezone - IANA timezone (e.g., "America/New_York")
 * @returns {string|null} - ISO alpha-2 country code (e.g., "US") or null
 */
export default function timezoneToCountry(timezone) {
  if (!timezone || typeof timezone !== 'string') {
    return null;
  }

  try {
    const timezoneData = ct.getTimezone(timezone);
    if (timezoneData && timezoneData.countries && timezoneData.countries.length > 0) {
      // Return first country associated with timezone
      return timezoneData.countries[0];
    }
  } catch (error) {
    console.error('Error converting timezone to country:', error);
  }

  return null;
}
