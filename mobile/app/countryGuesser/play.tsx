import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/shared';
import { borderRadius, fontSizes, spacing } from '../../src/styles/theme';
import GameSurface, { GameSurfaceHandle } from '../../src/components/game/GameSurface';
import GameLoadingOverlay from '../../src/components/game/GameLoadingOverlay';
import CountryEndBanner from '../../src/components/game/CountryEndBanner';
import {
  ALL_CONTINENTS,
  continentFromCode,
  pickDistractors,
  shuffle,
} from '../../src/shared/data/countryHelpers';
import { api } from '../../src/services/api';
import { useOnboardingStore } from '../../src/store/onboardingStore';

const TOTAL_ROUNDS = 10;
const POINTS_PER_ROUND = 1000;

interface Location {
  lat: number;
  long: number;
  country: string;
  heading?: number | null;
  pitch?: number;
}

type SubMode = 'country' | 'continent';

interface RoundResult {
  picked: string;
  correct: string;
  points: number;
}

export default function CountryGuesserPlay() {
  const params = useLocalSearchParams<{ subMode?: string; region?: string }>();
  const router = useRouter();

  const subMode: SubMode = params.subMode === 'continent' ? 'continent' : 'country';
  const region = (params.region ?? 'all') as string;

  const countryStreak = useOnboardingStore((s) => s.countryStreak);
  const continentStreak = useOnboardingStore((s) => s.continentStreak);
  const bumpStreak = useOnboardingStore((s) => s.bumpStreak);
  const resetStreak = useOnboardingStore((s) => s.resetStreak);

  const streak = subMode === 'continent' ? continentStreak : countryStreak;

  const [allLocs, setAllLocs] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [round, setRound] = useState(1);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const surfaceRef = useRef<GameSurfaceHandle>(null);

  // Fetch locations once on mount; filter by region for non-world country play.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await api.fetchAllLocations();
        if (cancelled) return;
        if (!data.ready || !data.locations || data.locations.length === 0) {
          throw new Error('No locations available');
        }
        const normalized: Location[] = data.locations
          .map((l) => ({
            lat: l.lat,
            long: l.long ?? (l as any).lng,
            country: (l.country ?? '').toUpperCase(),
            heading: l.heading ?? l.head ?? null,
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
  }, [region, subMode]);

  // Cursor + per-round option generation. Continent mode skips locations
  // whose country doesn't resolve to a known continent (mirrors web's guard).
  const cursorRef = useRef(0);
  const [currentLoc, setCurrentLoc] = useState<Location | null>(null);
  const [otherOptions, setOtherOptions] = useState<string[]>([]);

  useEffect(() => {
    if (allLocs.length === 0 || loading) return;
    if (round > TOTAL_ROUNDS) return;

    let nextLoc: Location | null = null;
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

    if (subMode === 'continent') {
      setOtherOptions([...ALL_CONTINENTS]);
    } else {
      const distractors = pickDistractors(nextLoc.country, 5);
      setOtherOptions(shuffle([...distractors, nextLoc.country]));
    }
  }, [round, allLocs, loading, subMode]);

  const submit = useCallback(
    async (answer: string) => {
      if (!currentLoc || showResult) return;
      const correct =
        subMode === 'continent' ? continentFromCode(currentLoc.country) : currentLoc.country;
      const isCorrect = answer === correct;
      const points = isCorrect ? POINTS_PER_ROUND : 0;
      setPicked(answer);
      setResults((prev) => [...prev, { picked: answer, correct, points }]);
      setShowResult(true);

      if (isCorrect) {
        await bumpStreak(subMode);
      } else {
        await resetStreak(subMode);
      }
    },
    [currentLoc, showResult, subMode, bumpStreak, resetStreak],
  );

  const advance = useCallback(() => {
    // Defer the actual round bump until the loading banner has fully covered
    // the current scene — prevents the panorama flash between rounds.
    surfaceRef.current?.beginRoundTransition(() => {
      setShowResult(false);
      setPicked(null);
      setRound((r) => r + 1);
    });
  }, []);

  const handleQuit = () => {
    router.dismissAll();
    router.replace('/(tabs)/home');
  };

  const totalPoints = useMemo(
    () => results.reduce((s, r) => s + r.points, 0),
    [results],
  );

  const lastResult = results[results.length - 1];
  const isFinal = round >= TOTAL_ROUNDS;
  const isOver = round > TOTAL_ROUNDS;

  // Game-over screen
  if (isOver) {
    return (
      <View style={styles.root}>
        <ImageBackground
          source={require('../../assets/street2.jpg')}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />
        <View style={styles.darkOverlay} />
        <SafeAreaView style={styles.summarySafe} edges={['top', 'bottom']}>
          <View style={styles.summaryCard}>
            <Ionicons name="flag" size={56} color={colors.warning} />
            <Text style={styles.summaryTitle}>Game complete!</Text>
            <Text style={styles.summaryScore}>
              {totalPoints.toLocaleString()} / {(TOTAL_ROUNDS * POINTS_PER_ROUND).toLocaleString()}
            </Text>
            <Text style={styles.summarySub}>
              {results.filter((r) => r.points > 0).length} correct out of {TOTAL_ROUNDS}
            </Text>

            <Pressable
              onPress={() => router.replace('/countryGuesser/config')}
              style={({ pressed }) => [pressed && { opacity: 0.85 }, { width: '100%' }]}
            >
              <LinearGradient
                colors={[colors.primary, colors.primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.summaryBtn}
              >
                <Text style={styles.summaryBtnText}>Play again</Text>
              </LinearGradient>
            </Pressable>

            <Pressable onPress={handleQuit} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
              <Text style={styles.summaryHomeText}>Main Menu</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // Initial-load / load-error states. Once locations have loaded, the
  // GameSurface's own loading overlay handles per-round panorama loads.
  if (loading || loadError || !currentLoc) {
    return (
      <View style={styles.root}>
        <GameLoadingOverlay
          message="Loading locations…"
          error={loadError}
          onRetry={() => router.back()}
          retryLabel="Go back"
        />
      </View>
    );
  }

  // ── Slot content ───────────────────────────────────────────────────────
  const topLeftSlot = (
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
  );

  const topCenterSlot = (
    <View style={styles.roundChip}>
      <Text style={styles.roundChipText}>
        Round {round}/{TOTAL_ROUNDS}
      </Text>
      <Text style={styles.roundChipSub}>{totalPoints.toLocaleString()} pts</Text>
    </View>
  );

  const topRightSlot =
    streak > 0 ? (
      <View style={styles.streakChip}>
        <Text style={styles.streakChipText}>🔥 {streak}</Text>
      </View>
    ) : null;

  const endBannerContent =
    showResult && lastResult && currentLoc ? (
      <CountryEndBanner
        mode={subMode}
        correctCountry={currentLoc.country}
        picked={picked}
        points={lastResult.points}
        streak={subMode === 'continent' ? continentStreak : countryStreak}
        round={round}
        totalRounds={TOTAL_ROUNDS}
        onNext={advance}
        isFinal={isFinal}
      />
    ) : null;

  return (
    <GameSurface
      ref={surfaceRef}
      location={currentLoc}
      roundKey={`${subMode}-${region}-${round}`}
      variant={subMode === 'continent' ? 'continent' : 'country'}
      countryOptions={otherOptions}
      countryPicked={picked}
      correctAnswer={
        showResult
          ? subMode === 'continent'
            ? continentFromCode(currentLoc.country)
            : currentLoc.country
          : null
      }
      onAnswerCountry={submit}
      isShowingResult={showResult}
      topLeftSlot={topLeftSlot}
      topCenterSlot={topCenterSlot}
      topRightSlot={topRightSlot}
      endBannerContent={endBannerContent}
      loadingMessage="Loading…"
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#08120d' },
  darkOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
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
  streakChip: {
    backgroundColor: 'rgba(251,191,36,0.18)',
    borderColor: 'rgba(251,191,36,0.5)',
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  streakChipText: {
    color: colors.warning,
    fontFamily: 'Lexend-Bold',
    fontSize: fontSizes.sm,
  },
  summarySafe: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  summaryCard: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: '#0f1d13',
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  summaryTitle: {
    color: colors.white,
    fontFamily: 'Lexend-Bold',
    fontSize: fontSizes['2xl'],
  },
  summaryScore: {
    color: colors.warning,
    fontFamily: 'Lexend-Bold',
    fontSize: 40,
  },
  summarySub: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'Lexend',
    fontSize: fontSizes.sm,
    marginBottom: spacing.md,
  },
  summaryBtn: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  summaryBtnText: {
    color: colors.white,
    fontFamily: 'Lexend-Bold',
    fontSize: fontSizes.md,
  },
  summaryHomeText: {
    color: 'rgba(255,255,255,0.5)',
    fontFamily: 'Lexend-Medium',
    fontSize: fontSizes.sm,
    marginTop: spacing.sm,
  },
});
