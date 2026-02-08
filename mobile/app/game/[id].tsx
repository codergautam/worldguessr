import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, calcPoints, findDistance } from '../../src/shared';
import { spacing, fontSizes, borderRadius } from '../../src/styles/theme';
import { api } from '../../src/services/api';

import StreetViewWebView from '../../src/components/game/StreetViewWebView';
import GuessMap from '../../src/components/game/GuessMap';
import GameTimer from '../../src/components/game/GameTimer';

interface Location {
  lat: number;
  long: number;
  country?: string;
  panoId?: string;
}

interface RoundResult {
  guessLat: number;
  guessLong: number;
  actualLat: number;
  actualLong: number;
  panoId?: string;
  points: number;
  distance: number;
  timeTaken: number;
}

interface GameState {
  currentRound: number;
  totalRounds: number;
  locations: Location[];
  guesses: RoundResult[];
  totalScore: number;
  isShowingResult: boolean;
  timePerRound: number;
  maxDist: number;
}

const DEFAULT_GAME_OPTIONS = {
  totalRounds: 5,
  timePerRound: 60,
  location: 'all',
  maxDist: 20000,
};

export default function GameScreen() {
  const { id, map, rounds, time } = useLocalSearchParams<{
    id: string;
    map?: string;
    rounds?: string;
    time?: string;
  }>();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [allLocations, setAllLocations] = useState<Location[]>([]);
  const roundStartTimeRef = useRef<number>(Date.now());

  const [gameState, setGameState] = useState<GameState>({
    currentRound: 1,
    totalRounds: rounds ? parseInt(rounds, 10) : DEFAULT_GAME_OPTIONS.totalRounds,
    locations: [],
    guesses: [],
    totalScore: 0,
    isShowingResult: false,
    timePerRound: time ? parseInt(time, 10) : DEFAULT_GAME_OPTIONS.timePerRound,
    maxDist: DEFAULT_GAME_OPTIONS.maxDist,
  });

  const [guessPosition, setGuessPosition] = useState<{ lat: number; lng: number } | null>(null);
  // Map is HIDDEN by default on mobile, matching web behavior
  const [miniMapShown, setMiniMapShown] = useState(false);
  // Mount the map eagerly once loading completes to avoid first-touch issues
  const [mapMounted, setMapMounted] = useState(false);

  // Animation values
  const mapSlideAnim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = shown
  const mapBtnsAnim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = shown
  const bannerSlideAnim = useRef(new Animated.Value(300)).current;
  const fabScaleAnim = useRef(new Animated.Value(1)).current;

  // Mount map eagerly once game loads — prevents first-touch being swallowed
  // by a freshly-mounted MapView when showing the first round's result
  useEffect(() => {
    if (!isLoading && !mapMounted) {
      // Small delay so the initial render settles before adding the MapView
      const timer = setTimeout(() => setMapMounted(true), 300);
      return () => clearTimeout(timer);
    }
  }, [isLoading, mapMounted]);

  // Animate map slide in/out
  useEffect(() => {
    if (gameState.isShowingResult) {
      // Answer shown: map goes fullscreen
      Animated.spring(mapSlideAnim, {
        toValue: 1,
        friction: 10,
        tension: 50,
        useNativeDriver: false,
      }).start();
    } else if (miniMapShown) {
      Animated.spring(mapSlideAnim, {
        toValue: 1,
        friction: 10,
        tension: 50,
        useNativeDriver: false,
      }).start();
    } else {
      Animated.timing(mapSlideAnim, {
        toValue: 0,
        duration: 250,
        easing: Easing.ease,
        useNativeDriver: false,
      }).start();
    }
  }, [miniMapShown, gameState.isShowingResult]);

  // Map buttons (Guess + collapse) slide up with map
  useEffect(() => {
    if (miniMapShown && !gameState.isShowingResult) {
      mapBtnsAnim.setValue(0);
      Animated.spring(mapBtnsAnim, {
        toValue: 1,
        friction: 8,
        tension: 50,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(mapBtnsAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [miniMapShown, gameState.isShowingResult]);

  // Banner slide animation
  // useNativeDriver: false ensures JS-side touch targets match the banner's
  // visual position, preventing the "first tap ignored" bug on first round
  useEffect(() => {
    if (gameState.isShowingResult) {
      bannerSlideAnim.setValue(300);
      Animated.spring(bannerSlideAnim, {
        toValue: 0,
        friction: 8,
        tension: 50,
        useNativeDriver: false,
      }).start();
    } else {
      Animated.timing(bannerSlideAnim, {
        toValue: 300,
        duration: 200,
        useNativeDriver: false,
      }).start();
    }
  }, [gameState.isShowingResult]);

  // FAB entrance animation
  useEffect(() => {
    if (!isLoading && !miniMapShown && !gameState.isShowingResult) {
      fabScaleAnim.setValue(0);
      Animated.spring(fabScaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 80,
        useNativeDriver: true,
      }).start();
    }
  }, [isLoading, miniMapShown, gameState.isShowingResult]);

  // Map height interpolation: 0 = hidden (0px), 1 = 70% of screen (or 100% when answer shown)
  const mapHeight = mapSlideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, gameState.isShowingResult ? height : height * 0.7],
  });

  // Fetch locations from server on mount
  useEffect(() => {
    async function fetchLocations() {
      try {
        setIsLoading(true);
        setLoadError(null);

        let data;
        const mapSlug = map || 'all';

        if (mapSlug === 'all') {
          data = await api.fetchAllLocations();
        } else if (mapSlug.length === 2 && mapSlug === mapSlug.toUpperCase()) {
          data = await api.fetchCountryLocations(mapSlug);
        } else {
          data = await api.fetchMapLocations(mapSlug);
        }

        if (!data.ready || !data.locations || data.locations.length === 0) {
          throw new Error('No locations available for this map');
        }

        const normalizedLocations = data.locations.map((loc: any) => ({
          lat: loc.lat,
          long: loc.long || loc.lng,
          country: loc.country,
          panoId: loc.panoId,
        }));

        const shuffled = [...normalizedLocations].sort(() => Math.random() - 0.5);
        const totalRounds = gameState.totalRounds;
        const selectedLocations = shuffled.slice(0, totalRounds);

        setAllLocations(shuffled);
        setGameState((prev) => ({
          ...prev,
          locations: selectedLocations,
          maxDist: data.maxDist ?? DEFAULT_GAME_OPTIONS.maxDist,
        }));
        setIsLoading(false);
        roundStartTimeRef.current = Date.now();
      } catch (error) {
        console.error('Failed to fetch locations:', error);
        setLoadError(error instanceof Error ? error.message : 'Failed to load game');
        setIsLoading(false);
      }
    }

    fetchLocations();
  }, [map]);

  const currentLocation = gameState.locations[gameState.currentRound - 1];

  const handleMapPress = useCallback((lat: number, lng: number) => {
    if (gameState.isShowingResult) return;
    setGuessPosition({ lat, lng });
  }, [gameState.isShowingResult]);

  const handleSubmitGuess = useCallback(() => {
    if (!guessPosition || !currentLocation) return;

    const timeTaken = Math.round((Date.now() - roundStartTimeRef.current) / 1000);

    const distance = findDistance(
      currentLocation.lat,
      currentLocation.long,
      guessPosition.lat,
      guessPosition.lng
    );

    const points = calcPoints({
      lat: currentLocation.lat,
      lon: currentLocation.long,
      guessLat: guessPosition.lat,
      guessLon: guessPosition.lng,
      maxDist: gameState.maxDist,
    });

    setGameState((prev) => ({
      ...prev,
      guesses: [
        ...prev.guesses,
        {
          guessLat: guessPosition.lat,
          guessLong: guessPosition.lng,
          actualLat: currentLocation.lat,
          actualLong: currentLocation.long,
          panoId: currentLocation.panoId,
          points,
          distance,
          timeTaken,
        },
      ],
      totalScore: prev.totalScore + points,
      isShowingResult: true,
    }));
    // Hide the map toggle since we'll show fullscreen result map
    setMiniMapShown(false);
  }, [guessPosition, currentLocation, gameState.maxDist]);

  const handleTimeUp = useCallback(() => {
    if (gameState.isShowingResult) return;

    if (!guessPosition && currentLocation) {
      const timeTaken = Math.round((Date.now() - roundStartTimeRef.current) / 1000);

      setGameState((prev) => ({
        ...prev,
        guesses: [
          ...prev.guesses,
          {
            guessLat: 0,
            guessLong: 0,
            actualLat: currentLocation.lat,
            actualLong: currentLocation.long,
            points: 0,
            distance: findDistance(currentLocation.lat, currentLocation.long, 0, 0),
            timeTaken,
          },
        ],
        isShowingResult: true,
      }));
      setMiniMapShown(false);
    } else {
      handleSubmitGuess();
    }
  }, [guessPosition, currentLocation, gameState.isShowingResult, handleSubmitGuess]);

  const handleNextRound = useCallback(() => {
    if (gameState.currentRound >= gameState.totalRounds) {
      router.push({
        pathname: '/game/results',
        params: {
          totalScore: gameState.totalScore.toString(),
          rounds: JSON.stringify(gameState.guesses),
        },
      });
      return;
    }

    setGameState((prev) => ({
      ...prev,
      currentRound: prev.currentRound + 1,
      isShowingResult: false,
    }));
    setGuessPosition(null);
    setMiniMapShown(false);
    roundStartTimeRef.current = Date.now();
  }, [gameState, router]);

  const handleQuit = () => {
    router.back();
  };

  const getPointsColor = (pts: number) => {
    if (pts >= 4000) return colors.success;
    if (pts >= 2000) return colors.warning;
    return colors.error;
  };

  const formatDist = (km: number) => {
    if (km < 1) return `${Math.round(km * 1000)} m`;
    if (km < 100) return `${km.toFixed(1)} km`;
    return `${Math.round(km).toLocaleString()} km`;
  };

  // Loading state
  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading game...</Text>
      </View>
    );
  }

  // Error state
  if (loadError || !currentLocation) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Ionicons name="warning" size={48} color={colors.error} />
        <Text style={styles.errorText}>{loadError || 'Failed to load game'}</Text>
        <Pressable style={styles.retryButton} onPress={handleQuit}>
          <Text style={styles.retryButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const lastGuess = gameState.guesses[gameState.guesses.length - 1];
  const showFab = !miniMapShown && !gameState.isShowingResult;

  return (
    <View style={styles.container}>
      {/* Street View - FULLSCREEN */}
      <View style={StyleSheet.absoluteFillObject}>
        <StreetViewWebView
          lat={currentLocation.lat}
          long={currentLocation.long}
        />
      </View>

      {/* Timer pill - top right, matching web .timer styling */}
      {!gameState.isShowingResult && (
        <SafeAreaView style={styles.timerContainer} edges={['top']} pointerEvents="box-none">
          <View style={styles.timerPill}>
            <Text style={styles.timerText}>
              Round {gameState.currentRound}/{gameState.totalRounds}
            </Text>
            <Text style={styles.timerScore}>
              {gameState.totalScore.toLocaleString()} pts
            </Text>
          </View>
          <GameTimer
            timeRemaining={gameState.timePerRound}
            onTimeUp={handleTimeUp}
            isPaused={gameState.isShowingResult}
          />
        </SafeAreaView>
      )}

      {/* Close button - top left */}
      <SafeAreaView style={styles.closeButtonContainer} edges={['top']} pointerEvents="box-none">
        <Pressable
          style={({ pressed }) => [
            styles.closeButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={handleQuit}
        >
          <Ionicons name="close" size={24} color={colors.white} />
        </Pressable>
      </SafeAreaView>

      {/* ═══ MAP OVERLAY - slides up from bottom ═══ */}
      <Animated.View
        style={[
          styles.mapOverlay,
          { height: mapHeight },
        ]}
        pointerEvents={miniMapShown || gameState.isShowingResult ? 'auto' : 'none'}
      >
        {/* Inner wrapper gives MapView a fixed height so initialRegion works
            even when the animated outer container starts at 0px height */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: height }}>
          {mapMounted && (
            <GuessMap
              guessPosition={guessPosition}
              actualPosition={
                gameState.isShowingResult
                  ? { lat: currentLocation.lat, lng: currentLocation.long }
                  : undefined
              }
              onMapPress={handleMapPress}
              isExpanded={true}
            />
          )}
        </View>
      </Animated.View>

      {/* ═══ MOBILE GUESS BUTTONS - above map when map is open ═══ */}
      {/* Matches web: .mobile_minimap__btns.miniMapShown */}
      {miniMapShown && !gameState.isShowingResult && (
        <Animated.View
          style={[
            styles.mapButtonsRow,
            { bottom: height * 0.7 + 8 },
            {
              opacity: mapBtnsAnim,
              transform: [{
                translateY: mapBtnsAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [40, 0],
                }),
              }],
            },
          ]}
        >
          {/* Guess submit button (blue) */}
          <Pressable
            onPress={handleSubmitGuess}
            disabled={!guessPosition}
            style={({ pressed }) => [
              styles.guessSubmitBtn,
              !guessPosition && styles.guessSubmitBtnDisabled,
              pressed && guessPosition && { opacity: 0.85 },
            ]}
          >
            <LinearGradient
              colors={guessPosition ? ['#1d1d5b', '#1e3e9c'] : ['#555', '#444']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.guessSubmitBtnGradient}
            >
              <Text style={[
                styles.guessSubmitBtnText,
                !guessPosition && { opacity: 0.5 },
              ]}>
                Guess
              </Text>
            </LinearGradient>
          </Pressable>

          {/* Map collapse toggle (small down arrow) - matches web mobileMiniMapExpandedToggle */}
          <Pressable
            onPress={() => setMiniMapShown(false)}
            style={({ pressed }) => [
              styles.mapCollapseBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.mapCollapseBtnInner}
            >
              <Ionicons name="arrow-down" size={24} color={colors.white} />
            </LinearGradient>
          </Pressable>
        </Animated.View>
      )}

      {/* ═══ FLOATING GUESS FAB - bottom right when map hidden ═══ */}
      {/* Matches web: .g2_mobile_guess button with map icon + "Guess" text */}
      {showFab && (
        <Animated.View
          style={[
            styles.guessFab,
            {
              transform: [{ scale: fabScaleAnim }],
              bottom: Math.max(insets.bottom, 20) + 20,
            },
          ]}
        >
          <Pressable
            onPress={() => setMiniMapShown(true)}
            style={({ pressed }) => [pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] }]}
          >
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.guessFabInner}
            >
              <Ionicons name="map" size={28} color={colors.white} />
              <Text style={styles.guessFabText}>Guess</Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      )}

      {/* ═══ END BANNER - shown after guessing ═══ */}
      {/* Matches web: #endBanner with glassmorphism, distance, points, next button */}
      {gameState.isShowingResult && lastGuess && (
        <Animated.View
          style={[
            styles.endBanner,
            {
              transform: [{ translateY: bannerSlideAnim }],
              paddingBottom: Math.max(insets.bottom, spacing.lg),
            },
          ]}
        >
          <View style={styles.endBannerContent}>
            {/* Round & score context */}
            <Text style={styles.endBannerRound}>
              Round {gameState.currentRound}/{gameState.totalRounds}
            </Text>

            {/* Distance text */}
            <Text style={styles.endBannerDistance}>
              {lastGuess.distance >= 1
                ? `Your guess was ${formatDist(lastGuess.distance)} away`
                : `Your guess was ${Math.round(lastGuess.distance * 1000)} m away`
              }
            </Text>

            {/* Points */}
            <Text style={[styles.endBannerPoints, { color: getPointsColor(lastGuess.points) }]}>
              {lastGuess.points.toLocaleString()} points
            </Text>

            {/* Running total */}
            <Text style={styles.endBannerTotal}>
              Total: {gameState.totalScore.toLocaleString()} / {gameState.totalRounds * 5000}
            </Text>

            {/* Next Round / View Results button */}
            <Pressable
              onPress={handleNextRound}
              style={({ pressed }) => [pressed && { opacity: 0.85 }]}
            >
              <LinearGradient
                colors={[colors.primary, colors.primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.nextRoundBtn}
              >
                <Text style={styles.nextRoundBtnText}>
                  {gameState.currentRound >= gameState.totalRounds
                    ? 'View Results'
                    : 'Next Round'
                  }
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing['2xl'],
  },
  loadingText: {
    marginTop: spacing.lg,
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  errorText: {
    marginTop: spacing.lg,
    fontSize: fontSizes.md,
    color: colors.error,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['2xl'],
    borderRadius: borderRadius.lg,
  },
  retryButtonText: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: colors.white,
  },

  // ── Timer (top right) - matches web .timer.shown ─────────
  timerContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 102,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingRight: spacing.lg,
    paddingTop: spacing.sm,
  },
  timerPill: {
    backgroundColor: Platform.OS === 'android' ? '#1a4423' : colors.primaryTransparent,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  timerText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: fontSizes.sm,
    letterSpacing: 0.3,
  },
  timerScore: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: fontSizes.xs,
  },

  // ── Close button (top left) ──────────────────────────────
  closeButtonContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 102,
    paddingLeft: spacing.lg,
    paddingTop: spacing.sm,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Map overlay - slides up from bottom ──────────────────
  mapOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: 'hidden',
  },

  // ── Guess/collapse buttons above map ─────────────────────
  // Matches web: .mobile_minimap__btns.miniMapShown
  mapButtonsRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.md,
    zIndex: 1500,
  },
  guessSubmitBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    overflow: 'hidden',
  },
  guessSubmitBtnDisabled: {},
  guessSubmitBtnGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
    // Match web: .guessBtn box-shadow
    ...Platform.select({
      ios: {
        shadowColor: '#1d1d5b',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 15,
      },
      android: { elevation: 8 },
    }),
  },
  guessSubmitBtnText: {
    color: colors.white,
    fontSize: fontSizes.lg,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  mapCollapseBtn: {
    width: 60,
    height: 48,
    borderRadius: 14,
    overflow: 'hidden',
  },
  mapCollapseBtnInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.primaryDark,
  },

  // ── Floating Guess FAB - bottom right ────────────────────
  // Matches web: .g2_mobile_guess
  guessFab: {
    position: 'absolute',
    right: 20,
    zIndex: 1500,
  },
  guessFabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.primaryDark,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 15,
      },
      android: { elevation: 8 },
    }),
  },
  guessFabText: {
    color: colors.white,
    fontSize: fontSizes.xl,
    fontWeight: '600',
  },

  // ── End Banner - matches web #endBanner ──────────────────
  endBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1001,
  },
  endBannerContent: {
    backgroundColor: 'rgba(17, 43, 24, 0.92)',
    borderRadius: 12,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
  },
  endBannerRound: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: fontSizes.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  endBannerDistance: {
    color: colors.white,
    fontSize: fontSizes.lg,
    fontWeight: '600',
    textAlign: 'center',
  },
  endBannerPoints: {
    fontSize: fontSizes['2xl'],
    fontWeight: 'bold',
    textAlign: 'center',
  },
  endBannerTotal: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: fontSizes.sm,
    fontWeight: '500',
    textAlign: 'center',
  },
  nextRoundBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['3xl'],
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    minWidth: 200,
  },
  nextRoundBtnText: {
    color: colors.white,
    fontSize: fontSizes.lg,
    fontWeight: '600',
  },
});
