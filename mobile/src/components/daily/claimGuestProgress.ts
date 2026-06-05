import { API_URL } from '../../constants/config';
import { fetchWithTimeout } from '../../services/fetchWithTimeout';
import type { DailyClaimResponse } from '@shared/daily/types';
import { getGuestId, clearGuestId } from './guestId';

// Mobile counterpart of web's utils/claimGuestProgress.js. Merges any
// pre-signin guest daily progress into the just-authenticated account.
//
// Dedupes concurrent callers (the auth store fires it on sign-in;
// useDailyChallenge fires it on hook mount) via an in-flight promise and hands
// the result to late callers via `cachedResult` so a user who signs in from the
// home screen and navigates to Daily afterward still picks up the merged result
// there. Uses a raw fetch (not the shared fetchApi) so we can inspect 409/404
// status codes and clear the guest id appropriately.

export interface ClaimResult extends DailyClaimResponse {
  ok: boolean;
  code?: string;
  status?: number;
  error?: string;
}

let inFlight: Promise<ClaimResult | null> | null = null;
let cachedResult: ClaimResult | null = null;

export async function claimGuestProgressIfAny(secret?: string | null): Promise<ClaimResult | null> {
  if (!secret) return null;
  if (inFlight) return inFlight;
  if (cachedResult) {
    // Consume-once — next caller after this gets null unless a fresh claim is
    // started. This is how the Daily hook picks up a result the auth store
    // already fetched.
    const r = cachedResult;
    cachedResult = null;
    return r;
  }

  const guestId = await getGuestId();
  if (!guestId) return null;

  const url = `${API_URL}/api/dailyChallenge/claimGuestProgress`;
  inFlight = (async () => {
    let result: ClaimResult;
    try {
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestId, secret }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        result = { ok: true, ...data };
        await clearGuestId();
      } else if (res.status === 409) {
        result = { ok: false, code: data?.code || 'ALREADY_CLAIMED' };
        await clearGuestId();
      } else if (res.status === 404) {
        result = { ok: false, code: 'NO_PROFILE' };
        await clearGuestId();
      } else {
        result = { ok: false, code: 'ERROR', status: res.status };
      }
    } catch (err: any) {
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

// Call on sign-out to drop any stale cached claim result from the previous
// session so the next sign-in starts clean.
export function resetClaimGuestProgressState(): void {
  inFlight = null;
  cachedResult = null;
}
