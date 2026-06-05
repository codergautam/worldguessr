import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import { useOnboardingStore } from '../store/onboardingStore';
import {
  ALL_CONTINENTS,
  continentFromCode,
  pickDistractors,
  shuffle,
} from '../shared/data/countryHelpers';

export const COUNTRY_GUESSER_TOTAL_ROUNDS = 10;
export const COUNTRY_GUESSER_POINTS_PER_ROUND = 1000;
export const SINGLEPLAYER_DEFAULT_MODE_KEY = 'singleplayerDefaultMode';

export type CountryGuesserSubMode = 'country' | 'continent';

export interface CountryGuesserLocation {
  lat: number;
  long: number;
  country: string;
  panoId?: string;
  heading?: number | null;
  head?: number | null;
  pitch?: number;
}

export interface CountryGuesserRoundResult {
  picked: string;
  correct: string;
  points: number;
  actualLat: number;
  actualLong: number;
  guessLat: number;
  guessLong: number;
  country: string;
  panoId?: string;
  timeTaken: number;
}

interface UseCountryGuesserGameOptions {
  enabled?: boolean;
  subMode: CountryGuesserSubMode;
  region?: string;
  totalRounds?: number;
}

export function defaultModeValueForSubMode(subMode: CountryGuesserSubMode) {
  return subMode === 'continent' ? 'continentGuesser' : 'countryGuesser';
}

export function subModeFromDefaultMode(value?: string | null): CountryGuesserSubMode | null {
  if (value === 'countryGuesser') return 'country';
  if (value === 'continentGuesser') return 'continent';
  return null;
}

export default function useCountryGuesserGame({
  enabled = true,
  subMode,
  region = 'all',
  totalRounds = COUNTRY_GUESSER_TOTAL_ROUNDS,
}: UseCountryGuesserGameOptions) {
  const countryStreak = useOnboardingStore((s) => s.countryStreak);
  const continentStreak = useOnboardingStore((s) => s.continentStreak);
  const bumpStreak = useOnboardingStore((s) => s.bumpStreak);
  const resetStreak = useOnboardingStore((s) => s.resetStreak);

  const streak = subMode === 'continent' ? continentStreak : countryStreak;

  const [allLocs, setAllLocs] = useState<CountryGuesserLocation[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [round, setRound] = useState(1);
  const [results, setResults] = useState<CountryGuesserRoundResult[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [currentLoc, setCurrentLoc] = useState<CountryGuesserLocation | null>(null);
  const [otherOptions, setOtherOptions] = useState<string[]>([]);
  // Bumped by retry() to re-run the location-load effect after a network failure.
  const [reloadNonce, setReloadNonce] = useState(0);
  const cursorRef = useRef(0);
  const roundStartTimeRef = useRef(Date.now());

  const retry = useCallback(() => {
    setLoadError(null);
    setReloadNonce((n) => n + 1);
  }, []);

  const resetGame = useCallback(() => {
    cursorRef.current = 0;
    roundStartTimeRef.current = Date.now();
    setRound(1);
    setResults([]);
    setPicked(null);
    setShowResult(false);
    setCurrentLoc(null);
    setOtherOptions([]);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    resetGame();

    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await api.fetchAllLocations();
        if (cancelled) return;
        if (!data.ready || !data.locations || data.locations.length === 0) {
          throw new Error('No locations available');
        }

        const normalized: CountryGuesserLocation[] = data.locations
          .map((l) => ({
            lat: l.lat,
            long: l.long ?? (l as any).lng,
            country: (l.country ?? '').toUpperCase(),
            panoId: l.panoId,
            heading: l.heading ?? l.head ?? null,
            head: l.head ?? null,
            pitch: l.pitch,
          }))
          .filter((l) => !!l.country && l.country !== 'UNKNOWN');

        const regionFiltered =
          region === 'all'
            ? normalized
            : subMode === 'country'
              ? normalized.filter((l) => continentFromCode(l.country) === region)
              : normalized.filter((l) => continentFromCode(l.country) !== 'Unknown');

        if (regionFiltered.length === 0) {
          throw new Error(`No ${region} locations available`);
        }

        setAllLocs(shuffle(regionFiltered));
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, region, resetGame, subMode, reloadNonce]);

  useEffect(() => {
    if (!enabled || allLocs.length === 0 || loading || round > totalRounds) return;

    let nextLoc: CountryGuesserLocation | null = null;
    while (cursorRef.current < allLocs.length) {
      const candidate = allLocs[cursorRef.current];
      cursorRef.current += 1;
      const continent = continentFromCode(candidate.country);
      if (subMode === 'continent' && continent === 'Unknown') continue;
      nextLoc = candidate;
      break;
    }

    if (!nextLoc) {
      cursorRef.current = 0;
      setAllLocs((prev) => shuffle(prev));
      return;
    }

    setCurrentLoc(nextLoc);
    roundStartTimeRef.current = Date.now();

    if (subMode === 'continent') {
      setOtherOptions([...ALL_CONTINENTS]);
    } else {
      const distractors = pickDistractors(nextLoc.country, 5);
      setOtherOptions(shuffle([...distractors, nextLoc.country]));
    }
  }, [allLocs, enabled, loading, round, subMode, totalRounds]);

  const submit = useCallback(
    async (answer: string) => {
      if (!currentLoc || showResult) return;

      const correct =
        subMode === 'continent' ? continentFromCode(currentLoc.country) : currentLoc.country;
      const isCorrect = answer === correct;
      const points = isCorrect ? COUNTRY_GUESSER_POINTS_PER_ROUND : 0;
      const timeTaken = Math.round((Date.now() - roundStartTimeRef.current) / 1000);

      setPicked(answer);
      setResults((prev) => [
        ...prev,
        {
          picked: answer,
          correct,
          points,
          actualLat: currentLoc.lat,
          actualLong: currentLoc.long,
          guessLat: isCorrect ? currentLoc.lat : 0,
          guessLong: isCorrect ? currentLoc.long : 0,
          country: currentLoc.country,
          panoId: currentLoc.panoId,
          timeTaken,
        },
      ]);
      setShowResult(true);

      if (isCorrect) {
        await bumpStreak(subMode);
      } else {
        await resetStreak(subMode);
      }
    },
    [bumpStreak, currentLoc, resetStreak, showResult, subMode],
  );

  const advance = useCallback(() => {
    setShowResult(false);
    setPicked(null);
    setRound((r) => r + 1);
    roundStartTimeRef.current = Date.now();
  }, []);

  const totalPoints = useMemo(
    () => results.reduce((sum, result) => sum + result.points, 0),
    [results],
  );

  return {
    loading,
    loadError,
    round,
    totalRounds,
    currentLoc,
    otherOptions,
    picked,
    showResult,
    results,
    totalPoints,
    lastResult: results[results.length - 1],
    streak,
    countryStreak,
    continentStreak,
    submit,
    advance,
    resetGame,
    retry,
    isFinal: round >= totalRounds,
    isOver: round > totalRounds,
  };
}
