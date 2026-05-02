import findCountryLocal from './findCountryLocal';

/**
 * Resolve a country code for a lat/lon. Tries the server first; falls back to
 * the bundled GeoJSON lookup if the server fails or returns empty/Unknown.
 * Returns "Unknown" only if both paths fail (ocean, invalid coords, etc).
 */
export default async function findCountry({ lat, lon }) {
  try {
    const apiUrl = typeof window !== 'undefined' ? window.cConfig?.apiUrl : null;
    if (!apiUrl) throw new Error('apiUrl missing');
    const resp = await fetch(apiUrl + `/api/country?lat=${lat}&lon=${lon}`);
    if (!resp.ok) throw new Error(`non-ok status ${resp.status}`);
    const data = await resp.json();
    const country = data?.address?.country;
    if (typeof country === 'string' && country.length > 0 && country !== 'Unknown') {
      return country;
    }
  } catch (e) {
    // fall through to local
  }
  const local = findCountryLocal({ lat, lon });
  console.log(`[findCountry] local fallback (${lat.toFixed(3)}, ${lon.toFixed(3)}) → ${local}`);
  return local;
}
