import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { calcPoints, colors, findDistance } from '../../src/shared';
import { borderRadius, fontSizes, spacing } from '../../src/styles/theme';
import GameSurface, { GameSurfaceHandle } from '../../src/components/game/GameSurface';
import CountryEndBanner from '../../src/components/game/CountryEndBanner';
import OnboardingComplete from '../../src/components/onboarding/OnboardingComplete';
import WelcomeOverlay from '../../src/components/onboarding/WelcomeOverlay';
import AccountSelectSheet from '../../src/components/auth/AccountSelectSheet';
import { ONBOARDING_LOCATIONS } from '../../src/shared/data/onboardingLocations';
import { flagUrl, shuffle } from '../../src/shared/data/countryHelpers';
import { useOnboardingStore } from '../../src/store/onboardingStore';
import { useAuthStore } from '../../src/store/authStore';
import { useMultiplayerStore } from '../../src/store/multiplayerStore';
import { wsService } from '../../src/services/websocket';
import { onboardingAnalytics } from '../../src/services/onboardingAnalytics';

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
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authUsername = useAuthStore((s) => s.user?.username);

  const [round, setRound] = useState(1);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [guessPosition, setGuessPosition] = useState<{ lat: number; lng: number } | null>(null);

  const [authSheetVisible, setAuthSheetVisible] = useState(false);
  const pendingAuthAction = useRef<null | (() => void)>(null);
  const surfaceRef = useRef<GameSurfaceHandle>(null);

  const totalPoints = useMemo(
    () => results.reduce((sum, r) => sum + r.points, 0),
    [results],
  );
  const maxPoints = settledMode === 'country' ? COUNTRY_MAX : CLASSIC_MAX;

  const currentLoc = ONBOARDING_LOCATIONS[round - 1];
  const otherOptions = useMemo(() => {
    return shuffle([...currentLoc.otherOptions, currentLoc.country]);
  }, [round, currentLoc]);

  // Preload flag images on mount so country buttons don't pop in.
  useEffect(() => {
    const codes = ONBOARDING_LOCATIONS.flatMap((l) => [l.country, ...l.otherOptions]);
    Array.from(new Set(codes)).forEach((cc) => {
      Image.prefetch(flagUrl(cc)).catch(() => {});
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
    router.dismissAll();
    router.replace('/(tabs)/home');
  }, [markComplete, router]);

  const handleQuit = () => {
    if (mode === 'country' || mode === 'classic') {
      onboardingAnalytics.end(settledMode, 'quit');
    }
    markComplete();
    router.dismissAll();
    router.replace('/(tabs)/home');
  };

  const submitCountryAnswer = (answer: string) => {
    if (showResult) return;
    const correct = currentLoc.country;
    const isCorrect = answer === correct;
    const points = isCorrect ? 1000 : 0;
    setResults((prev) => [...prev, { points, picked: answer, correct }]);
    setShowResult(true);
  };

  const submitClassicGuess = () => {
    if (!guessPosition || showResult) return;
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
    setShowResult(true);
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
    });
  }, [round]);

  // Auth-gated continuation
  const requireAuth = (action: () => void) => {
    if (isAuthenticated) {
      action();
      return;
    }
    pendingAuthAction.current = action;
    setAuthSheetVisible(true);
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
    markComplete();
    cb();
  };

  const onClassicCard = () => {
    onboardingAnalytics.continue('classic');
    onboardingAnalytics.end(settledMode, 'classic');
    finish(() => {
      router.dismissAll();
      router.push({
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
        wsService.send({ type: 'publicDuel' });
        useMultiplayerStore.setState({ gameQueued: 'publicDuel' });
        router.dismissAll();
        router.push('/queue');
      });
    });
  };

  const onCommunityMapsCard = () => {
    onboardingAnalytics.continue('communitymaps');
    onboardingAnalytics.end(settledMode, 'communitymaps');
    finish(() => {
      router.dismissAll();
      router.replace('/(tabs)/maps');
    });
  };

  const onCountryGuesserCard = () => {
    onboardingAnalytics.continue('countryguesser');
    onboardingAnalytics.end(settledMode, 'countryguesser');
    finish(() => {
      router.dismissAll();
      router.push('/countryGuesser/config');
    });
  };

  const onHomeCard = () => {
    onboardingAnalytics.homeClicked();
    onboardingAnalytics.end(settledMode, 'home');
    finish(() => {
      router.dismissAll();
      router.replace('/(tabs)/home');
    });
  };

  const lastResult = results[results.length - 1];
  const isFinalRound = round >= TOTAL_ROUNDS;

  // ── Slot content ───────────────────────────────────────────────────────
  const topLeftSlot = !isUndecided ? (
    <Pressable
      onPress={handleQuit}
      style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.85 }]}
    >
      <LinearGradient
        colors={['rgba(156,82,39,0.9)', 'rgba(91,29,29,0.9)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.backBtnInner}
      >
        <Ionicons name="close" size={22} color={colors.white} />
      </LinearGradient>
    </Pressable>
  ) : null;

  const topCenterSlot = !isUndecided ? (
    <View style={styles.roundChip}>
      <Text style={styles.roundChipText}>
        Tutorial · Round {round}/{TOTAL_ROUNDS}
      </Text>
      <Text style={styles.roundChipSub}>
        {totalPoints.toLocaleString()} / {maxPoints.toLocaleString()} pts
      </Text>
    </View>
  ) : null;

  const topRightSlot = (
    <View style={styles.toolbar}>
      <Pressable
        onPress={() => {
          markComplete();
          router.dismissAll();
          router.push('/party/join');
        }}
        style={({ pressed }) => [styles.toolbarBtn, styles.toolbarBtnBlue, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="enter-outline" size={18} color={colors.white} />
        <Text style={styles.toolbarBtnText}>Join Party</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          if (isAuthenticated) {
            markComplete();
            router.dismissAll();
            router.push('/(tabs)/account');
          } else {
            setAuthSheetVisible(true);
          }
        }}
        style={({ pressed }) => [styles.toolbarBtn, pressed && { opacity: 0.85 }]}
      >
        <Ionicons
          name={isAuthenticated ? 'person-circle' : 'person-circle-outline'}
          size={18}
          color={colors.white}
        />
        <Text style={styles.toolbarBtnText} numberOfLines={1}>
          {isAuthenticated ? authUsername || 'Account' : 'Login'}
        </Text>
      </Pressable>
    </View>
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
            streak={results.filter((r) => r.points > 0).length}
            round={round}
            totalRounds={TOTAL_ROUNDS}
            onNext={advanceRound}
            autoAdvanceMs={7000}
            isFinal={isFinalRound}
            factText={factText}
          />
        )
        : (
          <View style={styles.classicBanner}>
            <Text style={styles.classicBannerRound}>
              Round {round}/{TOTAL_ROUNDS}
            </Text>
            <Text style={styles.classicBannerDistance}>
              {lastResult.distance && lastResult.distance >= 1
                ? `Your guess was ${Math.round(lastResult.distance).toLocaleString()} km away`
                : `Your guess was ${Math.round((lastResult.distance ?? 0) * 1000)} m away`}
            </Text>
            <Text
              style={[
                styles.classicBannerPoints,
                {
                  color:
                    lastResult.points >= 4000
                      ? colors.success
                      : lastResult.points >= 2000
                        ? colors.warning
                        : colors.error,
                },
              ]}
            >
              {lastResult.points.toLocaleString()} points
            </Text>
            <Text style={styles.classicBannerFact}>{factText}</Text>
            <Pressable
              onPress={advanceRound}
              style={({ pressed }) => [pressed && { opacity: 0.85 }]}
            >
              <LinearGradient
                colors={[colors.primary, colors.primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.classicNextBtn}
              >
                <Text style={styles.classicNextBtnText}>
                  {isFinalRound ? 'View Results' : 'Next Round'}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        )
      : null;

  return (
    <View style={{ flex: 1 }}>
      <GameSurface
        ref={surfaceRef}
        location={currentLoc}
        roundKey={`${settledMode}-${round}`}
        variant={settledMode === 'classic' ? 'pin' : 'country'}
        hideInputs={isUndecided}
        guessPosition={guessPosition}
        onGuessPositionChange={setGuessPosition}
        onSubmitPin={submitClassicGuess}
        countryOptions={otherOptions}
        countryPicked={lastResult?.picked ?? null}
        correctAnswer={showResult ? lastResult?.correct ?? null : null}
        onAnswerCountry={submitCountryAnswer}
        isShowingResult={!isUndecided && showResult}
        guessPoints={lastResult?.points}
        topLeftSlot={topLeftSlot}
        topCenterSlot={topCenterSlot}
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

const styles = StyleSheet.create({
  backBtn: {
    overflow: 'hidden',
    borderRadius: 12,
  },
  backBtnInner: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.4,
    borderColor: '#85200c',
  },
  roundChip: {
    backgroundColor: 'rgba(8, 22, 12, 0.85)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    alignItems: 'center',
  },
  roundChipText: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-Bold',
  },
  roundChipSub: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(36, 87, 52, 0.9)',
    borderColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    maxWidth: 160,
  },
  toolbarBtnBlue: {
    backgroundColor: 'rgba(37, 99, 235, 0.92)',
    borderColor: 'rgba(147, 197, 253, 0.55)',
  },
  toolbarBtnText: {
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.sm,
  },
  classicBanner: {
    backgroundColor: 'rgba(17, 43, 24, 0.92)',
    borderRadius: 12,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  classicBannerRound: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-SemiBold',
    textAlign: 'center',
  },
  classicBannerDistance: {
    color: colors.white,
    fontSize: fontSizes.lg,
    fontFamily: 'Lexend-SemiBold',
    textAlign: 'center',
  },
  classicBannerPoints: {
    fontSize: fontSizes['2xl'],
    fontFamily: 'Lexend-Bold',
    textAlign: 'center',
  },
  classicBannerFact: {
    color: 'rgba(255, 230, 170, 0.92)',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-Medium',
    textAlign: 'center',
    lineHeight: 19,
    marginTop: spacing.xs,
  },
  classicNextBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['3xl'],
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    minWidth: 200,
  },
  classicNextBtnText: {
    color: colors.white,
    fontSize: fontSizes.lg,
    fontFamily: 'Lexend-SemiBold',
  },
});
