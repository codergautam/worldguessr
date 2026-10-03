import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { getClientLocalDate } from './dailyDate';
import {
  readDailyStatus,
  writeDailyStatus,
  readDailyDistribution,
  writeDailyDistribution,
  type DailyUserCache,
  type DailyDistributionCache,
} from './dailyStatusCache';
import { ensureGuestId, getGuestId } from './guestId';
import { claimGuestProgressIfAny } from './claimGuestProgress';

type LocationData = Awaited<ReturnType<typeof api.dailyChallenge.locations>>;
type ResultsData = Awaited<ReturnType<typeof api.dailyChallenge.results>>;
type SubmitData = Awaited<ReturnType<typeof api.dailyChallenge.submit>>;

interface UseDailyChallengeOpts {
  secret?: string | null;
  dateOverride?: string;
  autoFetchResults?: boolean;
}

export function useDailyChallenge({ secret, dateOverride, autoFetchResults = false }: UseDailyChallengeOpts) {
  const [date] = useState(() => dateOverride || getClientLocalDate());

  const [locationData, setLocationData] = useState<LocationData | null>(null);
  const [locationError, setLocationError] = useState<Error | null>(null);
  const [loadingLocations, setLoadingLocations] = useState(false);
  // Prevents the prefetch effect and an explicit retry from firing overlapping
  // requests; also lets the retry button no-op while a fetch is already running.
  const locationFetchInFlight = useRef(false);

  const [results, setResults] = useState<ResultsData | null>(null);
  const [resultsError, setResultsError] = useState<Error | null>(null);
  const [loadingResults, setLoadingResults] = useState(true);

  const [guestId, setGuestId] = useState<string | null>(null);

  // Seed from AsyncStorage on mount for instant UI.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const gid = secret ? await getGuestId() : await ensureGuestId();
      // Scope the cached status read to this identity (secret, else guestId) so
      // a different account on a shared device never reads the previous user's
      // cached name/streak/score. See dailyStatusCache.ts.
      const owner = secret ?? gid ?? null;
      const [cachedUser, cachedDistribution] = await Promise.all([
        readDailyStatus(date, owner),
        readDailyDistribution(date),
      ]);
      if (cancelled) return;
      setGuestId(gid);
      if (cachedUser || cachedDistribution) {
        setResults({ date, user: cachedUser ?? undefined, distribution: cachedDistribution ?? undefined } as ResultsData);
        setLoadingResults(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date, secret]);

  const fetchLocations = useCallback(async () => {
    if (locationFetchInFlight.current) return;
    locationFetchInFlight.current = true;
    setLoadingLocations(true);
    setLocationError(null); // clear any stale error so a retry can succeed cleanly
    try {
      const data = await api.dailyChallenge.locations(date, secret ?? undefined);
      // No usable locations is as unplayable as a network failure — surface it as
      // an error so the UI blocks the run rather than entering a broken game.
      if (!data?.locations?.length) {
        throw new Error('Daily locations unavailable');
      }
      setLocationData(data);
    } catch (err) {
      setLocationError(err as Error);
    } finally {
      locationFetchInFlight.current = false;
      setLoadingLocations(false);
    }
  }, [date, secret]);

  const fetchResults = useCallback(async (): Promise<ResultsData | null> => {
    setLoadingResults(true);
    try {
      const gid = guestId ?? (await getGuestId());
      const data = await api.dailyChallenge.results(date, secret ?? undefined, gid ?? undefined);
      setResults(data);
      if (data?.user) await writeDailyStatus(date, data.user as DailyUserCache, secret ?? gid ?? null);
      if (data?.distribution) await writeDailyDistribution(date, data.distribution as DailyDistributionCache);
      return data;
    } catch (err) {
      setResultsError(err as Error);
      return null;
    } finally {
      setLoadingResults(false);
    }
  }, [date, secret, guestId]);

  const submit = useCallback(
    async (body: {
      rounds: Array<{
        score: number;
        timeMs: number | null;
        guessLat: number | null;
        guessLng: number | null;
        country: string | null;
      }>;
      totalScore: number;
      totalTime: number;
      sessionToken?: string;
      disqualified?: boolean;
    }): Promise<SubmitData> => {
      const gid = guestId ?? (await getGuestId());
      return api.dailyChallenge.submit({
        date,
        score: body.totalScore,
        totalTime: body.totalTime,
        rounds: body.rounds,
        sessionToken: body.sessionToken,
        disqualified: !!body.disqualified,
        secret: secret ?? undefined,
        guestId: !secret ? gid ?? undefined : undefined,
      });
    },
    [date, secret, guestId],
  );

  const claimedRef = useRef(false);
  useEffect(() => {
    if (!secret || claimedRef.current) return;
    (async () => {
      claimedRef.current = true;
      try {
        // Shared helper dedupes with the claim fired by the auth store on
        // sign-in, and clears the guest id on success/already-claimed.
        const result = await claimGuestProgressIfAny(secret);
        // Refresh — any merged days/streak show up immediately.
        if (result) fetchResults();
      } catch {
        /* silent — not useful to the user */
      }
    })();
  }, [secret, fetchResults]);

  useEffect(() => {
    if (autoFetchResults) fetchResults();
  }, [autoFetchResults, fetchResults]);

  return {
    date,
    guestId,
    locationData,
    locationError,
    loadingLocations,
    fetchLocations,
    results,
    resultsError,
    loadingResults,
    fetchResults,
    submit,
  };
}

export type UseDailyChallengeReturn = ReturnType<typeof useDailyChallenge>;
