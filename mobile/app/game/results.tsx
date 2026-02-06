import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { colors } from '../../src/shared';
import { commonStyles, spacing, fontSizes, borderRadius } from '../../src/styles/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PANEL_HEIGHT = SCREEN_HEIGHT * 0.42;

interface RoundResult {
  guessLat: number;
  guessLong: number;
  actualLat?: number;
  actualLong?: number;
  points: number;
  distance: number;
  timeTaken?: number;
}

// Star tier colors
const STAR_BRONZE = '#CD7F32';
const STAR_SILVER = '#b6b2b2';
const STAR_GOLD = '#FFD700';
const STAR_PLATINUM = '#b9f2ff';

type StarColor = typeof STAR_BRONZE | typeof STAR_SILVER | typeof STAR_GOLD | typeof STAR_PLATINUM;

function getStars(percentage: number): StarColor[] {
  if (percentage <= 20) return [STAR_BRONZE];
  if (percentage <= 30) return [STAR_BRONZE, STAR_BRONZE];
  if (percentage <= 45) return [STAR_BRONZE, STAR_BRONZE, STAR_BRONZE];
  if (percentage <= 50) return [STAR_SILVER, STAR_SILVER, STAR_BRONZE];
  if (percentage <= 60) return [STAR_SILVER, STAR_SILVER, STAR_SILVER];
  if (percentage <= 62) return [STAR_GOLD, STAR_SILVER, STAR_SILVER];
  if (percentage <= 65) return [STAR_GOLD, STAR_GOLD, STAR_SILVER];
  if (percentage <= 79) return [STAR_GOLD, STAR_GOLD, STAR_GOLD];
  if (percentage <= 82) return [STAR_PLATINUM, STAR_GOLD, STAR_GOLD];
  if (percentage <= 85) return [STAR_PLATINUM, STAR_PLATINUM, STAR_GOLD];
  return [STAR_PLATINUM, STAR_PLATINUM, STAR_PLATINUM];
}

function getPolylineColor(points: number): string {
  if (points >= 3000) return '#4CAF50';
  if (points >= 1500) return '#FFC107';
  return '#F44336';
}

