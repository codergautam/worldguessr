import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { calcPoints, findDistance } from '../../src/shared';
import { haptics, hapticForScore } from '../../src/services/haptics';
import { dismissAllSafe } from '../../src/utils/navigation';
import GameSurface, { GameSurfaceHandle } from '../../src/components/game/GameSurface';
import GameTimer from '../../src/components/game/GameTimer';
import CountryEndBanner from '../../src/components/game/CountryEndBanner';
import ClassicEndBanner from '../../src/components/game/ClassicEndBanner';
import TopRightActions from '../../src/components/game/TopRightActions';
import BackButton from '../../src/components/ui/BackButton';
import OnboardingComplete from '../../src/components/onboarding/OnboardingComplete';
import WelcomeOverlay from '../../src/components/onboarding/WelcomeOverlay';
import AccountSelectSheet from '../../src/components/auth/AccountSelectSheet';
import { ONBOARDING_LOCATIONS } from '../../src/shared/data/onboardingLocations';
import { flagUrl, shuffle } from '../../src/shared/data/countryHelpers';
import { useOnboardingStore } from '../../src/store/onboardingStore';
import { useAuthStore } from '../../src/store/authStore';
import { useMultiplayerStore } from '../../src/store/multiplayerStore';
import { onboardingAnalytics } from '../../src/services/onboardingAnalytics';
import { SINGLEPLAYER_DEFAULT_MODE_KEY } from '../../src/hooks/useCountryGuesserGame';
import { useLoginPrompt } from '../../src/hooks/useGoogleSignIn';

const TOTAL_ROUNDS = 3;
const COUNTRY_MAX = 3000;
const CLASSIC_MAX = 15000;
const ONBOARDING_MAX_DIST = 20000;

type Mode = 'country' | 'classic';
type ModeState = Mode | 'undecided';

interface RoundResult {
  points: number;
  distance?: number;
  picked?: string;
  correct: string;
  guessLat?: number;
  guessLng?: number;
}

const OnboardingRoundHud = memo(function OnboardingRoundHud({
  round,
  totalRounds,
  totalPoints,
}: {
  round: number;
  totalRounds: number;
  totalPoints: number;
}) {
  return (
    <GameTimer
      timeRemaining={60}
      onTimeUp={() => {}}
      isPaused
      roundKey={round}
      currentRound={round}
      totalRounds={totalRounds}
      totalScore={totalPoints}
      showTimer={false}
    />
  );
});

