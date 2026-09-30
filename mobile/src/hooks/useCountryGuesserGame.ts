import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import { haptics } from '../services/haptics';
import { useOnboardingStore } from '../store/onboardingStore';
import countryCoordinates from '../shared/data/countryCoordinates.json';
import {
  ALL_CONTINENTS,
  continentFromCode,
} from '../shared/data/countryHelpers';

export const COUNTRY_GUESSER_TOTAL_ROUNDS = 10;
export const SINGLEPLAYER_DEFAULT_MODE_KEY = 'singleplayerDefaultMode';

export type CountryGuesserSubMode = 'country' | 'continent';

export interface CountryGuesserLocation {
  roundId: string;
  lat?: number;
  long?: number;
  country?: string;
  panoId?: string;
  heading?: number | null;
  head?: number | null;
  pitch?: number;
}

export interface CountryGuesserRoundResult {
  roundId: string;
  /** null when the round timed out with no pick. */
  picked: string | null;
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

  const [loading, setLoading] = useState(enabled);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [round, setRound] = useState(1);
  const [results, setResults] = useState<CountryGuesserRoundResult[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [currentLoc, setCurrentLoc] = useState<CountryGuesserLocation | null>(null);
  // The round AFTER currentLoc, peeked ahead so the result screen can warm its
  // Street View (see GameSurface.nextLocation). Null near pool exhaustion.
  const [nextLoc, setNextLoc] = useState<CountryGuesserLocation | null>(null);
  const [otherOptions, setOtherOptions] = useState<string[]>([]);
  // Bumped by retry() to re-run the location-load effect after a network failure.
  const [reloadNonce, setReloadNonce] = useState(0);
  const roundStartTimeRef = useRef(Date.now());

  const retry = useCallback(() => {
    setLoadError(null);
    setReloadNonce((n) => n + 1);
  }, []);

  const resetGame = useCallback(() => {
    roundStartTimeRef.current = Date.now();
    setRound(1);
    setResults([]);
    setPicked(null);
    setShowResult(false);
    setCurrentLoc(null);
    setNextLoc(null);
    setOtherOptions([]);
  }, []);

  useEffect(() => { resetGame(); }, [enabled, resetGame, subMode, reloadNonce]);

  useEffect(() => {
    if (!enabled || round > totalRounds) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    api.rounds.create('all', { countryGuesser: true, countryGuessrSubMode: subMode, region }).then((location) => {
      if (cancelled) return;
      setCurrentLoc(location);
      setOtherOptions(subMode === 'continent' ? [...ALL_CONTINENTS] : location.choices || []);
      roundStartTimeRef.current = Date.now();
      setLoading(false);
    }).catch((err) => {
      if (cancelled) return;
      setLoadError(err instanceof Error ? err.message : 'Failed to load');
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [enabled, region, round, subMode, totalRounds, reloadNonce]);

  const submit = useCallback(
    // `answer` is null when the round timer runs out with no pick — recorded as a
    // wrong guess (0 points, streak reset). CountryEndBanner handles picked=null.
    async (answer: string | null) => {
      if (!currentLoc || showResult) return;

      const countryCoords = answer && subMode === 'country'
        ? (countryCoordinates as Record<string, { lat: number; lng: number }>)[answer]
        : null;
      const continentCenters: Record<string, [number, number]> = { Africa: [0, 20], Asia: [35, 100], Europe: [54, 15], 'North America': [45, -100], 'South America': [-15, -60], Oceania: [-25, 135] };
      const guess = countryCoords || (answer && subMode === 'continent' ? { lat: continentCenters[answer][0], lng: continentCenters[answer][1] } : { lat: 0, lng: 0 });
      const scoreResult = await api.rounds.guess(currentLoc.roundId, guess.lat, guess.lng);
      const country = scoreResult.actualCountry || '';
      setCurrentLoc((previous) => previous ? ({ ...previous, lat: scoreResult.actual.lat, long: scoreResult.actual.lng, country }) : previous);
      const correct = subMode === 'continent' ? continentFromCode(country) : country;
      const isCorrect = scoreResult.score > 0;
      const points = scoreResult.score;
      const timeTaken = Math.round((Date.now() - roundStartTimeRef.current) / 1000);

      setPicked(answer);
      setResults((prev) => [
        ...prev,
        {
          roundId: currentLoc.roundId,
          picked: answer,
          correct,
          points,
          actualLat: scoreResult.actual.lat,
          actualLong: scoreResult.actual.lng,
          guessLat: guess.lat,
          guessLong: guess.lng,
          country,
          panoId: currentLoc.panoId,
          timeTaken,
        },
      ]);
      setShowResult(true);

      if (isCorrect) {
        haptics.success(); // right country/continent
        await bumpStreak(subMode);
      } else {
        haptics.light(); // wrong (or timed out) — just a soft blip, not a buzz
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
    nextLoc,
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
