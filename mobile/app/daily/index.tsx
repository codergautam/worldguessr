import { useCallback, useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, AppState, type AppStateStatus, BackHandler } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '../../src/store/authStore';
import { useDailyChallenge } from '../../src/components/daily/useDailyChallenge';
import DailyLanding from '../../src/components/daily/DailyLanding';
import DailyConfirmStartModal from '../../src/components/daily/DailyConfirmStartModal';
import DailyDisqualifiedModal from '../../src/components/daily/DailyDisqualifiedModal';
import DailyResultsScreen from '../../src/components/daily/DailyResultsScreen';
import SubmittingOverlay from '../../src/components/daily/SubmittingOverlay';
import DailyBackground from '../../src/components/daily/DailyBackground';
import GameSurface, { type GameSurfaceHandle } from '../../src/components/game/GameSurface';
import GameTimer from '../../src/components/game/GameTimer';
import ClassicEndBanner from '../../src/components/game/ClassicEndBanner';
import calcPoints from '../../src/shared/game/calcPoints';
import { findDistance } from '../../src/shared/game/calcPoints';
import { dailyColors } from '../../src/components/daily/styles';

type Phase = 'landing' | 'confirming' | 'loading' | 'game' | 'submitting' | 'results';

const DAILY_MAX_DIST = 20000;
const TIME_PER_ROUND = 60;
const COLD_MOUNT_GUARD_MS = 1500;

interface RoundResult {
  score: number;
  timeMs: number | null;
  guessLat: number | null;
  guessLng: number | null;
  country: string | null;
  distance: number | null;
}

interface SubmitRound {
  score: number;
  timeMs: number | null;
  guessLat: number | null;
  guessLng: number | null;
  country: string | null;
}

// Background-submit handle: populated while the user reads the final round's
// answer so "View Results" can transition straight to results with no
// submitting interstitial (mirrors web's DailyChallengeScreen prefetchRef).
interface PrefetchEntry {
  promise: Promise<any>;
  response: any | null;
  rounds: SubmitRound[];
  totalScore: number;
  atDisqualified: boolean;
}

function mapToSubmitRound(r: RoundResult): SubmitRound {
  return {
    score: Math.round(r.score ?? 0),
    timeMs: r.timeMs,
    guessLat: r.guessLat,
    guessLng: r.guessLng,
    country: r.country,
  };
}

