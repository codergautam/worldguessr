import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, calcPoints, findDistance } from '../../src/shared';
import { commonStyles, spacing, fontSizes, borderRadius } from '../../src/styles/theme';
import { api } from '../../src/services/api';

import StreetViewWebView from '../../src/components/game/StreetViewWebView';
import GuessMap from '../../src/components/game/GuessMap';
import GameTimer from '../../src/components/game/GameTimer';

interface Location {
  lat: number;
  long: number;
  country?: string;
}

interface RoundResult {
  guessLat: number;
  guessLong: number;
  actualLat: number;
  actualLong: number;
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

// Default game settings
const DEFAULT_GAME_OPTIONS = {
  totalRounds: 5,
  timePerRound: 60, // 60 seconds per round
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
  const isLandscape = width > height;

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
  const [mapExpanded, setMapExpanded] = useState(false);

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
          // Country code (e.g., "US", "FR")
          data = await api.fetchCountryLocations(mapSlug);
        } else {
          // Community map slug
          data = await api.fetchMapLocations(mapSlug);
        }

        if (!data.ready || !data.locations || data.locations.length === 0) {
          throw new Error('No locations available for this map');
        }

        // Normalize locations (some use lng instead of long)
        const normalizedLocations = data.locations.map((loc: any) => ({
          lat: loc.lat,
          long: loc.long || loc.lng,
          country: loc.country,
        }));

        // Shuffle locations
        const shuffled = [...normalizedLocations].sort(() => Math.random() - 0.5);

        // Take only as many as we need for the game
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
          points,
          distance,
          timeTaken,
        },
      ],
      totalScore: prev.totalScore + points,
      isShowingResult: true,
    }));
  }, [guessPosition, currentLocation, gameState.maxDist]);

  const handleTimeUp = useCallback(() => {
    if (gameState.isShowingResult) return;

    // If no guess placed, use a default position (0, 0) which will score 0 points
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
    } else {
      handleSubmitGuess();
    }
  }, [guessPosition, currentLocation, gameState.isShowingResult, handleSubmitGuess]);

  const handleNextRound = useCallback(() => {
    if (gameState.currentRound >= gameState.totalRounds) {
      // Game over - go to results
      router.push({
        pathname: '/game/results',
        params: {
          totalScore: gameState.totalScore.toString(),
          rounds: JSON.stringify(gameState.guesses),
        },
      });
      return;
    }

    // Reset for next round
    setGameState((prev) => ({
      ...prev,
      currentRound: prev.currentRound + 1,
      isShowingResult: false,
    }));
    setGuessPosition(null);
    roundStartTimeRef.current = Date.now();
  }, [gameState, router]);

  const handleQuit = () => {
    router.back();
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

  return (
    <View style={styles.container}>
      {/* Street View */}
      <View style={[styles.streetViewContainer, isLandscape && styles.streetViewLandscape]}>
        <StreetViewWebView
          lat={currentLocation.lat}
          long={currentLocation.long}
        />

        {/* Top Bar */}
        <SafeAreaView style={styles.topBar} edges={['top']}>
          <View style={styles.topBarContent}>
            <Pressable style={styles.quitButton} onPress={handleQuit}>
              <Ionicons name="close" size={24} color={colors.white} />
            </Pressable>

            <View style={styles.roundInfo}>
              <Text style={styles.roundText}>
                Round {gameState.currentRound}/{gameState.totalRounds}
              </Text>
              <Text style={styles.scoreText}>
                {gameState.totalScore.toLocaleString()} pts
              </Text>
            </View>

            <GameTimer
              timeRemaining={gameState.timePerRound}
              onTimeUp={handleTimeUp}
              isPaused={gameState.isShowingResult}
            />
          </View>
        </SafeAreaView>
      </View>

      {/* Result Overlay */}
      {gameState.isShowingResult && lastGuess && (
        <View style={styles.resultOverlay}>
          <View style={styles.resultCard}>
            <Text style={[
              styles.resultPoints,
              { color: lastGuess.points >= 4000 ? colors.success : lastGuess.points >= 2000 ? colors.warning : colors.error }
            ]}>
              +{lastGuess.points.toLocaleString()} points
            </Text>
            <Text style={styles.resultDistance}>
              {lastGuess.distance < 1
                ? `${Math.round(lastGuess.distance * 1000)} m`
                : `${lastGuess.distance.toFixed(1)} km`
              } away
            </Text>
            <Pressable style={styles.nextButton} onPress={handleNextRound}>
              <Text style={styles.nextButtonText}>
                {gameState.currentRound >= gameState.totalRounds
                  ? 'See Results'
                  : 'Next Round'
                }
              </Text>
              <Ionicons name="arrow-forward" size={20} color={colors.white} />
            </Pressable>
          </View>
        </View>
      )}

      {/* Map */}
      <View style={[
        styles.mapContainer,
        mapExpanded && styles.mapContainerExpanded,
        isLandscape && styles.mapContainerLandscape,
      ]}>
        <Pressable
          style={styles.mapExpandButton}
          onPress={() => setMapExpanded(!mapExpanded)}
        >
          <Ionicons
            name={mapExpanded ? 'chevron-down' : 'chevron-up'}
            size={20}
            color={colors.white}
          />
        </Pressable>

        <GuessMap
          guessPosition={guessPosition}
          actualPosition={
            gameState.isShowingResult
              ? { lat: currentLocation.lat, lng: currentLocation.long }
              : undefined
          }
          onMapPress={handleMapPress}
          isExpanded={mapExpanded}
        />

        {!gameState.isShowingResult && (
          <View style={[styles.mapActions, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <Pressable
              style={[
                styles.guessButton,
                !guessPosition && styles.guessButtonDisabled,
              ]}
              onPress={handleSubmitGuess}
              disabled={!guessPosition}
            >
              <Text style={styles.guessButtonText}>
                {guessPosition ? 'Submit Guess' : 'Place your guess'}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
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
  streetViewContainer: {
    flex: 1,
    position: 'relative',
  },
  streetViewLandscape: {
    flex: 0.6,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  topBarContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  quitButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  roundInfo: {
    alignItems: 'center',
  },
  roundText: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: colors.white,
  },
  scoreText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  resultOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  resultCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing['2xl'],
    alignItems: 'center',
    minWidth: 280,
  },
  resultPoints: {
    fontSize: fontSizes['3xl'],
    fontWeight: 'bold',
    marginBottom: spacing.sm,
  },
  resultDistance: {
    fontSize: fontSizes.lg,
    color: colors.textSecondary,
    marginBottom: spacing['2xl'],
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['2xl'],
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  nextButtonText: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: colors.white,
  },
  mapContainer: {
    height: 200,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    overflow: 'hidden',
    backgroundColor: colors.primaryDark,
  },
  mapContainerExpanded: {
    height: '50%',
  },
  mapContainerLandscape: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: '40%',
    height: '100%',
    borderRadius: 0,
  },
  mapExpandButton: {
    position: 'absolute',
    top: spacing.sm,
    left: '50%',
    marginLeft: -20,
    width: 40,
    height: 24,
    borderRadius: borderRadius.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  mapActions: {
    position: 'absolute',
    bottom: 0,
    left: spacing.lg,
    right: spacing.lg,
  },
  guessButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  guessButtonDisabled: {
    backgroundColor: colors.textMuted,
  },
  guessButtonText: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: colors.white,
  },
});
