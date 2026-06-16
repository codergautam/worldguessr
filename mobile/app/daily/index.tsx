import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, AppState, type AppStateStatus, BackHandler, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { t } from '../../src/shared';
import { haptics } from '../../src/services/haptics';
import { useAuthStore } from '../../src/store/authStore';
import { useDailyChallenge } from '../../src/components/daily/useDailyChallenge';
import DailyLanding from '../../src/components/daily/DailyLanding';
import DailyConfirmStartModal from '../../src/components/daily/DailyConfirmStartModal';
import DailyDisqualifiedModal from '../../src/components/daily/DailyDisqualifiedModal';
import DailyResultsScreen from '../../src/components/daily/DailyResultsScreen';
import SubmittingOverlay from '../../src/components/daily/SubmittingOverlay';
import DailyBackground from '../../src/components/daily/DailyBackground';
import ReviewPromptModal from '../../src/components/ReviewPromptModal';
import { useReviewPrompt } from '../../src/hooks/useReviewPrompt';
import GameSurface, { type GameSurfaceHandle } from '../../src/components/game/GameSurface';
import GameTimer from '../../src/components/game/GameTimer';
import ConfettiBurst from '../../src/components/onboarding/ConfettiBurst';
import ClassicEndBanner from '../../src/components/game/ClassicEndBanner';
import calcPoints from '../../src/shared/game/calcPoints';
import { findDistance } from '../../src/shared/game/calcPoints';
import { preloadBorders } from '../../src/shared/game/findCountry';
import { hintCircle } from '@shared/game/hint';
import { dailyColors } from '../../src/components/daily/styles';

type Phase = 'landing' | 'confirming' | 'loading' | 'game' | 'submitting' | 'results';