export default function DailyScreen() {
  const router = useRouter();
  const secret = useAuthStore((s) => s.secret);
  const authLoading = useAuthStore((s) => s.isLoading);
  const isLoggedIn = !!secret;

  const {
    date,
    locationData,
    locationError,
    fetchLocations,
    results,
    fetchResults,
    submit,
    loadingResults,
  } = useDailyChallenge({ secret });

  const [phase, setPhase] = useState<Phase>('landing');
  const [currentRound, setCurrentRound] = useState(1);
  const [pinPoint, setPinPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [disqualified, setDisqualified] = useState(false);
  const [showDqModal, setShowDqModal] = useState(false);
  const [submitResponse, setSubmitResponse] = useState<any>(null);
  const [finalRounds, setFinalRounds] = useState<RoundResult[]>([]);

  const roundStartedAtRef = useRef<number>(Date.now());
  const gameSurfaceRef = useRef<GameSurfaceHandle>(null);
  const prefetchRef = useRef<PrefetchEntry | null>(null);

  // Fetch user results on mount (drives landing UI).
  useEffect(() => {
    fetchResults();
  }, []);

  // Prefetch locations once we enter confirming/loading, mirroring web.
  useEffect(() => {
    if ((phase === 'confirming' || phase === 'loading' || phase === 'results') && !locationData) {
      fetchLocations();
    }
  }, [phase, locationData, fetchLocations]);

  // Surface location-load errors and drop back to landing.
  const lastErrRef = useRef<Error | null>(null);
  useEffect(() => {
    if (!locationError || lastErrRef.current === locationError) return;
    lastErrRef.current = locationError;
    if (phase === 'loading' || phase === 'confirming') setPhase('landing');
  }, [locationError, phase]);

  // Transition loading → game once locations arrive.
  useEffect(() => {
    if (phase === 'loading' && locationData?.locations?.length) {
      prefetchRef.current = null;
      setCurrentRound(1);
      setPinPoint(null);
      setShowAnswer(false);
      setRoundResults([]);
      roundStartedAtRef.current = Date.now();
      setPhase('game');
    }
  }, [phase, locationData]);

  // AppState DQ — entering background during the game phase disqualifies the
  // run. Gated on phase==='game' so backgrounding while reviewing results never
  // disqualifies.
  useEffect(() => {
    if (phase !== 'game' || disqualified) return;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        setDisqualified(true);
        setShowDqModal(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
    });
    return () => sub.remove();
  }, [phase, disqualified]);

  // Hardware back: game → landing; results → exit daily; submitting → swallow
  // (don't strand a mid-submit run).
  useEffect(() => {
    if (phase !== 'game' && phase !== 'results' && phase !== 'submitting') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (phase === 'submitting') return true;
      if (phase === 'results') {
        router.back();
        return true;
      }
      setPhase('landing');
      return true;
    });
    return () => sub.remove();
  }, [phase, router]);

  const totalRounds = locationData?.locations?.length ?? 3;
  const currentLocation = locationData?.locations?.[Math.min(currentRound - 1, totalRounds - 1)] ?? null;

  const handleStart = useCallback(() => {
    if (results?.user?.disqualifiedToday) {
      setShowDqModal(true);
      return;
    }
    if (results?.user?.playedToday) {
      setPhase('results');
      return;
    }
    setPhase('confirming');
  }, [results]);

  const handleConfirm = useCallback(() => {
    // Defensive reset — a stale prefetch must never short-circuit a fresh run.
    prefetchRef.current = null;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (locationData?.locations?.length) {
      setCurrentRound(1);
      setPinPoint(null);
      setShowAnswer(false);
      setRoundResults([]);
      roundStartedAtRef.current = Date.now();
      setPhase('game');
    } else {
      setPhase('loading');
    }
  }, [locationData]);

  const finishRound = useCallback(
    (guess: { lat: number; lng: number } | null) => {
      if (!currentLocation) return;
      const timeMs = Date.now() - roundStartedAtRef.current;
      let score = 0;
      let distance: number | null = null;
      if (guess) {
        distance = findDistance(currentLocation.lat, currentLocation.long, guess.lat, guess.lng);
        score = calcPoints({
          lat: currentLocation.lat,
          lon: currentLocation.long,
          guessLat: guess.lat,
          guessLon: guess.lng,
          maxDist: DAILY_MAX_DIST,
        });
      }
      const rr: RoundResult = {
        score,
        timeMs,
        guessLat: guess?.lat ?? null,
        guessLng: guess?.lng ?? null,
        country: currentLocation.country ?? null,
        distance,
      };
      setRoundResults((prev) => [...prev, rr]);
      setShowAnswer(true);
    },
    [currentLocation],
  );

  const handleSubmitPin = useCallback(() => {
    finishRound(pinPoint);
  }, [pinPoint, finishRound]);

  const handleTimeUp = useCallback(() => {
    if (!showAnswer) finishRound(pinPoint);
  }, [showAnswer, pinPoint, finishRound]);

  // Background-submit prefetch — fires while the FINAL round's answer is showing
  // so finishing transitions straight to results. Gated on !disqualified: a DQ
  // flip changes the payload, so the slow path in advance() handles that case.
  useEffect(() => {
    if (phase !== 'game') return;
    if (!showAnswer) return;
    if (roundResults.length !== totalRounds) return;
    if (disqualified) return;
    if (prefetchRef.current) return;

    const rounds = roundResults.map(mapToSubmitRound);
    const totalScore = rounds.reduce((s, r) => s + (r.score || 0), 0);
    const totalTime = rounds.reduce((s, r) => s + (r.timeMs || 0), 0);

    const entry: PrefetchEntry = {
      promise: Promise.resolve(null),
      response: null,
      rounds,
      totalScore,
      atDisqualified: false,
    };
    entry.promise = submit({
      rounds,
      totalScore,
      totalTime,
      sessionToken: locationData?.sessionToken,
      disqualified: false,
    })
      .then((response) => {
        entry.response = response;
        return response;
      })
      .catch(() => {
        const fallback = { error: true, score: totalScore, disqualified: false };
        entry.response = fallback;
        return fallback;
      });
    prefetchRef.current = entry;
    // Warm the leaderboard/distribution so results has everything on arrival.
    fetchResults();
  }, [phase, showAnswer, roundResults, totalRounds, disqualified, submit, locationData, fetchResults]);

  const advance = useCallback(async () => {
    const nextRound = currentRound + 1;
    if (nextRound > totalRounds) {
      const prefetch = prefetchRef.current;
      // Fast path: the prefetch submitted with the matching DQ state.
      if (prefetch && prefetch.atDisqualified === disqualified) {
        setFinalRounds(roundResults);
        if (prefetch.response) {
          setSubmitResponse(prefetch.response);
          setPhase('results');
          fetchResults();
          if (!disqualified) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          }
          return;
        }
        // Rare: tapped before the prefetch resolved — brief submitting window.
        setPhase('submitting');
        const response = await prefetch.promise;
        setSubmitResponse(response);
        setPhase('results');
        fetchResults();
        return;
      }

      // Slow path: DQ diverged from the prefetch (or no prefetch exists).
      const rounds = roundResults.map(mapToSubmitRound);
      const totalScore = rounds.reduce((s, r) => s + (r.score || 0), 0);
      const totalTime = rounds.reduce((s, r) => s + (r.timeMs || 0), 0);
      setFinalRounds(roundResults);
      setPhase('submitting');
      try {
        const response = await submit({
          rounds,
          totalScore,
          totalTime,
          sessionToken: locationData?.sessionToken,
          disqualified,
        });
        setSubmitResponse(response);
        if (!disqualified) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
      } catch {
        setSubmitResponse({ error: true, score: totalScore, disqualified });
      }
      setPhase('results');
      fetchResults();
      return;
    }

    // Non-final: flicker-free round transition (loading banner covers the swap).
    gameSurfaceRef.current?.beginRoundTransition(() => {
      setCurrentRound(nextRound);
      setPinPoint(null);
      setShowAnswer(false);
      roundStartedAtRef.current = Date.now();
    });
  }, [currentRound, totalRounds, roundResults, submit, locationData, disqualified, fetchResults]);

  // Reset round-start timestamp when round transitions in game phase.
  useEffect(() => {
    if (phase === 'game' && !showAnswer) {
      roundStartedAtRef.current = Date.now();
    }
  }, [phase, currentRound, showAnswer]);

  // Cold-mount guard (mirrors web `landingShouldWait`): only paint the landing
  // once we have real values, so it never flashes empty → filled. A timeout cap
  // ensures a stuck fetch can't trap the user.
  const [guardTimedOut, setGuardTimedOut] = useState(false);
  const landingHasData = !!results;
  const landingShouldWait = (authLoading || (!landingHasData && loadingResults)) && !guardTimedOut;
  useEffect(() => {
    if (phase !== 'landing' || !landingShouldWait) return;
    const t = setTimeout(() => setGuardTimedOut(true), COLD_MOUNT_GUARD_MS);
    return () => clearTimeout(t);
  }, [phase, landingShouldWait]);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (phase === 'landing' && landingShouldWait) {
    return (
      <DailyBackground style={styles.loading}>
        <ActivityIndicator color={dailyColors.green} size="large" />
      </DailyBackground>
    );
  }

  if (phase === 'landing' || phase === 'confirming') {
    return (
      <View style={styles.root}>
        <DailyLanding
          today={date}
          todayTop10={results?.top10 || []}
          userData={results?.user}
          isLoggedIn={isLoggedIn}
          onStartChallenge={handleStart}
          onClose={() => router.back()}
          animateEntrance
        />
        <DailyConfirmStartModal
          visible={phase === 'confirming'}
          onConfirm={handleConfirm}
          onCancel={() => setPhase('landing')}
        />
        <DailyDisqualifiedModal
          visible={showDqModal}
          alreadyDone
          onClose={() => setShowDqModal(false)}
        />
      </View>
    );
  }

  if (phase === 'loading' || (phase === 'game' && !currentLocation)) {
    return (
      <DailyBackground style={styles.loading}>
        <ActivityIndicator color={dailyColors.green} size="large" />
      </DailyBackground>
    );
  }

  // game / submitting / results all share the SAME mounted GameSurface, so the
  // final-round Street View stays behind the submitting + results overlays for
  // a smooth blurred crossfade instead of a snap to black (mirrors web keeping
  // the StreetView mounted on phase === 'results').
  const isResultsLike = phase === 'results' || phase === 'submitting';
  const currentRoundScore = roundResults[currentRound - 1]?.score ?? 0;
  const currentDistance = roundResults[currentRound - 1]?.distance ?? null;
  const isFinal = currentRound >= totalRounds;
  const totalScoreSoFar = roundResults.reduce((s, r) => s + (r.score || 0), 0);

  // Results data — prefer freshly submitted rounds, fall back to server history.
  const effectiveRounds: RoundResult[] = finalRounds.length
    ? finalRounds
    : (results?.user?.ownRounds ?? []).map((r: any) => ({
        score: r.score ?? 0,
        timeMs: r.timeMs ?? null,
        guessLat: r.guessLat ?? null,
        guessLng: r.guessLng ?? null,
        country: r.country ?? null,
        distance: r.distance ?? null,
      }));
  const resultsTotalScore =
    submitResponse?.score ??
    results?.user?.ownScore ??
    effectiveRounds.reduce((s, r) => s + (r.score || 0), 0);

  return (
    <View style={styles.root}>
      <GameSurface
        ref={gameSurfaceRef}
        location={
          currentLocation
            ? {
                lat: currentLocation.lat,
                long: currentLocation.long,
                heading: currentLocation.heading ?? null,
                country: currentLocation.country,
              }
            : null
        }
        variant="pin"
        roundKey={currentRound}
        isShowingResult={showAnswer || isResultsLike}
        guessPosition={pinPoint}
        onGuessPositionChange={isResultsLike ? undefined : setPinPoint}
        onSubmitPin={handleSubmitPin}
        topLeftSlot={
          phase === 'game' ? (
            <GameTimer
              timeRemaining={TIME_PER_ROUND}
              onTimeUp={handleTimeUp}
              roundKey={currentRound}
              currentRound={currentRound}
              totalRounds={totalRounds}
              totalScore={totalScoreSoFar}
              isPaused={showAnswer}
              showTimer
            />
          ) : undefined
        }
        endBannerContent={
          phase === 'game' ? (
            <ClassicEndBanner
              round={currentRound}
              totalRounds={totalRounds}
              points={currentRoundScore}
              distance={currentDistance ?? undefined}
              didGuess={!!roundResults[currentRound - 1]?.guessLat}
              onNext={advance}
              isFinal={isFinal}
            />
          ) : undefined
        }
      />

      {phase === 'game' && (
        <DailyDisqualifiedModal visible={showDqModal} onClose={() => setShowDqModal(false)} />
      )}

      {phase === 'submitting' && <SubmittingOverlay style={styles.overlay} />}

      {phase === 'results' && (
        <View style={styles.overlay} pointerEvents="box-none">
          <DailyResultsScreen
            date={date}
            rounds={effectiveRounds}
            locations={locationData?.locations ?? []}
            totalScore={resultsTotalScore}
            submitResponse={submitResponse}
            results={results}
            loadingResults={loadingResults}
            isLoggedIn={isLoggedIn}
            disqualified={disqualified || submitResponse?.disqualified}
            onClose={() => router.back()}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: dailyColors.bgBottom },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3000,
    elevation: 80,
  },
});
