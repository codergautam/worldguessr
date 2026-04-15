import { useEffect, useState } from 'react';

/**
 * Subscribes to the `countryApiUnreachable` / `countryApiReachable` events dispatched
 * by `components/findCountry.js` when the `/api/country` endpoint has been failing.
 * Returns a boolean — `true` when country/continent guesser should be treated as
 * unavailable and the caller should fall back to World map.
 *
 * The underlying flag also lives on `window.__countryApiUnreachable` so non-React
 * code paths can read the same state.
 */
export default function useCountryApiHealth() {
  const [unreachable, setUnreachable] = useState(
    typeof window !== 'undefined' && !!window.__countryApiUnreachable
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onDown = () => setUnreachable(true);
    const onUp = () => setUnreachable(false);
    window.addEventListener('countryApiUnreachable', onDown);
    window.addEventListener('countryApiReachable', onUp);
    // Catch the case where the flag was flipped before we mounted
    if (window.__countryApiUnreachable) setUnreachable(true);
    return () => {
      window.removeEventListener('countryApiUnreachable', onDown);
      window.removeEventListener('countryApiReachable', onUp);
    };
  }, []);

  return unreachable;
}
