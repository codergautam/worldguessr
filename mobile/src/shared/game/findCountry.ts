import { SITE_URL } from '../../constants/config';
import { buildCountryIndex, lookupCountry, type CountryIndexEntry } from '@shared/country/findCountry';

// Lazy-load the borders GeoJSON (~450 KB) from the web's public folder and
// reuse the shared point-in-polygon lookup. Mirrors web's loadBorders/
// findCountryLocal so the post-guess "It was {country}!" reveal works on mobile.

let indexed: CountryIndexEntry[] | null = null;
let loadPromise: Promise<CountryIndexEntry[]> | null = null;

function load(): Promise<CountryIndexEntry[]> {
  if (indexed) return Promise.resolve(indexed);
  if (!loadPromise) {
    loadPromise = fetch(`${SITE_URL}/genBorders.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`genBorders.json fetch failed: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        indexed = buildCountryIndex(data);
        return indexed;
      })
      .catch((err) => {
        loadPromise = null;
        throw err;
      });
  }
  return loadPromise;
}

/** Resolve an ISO-alpha-2 country code for a lat/lon, or "Unknown". */
export async function findCountryLocal({ lat, lon }: { lat: number; lon: number }): Promise<string> {
  if (typeof lat !== 'number' || typeof lon !== 'number') return 'Unknown';
  const idx = await load();
  return lookupCountry(idx, lat, lon);
}

/** Warm the borders cache so the post-guess lookup is instant. */
export function preloadBorders(): void {
  load().catch(() => {});
}
