import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { getClientLocalDate } from './dailyDate';
import {
  readDailyStatus,
  writeDailyStatus,
  readDailyTop10,
  writeDailyTop10,
  type DailyUserCache,
  type DailyTop10Entry,
} from './dailyStatusCache';
import { ensureGuestId, getGuestId } from './guestId';

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

  const [results, setResults] = useState<ResultsData | null>(null);
  const [resultsError, setResultsError] = useState<Error | null>(null);
  const [loadingResults, setLoadingResults] = useState(true);

  const [guestId, setGuestId] = useState<string | null>(null);

  // Seed from AsyncStorage on mount for instant UI.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [cachedUser, cachedTop10, gid] = await Promise.all([
        readDailyStatus(date),
        readDailyTop10(date),
        secret ? getGuestId() : ensureGuestId(),
      ]);
      if (cancelled) return;
      setGuestId(gid);
      if (cachedUser || cachedTop10.length > 0) {
        setResults({ date, user: cachedUser ?? undefined, top10: cachedTop10 } as ResultsData);
        setLoadingResults(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date, secret]);

  const fetchLocations = useCallback(async () => {
    try {
      const data = await api.dailyChallenge.locations(date, secret ?? undefined);
      setLocationData(data);
    } catch (err) {
      setLocationError(err as Error);
    }
  }, [date, secret]);

  const fetchResults = useCallback(async (): Promise<ResultsData | null> => {
    setLoadingResults(true);
    try {
      const gid = guestId ?? (await getGuestId());
      const data = await api.dailyChallenge.results(date, secret ?? undefined, gid ?? undefined);
      setResults(data);
      if (data?.user) await writeDailyStatus(date, data.user as DailyUserCache);
      if (Array.isArray(data?.top10)) await writeDailyTop10(date, data.top10 as DailyTop10Entry[]);
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
      const gid = await getGuestId();
      if (!gid) return;
      try {
        await api.dailyChallenge.claimGuestProgress(secret, gid);
        // Refresh — any merged days/streak show up immediately.
        fetchResults();
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
    fetchLocations,
    results,
    resultsError,
    loadingResults,
    fetchResults,
    submit,
  };
}

export type UseDailyChallengeReturn = ReturnType<typeof useDailyChallenge>;