const DAILY_MAX_DIST = 20000;
const TIME_PER_ROUND = 60;
// Cap the hint circle so react-native-maps renders it (web's ~5870km is too
// large for a Mercator circle). 2500km is still a broad, region-level hint.
const HINT_MAX_RADIUS_M = 2_500_000;
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
    loadingLocations,
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
  // Show Street View ↔ Map toggle on the round-end banner (web parity).
  const [showPano, setShowPano] = useState(false);
  // Hint: 2 per game; using one halves that round's points (web parity).
  const [hintShown, setHintShown] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  // Confetti on a near-perfect round (web fires at >= 4850).
  const [confettiKey, setConfettiKey] = useState(0);

  // Rate-us prompt: daily is a solo (non-party) game, so it counts. Trigger only
  // when the user actually finishes the rounds this session (set in advance()) —
  // NOT when handleStart jumps straight to results for an already-played daily.
  const [finishedThisSession, setFinishedThisSession] = useState(false);
  const review = useReviewPrompt(finishedThisSession);

  // Optimistically bump the live profile totals once a fresh, tracked daily run
  // is submitted, so XP / games-played update instantly without an app reload.
  // Guards: logged-in only, not DQ'd, not an already-submitted replay (those
  // don't award XP server-side), and fire exactly once per result.
  const dailyRewardAppliedRef = useRef(false);
  useEffect(() => {
    if (!isLoggedIn) return;
    if (!submitResponse || dailyRewardAppliedRef.current) return;
    if (submitResponse.error || submitResponse.disqualified || submitResponse.alreadySubmitted) return;
    dailyRewardAppliedRef.current = true;
    // Server XP = sum(round.xp) capped 500, round.xp = clamp(round(score/50),0..100).
    const earnedXp = Math.min(
      500,
      finalRounds.reduce((sum, r) => sum + Math.min(100, Math.round((r.score ?? 0) / 50)), 0),
    );
    useAuthStore.getState().applyGameResult({ xp: earnedXp, gamesPlayed: 1 });
  }, [isLoggedIn, submitResponse, finalRounds]);

  const handleHint = useCallback(() => {
    if (hintShown || hintsUsed >= 2) return;
    setHintShown(true);
    setHintsUsed((n) => n + 1);
  }, [hintShown, hintsUsed]);

  const roundStartedAtRef = useRef<number>(Date.now());
  const gameSurfaceRef = useRef<GameSurfaceHandle>(null);
  const prefetchRef = useRef<PrefetchEntry | null>(null);

  // Fetch user results on mount (drives landing UI); warm the borders cache so
  // the post-guess "It was {country}!" reveal is instant.
  useEffect(() => {
    fetchResults();
    preloadBorders();
  }, []);

  // Prefetch locations once we enter confirming/loading, mirroring web.
  useEffect(() => {
    if ((phase === 'confirming' || phase === 'loading' || phase === 'results') && !locationData) {
      fetchLocations();
    }
  }, [phase, locationData, fetchLocations]);

  // Location-load failures are NOT silently bounced to landing anymore — that left
  // the user guessing why the challenge wouldn't start. Instead the run is blocked
  // at the loading screen, which shows an error + Retry (see the `phase === 'loading'`
  // render below). A best-effort prefetch failure during `confirming` is ignored
  // here: the user hasn't committed yet, and confirming re-fetches into `loading`.

  // Transition loading → game once locations arrive.
  useEffect(() => {
    if (phase === 'loading' && locationData?.locations?.length) {
      prefetchRef.current = null;
      setCurrentRound(1);
      setPinPoint(null);
      setShowAnswer(false);
      setRoundResults([]);
      setHintShown(false);
      setHintsUsed(0);
      roundStartedAtRef.current = Date.now();
      setPhase('game');
    }
  }, [phase, locationData]);

  // AppState DQ — entering a TRUE background during the game phase disqualifies
  // the run (web parity: visibilitychange→'hidden' only, never blur/inactive).
  // Gated on phase==='game' so backgrounding while reviewing results never
  // disqualifies. iOS-only 'inactive' is intentionally excluded: it fires for
  // call banners, permission/Face ID dialogs, and Control/Notification Center
  // pulldowns — transient states that must NOT permanently DQ.
  useEffect(() => {
    if (phase !== 'game' || disqualified) return;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background') {
        setDisqualified(true);
        setShowDqModal(true);
        haptics.warning();
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
      // game phase: a stray back-gesture / button would abandon the run, so
      // confirm first instead of dropping straight back to the landing screen.
      Alert.alert(
        t('leaveGameTitle', undefined, 'Leave game?'),
        t('leaveGameMessage', undefined, 'Your current game will be lost.'),
        [
          { text: t('cancel'), style: 'cancel' },
          { text: t('leaveGameConfirm', undefined, 'Leave'), style: 'destructive', onPress: () => setPhase('landing') },
        ],
      );
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
    haptics.light();
    if (locationData?.locations?.length) {
      setCurrentRound(1);
      setPinPoint(null);
      setShowAnswer(false);
      setRoundResults([]);
      setHintShown(false);
      setHintsUsed(0);
      roundStartedAtRef.current = Date.now();
      setPhase('game');
    } else {
      // Kick the fetch off as we enter loading so the loading screen opens on the
      // spinner (loadingLocations=true, error cleared) instead of flashing a stale
      // prefetch error. The in-flight guard makes the prefetch effect a no-op.
      fetchLocations();
      setPhase('loading');
    }
  }, [locationData, fetchLocations]);

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
          usedHint: hintShown,
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
      setShowPano(false); // each result starts on the map (web default)
      if (score >= 4850) setConfettiKey((k) => k + 1);
    },
    [currentLocation, hintShown],
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
      setFinishedThisSession(true); // eligible game completed → arm the rate-us prompt
      const prefetch = prefetchRef.current;
      // Fast path: the prefetch submitted with the matching DQ state.
      if (prefetch && prefetch.atDisqualified === disqualified) {
        setFinalRounds(roundResults);
        if (prefetch.response) {
          setSubmitResponse(prefetch.response);
          setPhase('results');
          fetchResults();
          if (!disqualified) {
            haptics.success();
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
          haptics.success();
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
      setShowPano(false);
      setHintShown(false); // hint is per-round; the 2/game count persists
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
    // Hard gate: the challenge can't start without locations. A failed fetch shows
    // an error + Retry instead of spinning forever or silently bouncing — the run
    // only proceeds once locations actually load (loading → game effect above).
    const loadFailed = !!locationError && !loadingLocations;
    return (
      <DailyBackground style={styles.loading}>
        {loadFailed ? (
          <View style={styles.loadError}>
            <Ionicons name="cloud-offline-outline" size={52} color={dailyColors.green} />
            <Text style={styles.loadErrorText}>
              {t('dailyLocationsLoadFailed', undefined, "Couldn't load today's challenge. Please check your connection and try again.")}
            </Text>
            <Pressable
              onPress={fetchLocations}
              style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.retryText}>{t('retry')}</Text>
            </Pressable>
            <Pressable onPress={() => setPhase('landing')} hitSlop={10} style={styles.backLink}>
              <Text style={styles.backLinkText}>{t('back')}</Text>
            </Pressable>
          </View>
        ) : (
          <ActivityIndicator color={dailyColors.green} size="large" />
        )}
      </DailyBackground>
    );
  }

  // game / submitting / results all share the SAME mounted GameSurface, so the
  // final-round Street View stays behind the submitting + results overlays for
  // a smooth blurred crossfade instead of a snap to black (mirrors web keeping
  // the StreetView mounted on phase === 'results').
  const isResultsLike = phase === 'results' || phase === 'submitting';
  const hintCircleData =
    hintShown && currentLocation
      ? hintCircle({ lat: currentLocation.lat, long: currentLocation.long }, DAILY_MAX_DIST, currentRound, HINT_MAX_RADIUS_M)
      : null;
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

  // View-only results (opened from the landing's "view results" CTA for an
  // already-completed daily): no game was played this session, so there's no
  // in-session GameSurface to keep behind the modal. Mounting one here would
  // fetch locations and flash a stray, blurred results map behind the backdrop.
  // Render the results card over the plain daily background instead.
  if (phase === 'results' && finalRounds.length === 0) {
    return (
      <View style={styles.root}>
        <DailyBackground style={StyleSheet.absoluteFill} />
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
    );
  }

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
        // Warm the next round's pano during the result screen → no loading cover
        // on "Next" (all daily locations are fetched upfront). Mirror the
        // `location` mapping above so the committed preload matches and won't reload.
        nextLocation={
          currentRound < totalRounds && locationData?.locations?.[currentRound]
            ? {
                lat: locationData.locations[currentRound].lat,
                long: locationData.locations[currentRound].long,
                heading: locationData.locations[currentRound].heading ?? null,
                country: locationData.locations[currentRound].country,
              }
            : null
        }
        variant="pin"
        roundKey={currentRound}
        isShowingResult={showAnswer || isResultsLike}
        showPanoOnResult={showPano}
        onHint={phase === 'game' ? handleHint : undefined}
        hintShown={hintShown}
        hintDisabled={hintsUsed >= 2}
        hintCircleData={hintCircleData}
        maxDist={DAILY_MAX_DIST}
        round={currentRound}
        guessPosition={pinPoint}
        onGuessPositionChange={isResultsLike ? undefined : setPinPoint}
        onSubmitPin={handleSubmitPin}
        topRightSlot={
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
              hasGuess={!!pinPoint}
            />
          ) : undefined
        }
        endBannerContent={
          phase === 'game' ? (
            <ClassicEndBanner
              points={currentRoundScore}
              distance={currentDistance ?? undefined}
              didGuess={!!roundResults[currentRound - 1]?.guessLat}
              answerCountry={currentLocation?.country ?? null}
              guessLat={roundResults[currentRound - 1]?.guessLat ?? null}
              guessLng={roundResults[currentRound - 1]?.guessLng ?? null}
              panoShown={showPano}
              onTogglePano={() => setShowPano((v) => !v)}
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

      {confettiKey > 0 && <ConfettiBurst trigger={confettiKey} />}

      <ReviewPromptModal
        visible={review.visible}
        onRate={review.onRate}
        onDismiss={review.onDismiss}
      />
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
  loadError: {
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  loadErrorText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Lexend-SemiBold',
    textAlign: 'center',
    lineHeight: 22,
  },
  retryBtn: {
    backgroundColor: dailyColors.green,
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 12,
    marginTop: 4,
  },
  retryText: {
    color: '#fff',
    fontFamily: 'Lexend-SemiBold',
    fontSize: 15,
  },
  backLink: {
    paddingVertical: 6,
  },
  backLinkText: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'Lexend-Medium',
    fontSize: 14,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3000,
    elevation: 80,
  },
});
