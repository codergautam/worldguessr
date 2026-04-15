// Track consecutive /api/country failures. Flip a global flag + dispatch an event
// once we've seen enough failures in a row to be confident the API is unreachable
// (rather than a single transient blip). Consumers like home.js listen to the event
// to switch country-guesser out to World map, since country/continent guesser can't
// function without this endpoint.
let consecutiveFailures = 0;
const FAILURE_THRESHOLD = 3;
const DEBUG = true; // leave on for now; set false to silence per-call logs

function log(...args) {
  if (!DEBUG) return;
  // eslint-disable-next-line no-console
  console.log('[findCountry]', ...args);
}

function markApiUnreachable(reason) {
  if (typeof window === 'undefined') return;
  if (window.__countryApiUnreachable) return;
  window.__countryApiUnreachable = true;
  try { window.dispatchEvent(new CustomEvent('countryApiUnreachable')); } catch (e) {}
  // eslint-disable-next-line no-console
  console.warn(`[findCountry] /api/country unreachable (${reason}) — country/continent guesser disabled.`);
}

function markApiReachable() {
  if (consecutiveFailures === 0 && (typeof window === 'undefined' || !window.__countryApiUnreachable)) return;
  consecutiveFailures = 0;
  if (typeof window === 'undefined') return;
  if (!window.__countryApiUnreachable) return;
  window.__countryApiUnreachable = false;
  try { window.dispatchEvent(new CustomEvent('countryApiReachable')); } catch (e) {}
  log('/api/country is back up');
}

function recordFailure(reason) {
  consecutiveFailures++;
  log(`failure (${reason}). consecutive=${consecutiveFailures}/${FAILURE_THRESHOLD}`);
  if (consecutiveFailures >= FAILURE_THRESHOLD) markApiUnreachable(reason);
}

// A "real" country from /api/country is any non-empty string that isn't literally
// "Unknown". An empty string, missing field, or "Unknown" response all mean the
// lookup didn't succeed for our purposes.
function isRealCountry(c) {
  return typeof c === 'string' && c.length > 0 && c !== 'Unknown';
}

export default async function findCountry({ lat, lon }) {
  let data = null;
  let failureReason = null;

  try {
    const apiUrl = typeof window !== 'undefined' ? window.cConfig?.apiUrl : null;
    if (!apiUrl) throw new Error('apiUrl missing from window.cConfig');
    const resp = await fetch(apiUrl + `/api/country?lat=${lat}&lon=${lon}`);
    if (!resp.ok) throw new Error(`non-ok status ${resp.status}`);
    data = await resp.json();
    // Server responded but the payload doesn't actually identify a country.
    // In a broken/degraded state (stubbed body, partial outage, wrong schema),
    // this path fires instead of the network-error path.
    if (!isRealCountry(data?.address?.country)) {
      throw new Error(`empty/Unknown body: ${JSON.stringify(data).slice(0, 120)}`);
    }
  } catch (e) {
    data = { address: { country: "Unknown" } };
    failureReason = e?.message || String(e);
  }

  if (failureReason) {
    recordFailure(failureReason);
  } else {
    markApiReachable();
  }

  return data.address?.country ?? "Unknown";
}
  //https://nominatim.openstreetmap.org/reverse?lat=<value>&lon=<value>
// https://geocode.maps.co/reverse?lat=${lat}&lon=${lon}&api_key=${process.env.NEXT_PUBLIC_MAPSCO}
