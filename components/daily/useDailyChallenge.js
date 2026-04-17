import { useCallback, useEffect, useRef, useState } from 'react';
import config from '@/clientConfig';
import { getClientLocalDate } from '@/utils/dailyDate';
import { readDailyStatus, writeDailyStatus } from '@/utils/dailyStatusCache';

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
  }, [apiUrl, date, secret]);

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
  }, [apiUrl, date, secret]);

  useEffect(() => {
    if (autoFetchResults) fetchResults();
  }, [autoFetchResults, fetchResults]);

  return {
    date,
    apiUrl,
    locationData,
    locationError,
    fetchLocations,
    results,
    resultsError,
    loadingResults,
    fetchResults,
    submit,
  };
}

export default useDailyChallenge;
