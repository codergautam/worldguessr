import { useCallback, useEffect, useRef, useState } from 'react';
import config from '@/clientConfig';
import { getClientLocalDate } from '@/utils/dailyDate';
import { readDailyStatus, writeDailyStatus } from '@/utils/dailyStatusCache';
import { ensureGuestId, getGuestId } from '@/utils/guestId';
import { claimGuestProgressIfAny } from '@/utils/claimGuestProgress';

export function useDailyChallenge({ session, autoFetchResults = false, dateOverride } = {}) {
  const apiUrlRef = useRef(null);
  if (apiUrlRef.current === null) {
    if (typeof window !== 'undefined') {
      try { apiUrlRef.current = config().apiUrl; } catch { apiUrlRef.current = ''; }
    }
  }
  const apiUrl = apiUrlRef.current || '';

  const [date] = useState(() => dateOverride || getClientLocalDate());
  const [locationData, setLocationData] = useState(null);
  const [locationError, setLocationError] = useState(null);
  // Seed results with whatever we cached last time for this date so the UI
  // renders instantly — we still refresh from the API on mount.
  const [results, setResults] = useState(() => {
    if (typeof window === 'undefined') return null;
    const effectiveDate = dateOverride || getClientLocalDate();
    const cached = readDailyStatus(effectiveDate);
    return cached ? { user: cached, fromCache: true } : null;
  });
  const [resultsError, setResultsError] = useState(null);
  const [loadingResults, setLoadingResults] = useState(false);

  const secret = session?.token?.secret;

  // Lazily ensure a guestId exists for unauthenticated callers. Logged-in
  // users don't get one provisioned (they have their own identity); reading
  // an existing one is fine though — we still pass it along so the post-
  // signin claim effect (below) can merge any pre-signin guest progress.
  const [guestId] = useState(() => {
    if (typeof window === 'undefined') return null;
    return (session?.token?.secret ? getGuestId() : ensureGuestId()) || null;
  });

  const fetchLocations = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/dailyChallenge/locations?date=${date}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLocationData(data);
    } catch (err) {
      setLocationError(err);
    }
  }, [apiUrl, date]);

  const fetchResults = useCallback(async () => {
    setLoadingResults(true);
    try {
      const q = new URLSearchParams({ date });
      if (secret) q.set('secret', secret);
      else if (guestId) q.set('guestId', guestId);
      const res = await fetch(`${apiUrl}/api/dailyChallenge/results?${q.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResults(data);
      if (data?.user) writeDailyStatus(date, data.user);
      return data;
    } catch (err) {
      setResultsError(err);
      return null;
    } finally {
      setLoadingResults(false);
    }
  }, [apiUrl, date, secret, guestId]);

  const submit = useCallback(async ({ rounds, totalScore, totalTime, sessionToken, disqualified }) => {
    const body = {
      date,
      score: totalScore,
      totalTime,
      rounds,
      sessionToken,
      disqualified: !!disqualified,
    };
    if (secret) body.secret = secret;
    else if (guestId) body.guestId = guestId;
    const res = await fetch(`${apiUrl}/api/dailyChallenge/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = new Error(`Submit failed: ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }, [apiUrl, date, secret, guestId]);

  useEffect(() => {
    if (autoFetchResults) fetchResults();
  }, [autoFetchResults, fetchResults]);

  // Post-signin claim — delegates to the shared helper so this cooperates
  // with the eager call auth.js fires on successful signin. The helper
  // dedupes concurrent fetches and caches the result so we still get a toast
  // here when the user signed in elsewhere (e.g. home page) and only then
  // navigates to Daily.
  const claimedOnceRef = useRef(false);
  const [claimResult, setClaimResult] = useState(null);
  useEffect(() => {
    if (!secret) return;
    if (claimedOnceRef.current) return;
    claimedOnceRef.current = true;
    (async () => {
      const result = await claimGuestProgressIfAny(secret, apiUrl);
      if (!result) return;
      setClaimResult(result);
      if (result.ok) {
        // Refresh so newly-merged history/streak shows up immediately.
        fetchResults();
      }
    })();
  }, [secret, apiUrl, fetchResults]);

  const dismissClaimResult = useCallback(() => setClaimResult(null), []);

  return {
    date,
    apiUrl,
    guestId,
    locationData,
    locationError,
    fetchLocations,
    results,
    resultsError,
    loadingResults,
    fetchResults,
    submit,
    claimResult,
    dismissClaimResult,
  };
}

export default useDailyChallenge;