function getPointsColor(points: number): string {
  if (points >= 4000) return colors.success;
  if (points >= 2000) return colors.warning;
  return colors.error;
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export default function GameResultsScreen() {
  const { totalScore, rounds } = useLocalSearchParams<{
    totalScore: string;
    rounds: string;
  }>();
  const router = useRouter();
  const mapRef = useRef<MapView>(null);

  const parsedRounds: RoundResult[] = useMemo(
    () => (rounds ? JSON.parse(rounds) : []),
    [rounds],
  );
  const score = parseInt(totalScore ?? '0', 10);
  const maxScore = parsedRounds.length * 5000;
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const stars = useMemo(() => getStars(percentage), [percentage]);

  const [activeRound, setActiveRound] = useState<number | null>(null);

  // Animated score counter
  const animatedValue = useRef(new Animated.Value(0)).current;
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    animatedValue.setValue(0);
    const listener = animatedValue.addListener(({ value }) => {
      setDisplayScore(Math.round(value));
    });

    Animated.timing(animatedValue, {
      toValue: score,
      duration: 1200,
      easing: (t) => 1 - Math.pow(1 - t, 3), // ease-out cubic
      useNativeDriver: false,
    }).start();

    return () => {
      animatedValue.removeListener(listener);
    };
  }, [score]);

  // Star entrance animations
  const starAnims = useRef(stars.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const animations = starAnims.map((anim, i) => {
      anim.setValue(0);
      return Animated.spring(anim, {
        toValue: 1,
        delay: i * 200,
        friction: 4,
        tension: 80,
        useNativeDriver: true,
      });
    });
    Animated.stagger(200, animations).start();
  }, []);

  // Fit map to show all rounds on mount
  const fitMapToAllRounds = useCallback(() => {
    if (!mapRef.current || parsedRounds.length === 0) return;

    const coords: { latitude: number; longitude: number }[] = [];
    parsedRounds.forEach((r) => {
      if (r.actualLat != null && r.actualLong != null) {
        coords.push({ latitude: r.actualLat, longitude: r.actualLong });
      }
      if (r.guessLat != null && r.guessLong != null) {
        coords.push({ latitude: r.guessLat, longitude: r.guessLong });
      }
    });

    if (coords.length > 0) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 60, right: 40, bottom: PANEL_HEIGHT + 20, left: 40 },
        animated: true,
      });
    }
  }, [parsedRounds]);

  useEffect(() => {
    const timeout = setTimeout(fitMapToAllRounds, 500);
    return () => clearTimeout(timeout);
  }, [fitMapToAllRounds]);

  // Focus on a specific round
  const focusOnRound = useCallback(
    (index: number) => {
      const round = parsedRounds[index];
      if (!mapRef.current || !round) return;

      const coords: { latitude: number; longitude: number }[] = [];
      if (round.actualLat != null && round.actualLong != null) {
        coords.push({ latitude: round.actualLat, longitude: round.actualLong });
      }
      if (round.guessLat != null && round.guessLong != null) {
        coords.push({ latitude: round.guessLat, longitude: round.guessLong });
      }

      if (coords.length > 0) {
        mapRef.current.fitToCoordinates(coords, {
          edgePadding: { top: 80, right: 60, bottom: PANEL_HEIGHT + 40, left: 60 },
          animated: true,
        });
      }
    },
    [parsedRounds],
  );

  const handleRoundPress = useCallback(
    (index: number) => {
      if (activeRound === index) {
        // Deselect and show all
        setActiveRound(null);
        setTimeout(fitMapToAllRounds, 100);
      } else {
        setActiveRound(index);
        focusOnRound(index);
      }
    },
    [activeRound, fitMapToAllRounds, focusOnRound],
  );

  const handlePlayAgain = () => {
    router.replace({
      pathname: '/game/[id]',
      params: {
        id: 'singleplayer',
        map: 'all',
        rounds: '5',
        time: '60',
      },
    });
  };

  const handleGoHome = () => {
    router.replace('/(tabs)/home');
  };

  return (
    <View style={styles.root}>
      {/* Full-screen map */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={{
          latitude: 20,
          longitude: 0,
          latitudeDelta: 120,
          longitudeDelta: 120,
        }}
        mapType="standard"
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {parsedRounds.map((round, index) => {
          const hasActual = round.actualLat != null && round.actualLong != null;
          const hasGuess = round.guessLat != null && round.guessLong != null;

          // When a round is active, only show that round's markers
          if (activeRound !== null && activeRound !== index) return null;

          return (
            <React.Fragment key={index}>
              {/* Actual location - green pin */}
              {hasActual && (
                <Marker
                  coordinate={{
                    latitude: round.actualLat!,
                    longitude: round.actualLong!,
                  }}
                  pinColor="#4CAF50"
                  title={`Round ${index + 1} - Actual`}
                  anchor={{ x: 0.5, y: 1 }}
                />
              )}

              {/* Guess location - red/blue pin */}
              {hasGuess && (
                <Marker
                  coordinate={{
                    latitude: round.guessLat,
                    longitude: round.guessLong,
                  }}
                  pinColor="#F44336"
                  title={`Round ${index + 1} - Guess`}
                  description={`${round.points.toLocaleString()} pts`}
                  anchor={{ x: 0.5, y: 1 }}
                />
              )}

              {/* Polyline connecting guess to actual */}
              {hasActual && hasGuess && (
                <Polyline
                  coordinates={[
                    { latitude: round.actualLat!, longitude: round.actualLong! },
                    { latitude: round.guessLat, longitude: round.guessLong },
                  ]}
                  strokeColor={getPolylineColor(round.points)}
                  strokeWidth={3}
                  lineDashPattern={[10, 5]}
                />
              )}
            </React.Fragment>
          );
        })}
      </MapView>

      {/* Bottom panel overlay */}
      <SafeAreaView style={styles.panelContainer} edges={['bottom']}>
        <View style={styles.panel}>
          {/* Drag handle indicator */}
          <View style={styles.handleBar} />

          {/* Score header section */}
          <View style={styles.scoreSection}>
            {/* Star ratings */}
            <View style={styles.starsRow}>
              {stars.map((starColor, i) => (
                <Animated.View
                  key={i}
                  style={[
                    styles.starWrapper,
                    {
                      transform: [
                        {
                          scale: starAnims[i]
                            ? starAnims[i].interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, 1],
                              })
                            : 1,
                        },
                      ],
                      opacity: starAnims[i] || 1,
                    },
                  ]}
                >
                  <Ionicons name="star" size={32} color={starColor} />
                </Animated.View>
              ))}
            </View>

            {/* Animated score */}
            <Text style={styles.scoreValue}>
              {displayScore.toLocaleString()}
            </Text>
            <Text style={styles.scoreSubtitle}>
              out of {maxScore.toLocaleString()} points
            </Text>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Round breakdown - scrollable */}
          <ScrollView
            style={styles.roundsScroll}
            contentContainerStyle={styles.roundsContent}
            showsVerticalScrollIndicator={false}
          >
            {parsedRounds.map((round, index) => {
              const isActive = activeRound === index;
              return (
                <Pressable
                  key={index}
                  style={({ pressed }) => [
                    styles.roundCard,
                    isActive && styles.roundCardActive,
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={() => handleRoundPress(index)}
                >
                  <View style={styles.roundCardHeader}>
                    <View style={styles.roundCardLeft}>
                      <View
                        style={[
                          styles.roundIndicator,
                          { backgroundColor: getPolylineColor(round.points) },
                        ]}
                      />
                      <Text style={styles.roundLabel}>Round {index + 1}</Text>
                    </View>
                    <View style={styles.roundCardRight}>
                      <Text
                        style={[
                          styles.roundPoints,
                          { color: getPointsColor(round.points) },
                        ]}
                      >
                        {round.points.toLocaleString()} pts
                      </Text>
                      <Text style={styles.roundDistance}>
                        {formatDistance(round.distance)}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}

            {/* Action buttons */}
            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                ]}
                onPress={handlePlayAgain}
              >
                <Ionicons name="refresh" size={20} color={colors.white} />
                <Text style={styles.primaryButtonText}>Play Again</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                ]}
                onPress={handleGoHome}
              >
                <Ionicons name="home-outline" size={20} color={colors.text} />
                <Text style={styles.secondaryButtonText}>Home</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Bottom panel
  panelContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: PANEL_HEIGHT,
  },
  panel: {
    backgroundColor: 'rgba(17, 43, 24, 0.95)',
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: PANEL_HEIGHT,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 20,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },

  // Score section
  scoreSection: {
    alignItems: 'center',
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  starWrapper: {
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  scoreValue: {
    fontSize: 42,
    fontWeight: 'bold',
    color: colors.text,
    letterSpacing: -1,
  },
  scoreSubtitle: {
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    marginTop: 2,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: colors.cardBorder,
    marginHorizontal: spacing.lg,
  },

  // Rounds list
  roundsScroll: {
    flex: 1,
  },
  roundsContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  roundCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  roundCardActive: {
    borderColor: colors.success,
    backgroundColor: 'rgba(36, 87, 52, 0.9)',
  },
  roundCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roundCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  roundIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  roundLabel: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: colors.text,
  },
  roundCardRight: {
    alignItems: 'flex-end',
  },
  roundPoints: {
    fontSize: fontSizes.md,
    fontWeight: '700',
  },
  roundDistance: {
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginTop: 2,
  },

  // Action buttons
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  primaryButtonText: {
    fontSize: fontSizes.md,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  secondaryButtonText: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: colors.text,
  },
});