export default function OnboardingPlay() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const router = useRouter();

  const initialMode: ModeState =
    params.mode === 'classic'
      ? 'classic'
      : params.mode === 'country'
        ? 'country'
        : 'undecided';

  const [mode, setMode] = useState<ModeState>(initialMode);
  const isUndecided = mode === 'undecided';
  const settledMode: Mode = mode === 'classic' ? 'classic' : 'country';

  const markComplete = useOnboardingStore((s) => s.markComplete);
  // Country guesser shares ONE persistent streak counter across onboarding and
  // the real game (useCountryGuesserGame reads/bumps the same store value), so
  // a streak built here carries straight in — web parity (gameUI.js).
  const bumpStreak = useOnboardingStore((s) => s.bumpStreak);
  const resetStreak = useOnboardingStore((s) => s.resetStreak);
  const countryStreak = useOnboardingStore((s) => s.countryStreak);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [round, setRound] = useState(1);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [guessPosition, setGuessPosition] = useState<{ lat: number; lng: number } | null>(null);

  const [authSheetVisible, setAuthSheetVisible] = useState(false);
  const pendingAuthAction = useRef<null | (() => void)>(null);
  const surfaceRef = useRef<GameSurfaceHandle>(null);
  const resultSubmittingRef = useRef(false);

  const totalPoints = useMemo(
    () => results.reduce((sum, r) => sum + r.points, 0),
    [results],
  );
  const maxPoints = settledMode === 'country' ? COUNTRY_MAX : CLASSIC_MAX;

  const currentLoc = ONBOARDING_LOCATIONS[round - 1];
  const otherOptions = useMemo(() => {
    return shuffle([...currentLoc.otherOptions, currentLoc.country]);
  }, [round, currentLoc]);

  // Preload flag images on mount so country buttons don't pop in. The URLs
  // must match the rendered sizes EXACTLY or the cache never hits: buttons
  // render w80 (CountryButtons), the end banner renders the w160 default.
  useEffect(() => {
    const codes = ONBOARDING_LOCATIONS.flatMap((l) => [l.country, ...l.otherOptions]);
    Array.from(new Set(codes)).forEach((cc) => {
      Image.prefetch(flagUrl(cc, 'w80')).catch(() => {});
    });
    ONBOARDING_LOCATIONS.forEach((l) => {
      Image.prefetch(flagUrl(l.country)).catch(() => {});
    });
  }, []);

  // Fire tutorial_begin once a real mode is picked.
  useEffect(() => {
    if (mode === 'country' || mode === 'classic') {
      onboardingAnalytics.begin(mode);
    }
  }, [mode]);

  const handleWelcomeMode = useCallback((picked: 'country' | 'classic') => {
    onboardingAnalytics.modeSelected(picked);
    setMode(picked);
  }, []);

  const handleWelcomeSkip = useCallback(() => {
    onboardingAnalytics.modeSelected('skipped');
    markComplete();
    dismissAllSafe();
    router.replace('/(tabs)/home');
  }, [markComplete, router]);

  const handleQuit = () => {
    if (mode === 'country' || mode === 'classic') {
      onboardingAnalytics.end(settledMode, 'quit');
    }
    markComplete();
    dismissAllSafe();
    router.replace('/(tabs)/home');
  };

  const submitCountryAnswer = (answer: string) => {
    if (showResult || resultSubmittingRef.current) return;
    resultSubmittingRef.current = true;
    const correct = currentLoc.country;
    const isCorrect = answer === correct;
    const points = isCorrect ? 1000 : 0;
    if (isCorrect) haptics.success();
    else haptics.light();
    // Drive the shared persistent streak so it carries into country guesser.
    if (isCorrect) {
      bumpStreak('country');
    } else {
      resetStreak('country');
    }
    setShowResult(true);
    setResults((prev) => [...prev, { points, picked: answer, correct }]);
  };

  const submitClassicGuess = () => {
    if (!guessPosition || showResult || resultSubmittingRef.current) return;
    resultSubmittingRef.current = true;
    const distance = findDistance(
      currentLoc.lat,
      currentLoc.long,
      guessPosition.lat,
      guessPosition.lng,
    );
    const points = calcPoints({
      lat: currentLoc.lat,
      lon: currentLoc.long,
      guessLat: guessPosition.lat,
      guessLon: guessPosition.lng,
      maxDist: ONBOARDING_MAX_DIST,
    });
    hapticForScore(points); // close-based feedback, like the normal game
    setShowResult(true);
    setResults((prev) => [
      ...prev,
      {
        points,
        distance,
        correct: currentLoc.country,
        guessLat: guessPosition.lat,
        guessLng: guessPosition.lng,
      },
    ]);
  };

  const advanceRound = useCallback(() => {
    if (round >= TOTAL_ROUNDS) {
      setShowComplete(true);
      return;
    }
    // Drive the round bump through GameSurface so the loading banner is
    // fully opaque before we swap to the next location — same flicker-free
    // handoff classic singleplayer uses.
    surfaceRef.current?.beginRoundTransition(() => {
      setRound((r) => r + 1);
      setGuessPosition(null);
      setShowResult(false);
      resultSubmittingRef.current = false;
    });
  }, [round]);

  // Android: straight to native Google sign-in; iOS: chooser sheet.
  const promptLogin = useLoginPrompt(() => setAuthSheetVisible(true));

  // Auth-gated continuation. iOS runs the pending action from the sheet's
  // onClose (handleAuthSheetClose); Android's direct Google flow never opens
  // the sheet, so promptLogin's onSuccess drains the same ref instead — and
  // clears it so a later sheet close can't double-fire the action.
  const requireAuth = (action: () => void) => {
    if (isAuthenticated) {
      action();
      return;
    }
    pendingAuthAction.current = action;
    promptLogin(() => {
      const pending = pendingAuthAction.current;
      pendingAuthAction.current = null;
      pending?.();
    });
  };

  const handleAuthSheetClose = () => {
    setAuthSheetVisible(false);
    if (isAuthenticated && pendingAuthAction.current) {
      const action = pendingAuthAction.current;
      pendingAuthAction.current = null;
      action();
    } else {
      pendingAuthAction.current = null;
    }
  };

  const finish = (cb: () => void) => {
    // Drop the native <Modal> before navigating. Without this, showComplete
    // stays true and the modal floats above the screen we push to (it lives in
    // a separate native window), so it looks "stuck open" after a choice.
    // Mirrors how handleAuthSheetClose hides the sheet before its action runs.
    setShowComplete(false);
    markComplete();
    cb();
  };

  // Launch a destination chosen from the onboarding-complete modal. The onboarding
  // screen is the navigation stack ROOT for first-time users (app/index.tsx
  // redirects here), so a plain router.push leaves it sitting UNDERNEATH the game —
  // and the in-game "exit to home" (dismissAllSafe → POP_TO_TOP) then pops back to
  // it, re-showing this modal instead of going home. Install home as the stack base
  // (replace), THEN push the destination, so the stack is [home, destination] and
  // backing out of the game lands on home. expo-router drains the replace before the
  // push, so the [home, destination] result is deterministic. (The Home and
  // Community-Maps cards navigate with a single router.replace and are already
  // correct — they don't push anything on top.)
  const launchFromOnboarding = (dest: Parameters<typeof router.push>[0]) => {
    router.replace('/(tabs)/home');
    router.push(dest);
  };

  const onClassicCard = () => {
    onboardingAnalytics.continue('classic');
    onboardingAnalytics.end(settledMode, 'classic');
    finish(() => {
      launchFromOnboarding({
        pathname: '/game/[id]',
        params: { id: 'singleplayer', map: 'all', rounds: '5' },
      });
    });
  };

  const onDuelCard = () => {
    requireAuth(() => {
      onboardingAnalytics.continue('duel');
      onboardingAnalytics.end(settledMode, 'duel');
      finish(() => {
        useMultiplayerStore.getState().joinQueue('publicDuel');
        launchFromOnboarding('/queue');
      });
    });
  };

  const onCommunityMapsCard = () => {
    onboardingAnalytics.continue('communitymaps');
    onboardingAnalytics.end(settledMode, 'communitymaps');
    finish(() => {
      dismissAllSafe();
      router.replace('/(tabs)/maps');
    });
  };

  const onCountryGuesserCard = () => {
    onboardingAnalytics.continue('countryguesser');
    onboardingAnalytics.end(settledMode, 'countryguesser');
    finish(() => {
      AsyncStorage.setItem(SINGLEPLAYER_DEFAULT_MODE_KEY, 'countryGuesser').catch(() => {});
      launchFromOnboarding({
        pathname: '/game/[id]',
        params: { id: 'singleplayer', map: 'all', rounds: '10', mode: 'countryGuesser' },
      });
    });
  };

  const onHomeCard = () => {
    onboardingAnalytics.homeClicked();
    onboardingAnalytics.end(settledMode, 'home');
    finish(() => {
      dismissAllSafe();
      router.replace('/(tabs)/home');
    });
  };

  const lastResult = results[results.length - 1];
  const isFinalRound = round >= TOTAL_ROUNDS;

  // ── Slot content ───────────────────────────────────────────────────────
  const topLeftSlot = !isUndecided ? (
    <BackButton onPress={handleQuit} icon="close" />
  ) : null;

  const roundHud = !isUndecided ? (
    <OnboardingRoundHud round={round} totalRounds={TOTAL_ROUNDS} totalPoints={totalPoints} />
  ) : null;

  const topRightSlot = (
    <TopRightActions
      onBeforeNavigate={() => {
        markComplete();
        dismissAllSafe();
      }}
    >
      {roundHud}
    </TopRightActions>
  );

  // Onboarding rounds get the landmark fact below the message — exact same
  // copy the web shows under `motivation locationFact` in endBanner.js.
  const factText = currentLoc.fact;

  const endBannerContent =
    showResult && lastResult
      ? settledMode === 'country'
        ? (
          <CountryEndBanner
            mode="country"
            correctCountry={lastResult.correct}
            picked={lastResult.picked || null}
            points={lastResult.points}
            streak={countryStreak}
            round={round}
            totalRounds={TOTAL_ROUNDS}
            onNext={advanceRound}
            autoAdvanceMs={7000}
            isFinal={isFinalRound}
            factText={factText}
            hideQuip
          />
        )
        : (
          <ClassicEndBanner
            round={round}
            totalRounds={TOTAL_ROUNDS}
            points={lastResult.points}
            distance={lastResult.distance}
            onNext={advanceRound}
            isFinal={isFinalRound}
            factText={factText}
            compact
          />
        )
      : null;

  return (
    <View style={{ flex: 1 }}>
      <GameSurface
        ref={surfaceRef}
        location={currentLoc}
        // Warm the next onboarding pano during the result screen → no loading
        // cover on advance (hardcoded list, so the next round is known ahead).
        nextLocation={round < ONBOARDING_LOCATIONS.length ? ONBOARDING_LOCATIONS[round] : null}
        roundKey={`${settledMode}-${round}`}
        variant={settledMode === 'classic' ? 'pin' : 'country'}
        hideInputs={isUndecided}
        guessPosition={guessPosition}
        onGuessPositionChange={setGuessPosition}
        onSubmitPin={submitClassicGuess}
        countryOptions={otherOptions}
        // Gated on showResult so the previous round's pick doesn't leak into
        // the next round's `selected` (singleplayer clears picked on advance).
        countryPicked={showResult ? lastResult?.picked ?? null : null}
        correctAnswer={showResult ? lastResult?.correct ?? null : null}
        onAnswerCountry={submitCountryAnswer}
        isShowingResult={!isUndecided && showResult}
        guessPoints={lastResult?.points}
        topLeftSlot={topLeftSlot}
        topRightSlot={topRightSlot}
        endBannerContent={endBannerContent}
        loadingMessage="Loading…"
      />

      <OnboardingComplete
        visible={showComplete}
        mode={settledMode}
        points={totalPoints}
        onClassic={onClassicCard}
        onDuel={onDuelCard}
        onCommunityMaps={onCommunityMapsCard}
        onCountryGuesser={onCountryGuesserCard}
        onHome={onHomeCard}
      />

      <WelcomeOverlay
        visible={isUndecided}
        onModeSelected={handleWelcomeMode}
        onSkip={handleWelcomeSkip}
      />

      <AccountSelectSheet visible={authSheetVisible} onClose={handleAuthSheetClose} />
    </View>
  );
}
