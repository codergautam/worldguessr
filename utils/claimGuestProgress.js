import config from '@/clientConfig';
import { getGuestId, clearGuestId } from './guestId';

// Shared claim helper. Dedupes concurrent callers (auth.js fires it on
// sign-in; useDailyChallenge fires it on hook mount) via an in-flight promise
// and hands the result to late callers via `cachedResult` so the user who
// signs in from the home page and navigates to Daily afterward still gets the
// success toast there.

let inFlight = null;
let cachedResult = null;

function resolveApiUrl(explicit) {
  if (explicit) return explicit;
  if (typeof window === 'undefined') return '';
  try { return config().apiUrl || ''; } catch { return ''; }
}

export async function claimGuestProgressIfAny(secret, apiUrl) {
  if (!secret || typeof window === 'undefined') return null;
  if (inFlight) return inFlight;
  if (cachedResult) {
    // Consume-once — next caller after this gets null unless a fresh claim is
    // started. This is how the hook picks up a result auth.js already fetched.
    const r = cachedResult;
    cachedResult = null;
    return r;
  }
  const guestId = getGuestId();
  if (!guestId) return null;

  const url = `${resolveApiUrl(apiUrl)}/api/dailyChallenge/claimGuestProgress`;
  inFlight = (async () => {
    let result;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestId, secret }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        result = { ok: true, ...data };
        clearGuestId();
      } else if (res.status === 409) {
        result = { ok: false, code: data?.code || 'ALREADY_CLAIMED' };
        clearGuestId();
      } else if (res.status === 404) {
        result = { ok: false, code: 'NO_PROFILE' };
        clearGuestId();
      } else {
        result = { ok: false, code: 'ERROR', status: res.status };
      }
    } catch (err) {
      result = { ok: false, code: 'NETWORK', error: err?.message };
    }
    cachedResult = result;
    return result;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

// Call on signOut to drop any stale cached claim result from the previous
// session so the next sign-in starts clean.
export function resetClaimGuestProgressState() {
  inFlight = null;
  cachedResult = null;
}
