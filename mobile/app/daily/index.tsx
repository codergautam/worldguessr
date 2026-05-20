import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import DailyRoundBadge from '../../src/components/daily/DailyRoundBadge';
import GameSurface, { type GameSurfaceHandle } from '../../src/components/game/GameSurface';
import GameTimer from '../../src/components/game/GameTimer';
import ClassicEndBanner from '../../src/components/game/ClassicEndBanner';
import calcPoints from '../../src/shared/game/calcPoints';
import { findDistance } from '../../src/shared/game/calcPoints';
import { api } from '../../src/services/api';

type Phase = 'landing' | 'confirming' | 'loading' | 'game' | 'submitting' | 'results';

const DAILY_MAX_DIST = 20000;
const TIME_PER_ROUND = 60;

interface RoundResult {
  score: number;
  timeMs: number | null;
  guessLat: number | null;
  guessLng: number | null;
  country: string | null;
  distance: number | null;
}

export default function DailyScreen() {
  const router = useRouter();
  const secret = useAuthStore((s) => s.secret);
  const user = useAuthStore((s) => s.user);
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
      setCurrentRound(1);
      setPinPoint(null);
      setShowAnswer(false);
      setRoundResults([]);
      roundStartedAtRef.current = Date.now();
      setPhase('game');
    }
  }, [phase, locationData]);

  // AppState DQ — entering background during the game phase disqualifies the run.
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

  // Hardware back during game → confirm exit (route to landing).
  useEffect(() => {
    if (phase !== 'game') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setPhase('landing');
      return true;
    });
    return () => sub.remove();
  }, [phase]);

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

  const advance = useCallback(async () => {
    const nextRound = currentRound + 1;
    if (nextRound > totalRounds) {
      // Submit
      const rounds = roundResults.map((r) => ({
        score: Math.round(r.score ?? 0),
        timeMs: r.timeMs,
        guessLat: r.guessLat,
        guessLng: r.guessLng,
        country: r.country,
      }));
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
      } catch (err) {
        setSubmitResponse({ error: true, score: totalScore, disqualified });
      }
      setPhase('results');
      fetchResults();
      return;
    }

    // Animate transition then advance.
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

  // ─── Render ───────────────────────────────────────────────────────────────

  if (phase === 'submitting') {
    return <SubmittingOverlay />;
  }

  if (phase === 'results') {
    // Prefer freshly submitted rounds; fall back to server-persisted history.
    const effectiveRounds = finalRounds.length
      ? finalRounds
      : (results?.user?.ownRounds ?? []).map((r: any) => ({
          score: r.score ?? 0,
          timeMs: r.timeMs ?? null,
          guessLat: r.guessLat ?? null,
          guessLng: r.guessLng ?? null,
          country: r.country ?? null,
          distance: r.distance ?? null,
        }));
    const totalScore =
      submitResponse?.score ??
      results?.user?.ownScore ??
      effectiveRounds.reduce((s: number, r: any) => s + (r.score || 0), 0);
    return (
      <DailyResultsScreen
        date={date}
        rounds={effectiveRounds}
        locations={locationData?.locations ?? []}
        totalScore={totalScore}
        submitResponse={submitResponse}
        results={results}
        loadingResults={loadingResults}
        isLoggedIn={isLoggedIn}
        disqualified={disqualified || submitResponse?.disqualified}
        onClose={() => router.back()}
      />
    );
  }

  if (phase === 'loading' || (phase === 'game' && !currentLocation)) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#4CAF50" size="large" />
      </View>
    );
  }

  if (phase === 'landing' || phase === 'confirming') {
    return (
      <View style={{ flex: 1, backgroundColor: '#08120d' }}>
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

  // phase === 'game'
  const currentRoundScore = roundResults[currentRound - 1]?.score ?? 0;
  const currentDistance = roundResults[currentRound - 1]?.distance ?? null;
  const isFinal = currentRound >= totalRounds;
  const totalScoreSoFar = roundResults.reduce((s, r) => s + (r.score || 0), 0);

  return (
    <View style={{ flex: 1 }}>
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
        isShowingResult={showAnswer}
        guessPosition={pinPoint}
        onGuessPositionChange={setPinPoint}
        onSubmitPin={handleSubmitPin}
        topCenterSlot={<DailyRoundBadge round={currentRound} total={totalRounds} />}
        topLeftSlot={
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
        }
        endBannerContent={
          <ClassicEndBanner
            round={currentRound}
            totalRounds={totalRounds}
            points={currentRoundScore}
            distance={currentDistance ?? undefined}
            didGuess={!!roundResults[currentRound - 1]?.guessLat}
            onNext={advance}
            isFinal={isFinal}
          />
        }
      />
      <DailyDisqualifiedModal
        visible={showDqModal}
        onClose={() => setShowDqModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#08120d',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
