import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Animated,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Asset } from 'expo-asset';
import { colors } from '../../src/shared';

const guessPinModule = require('../../assets/marker-src.png');
const actualPinModule = require('../../assets/marker-dest.png');
import { spacing, fontSizes, borderRadius } from '../../src/styles/theme';

interface RoundResult {
  guessLat: number;
  guessLong: number;
  actualLat?: number;
  actualLong?: number;
  points: number;
  distance: number;
  timeTaken?: number;
}

// Star tier colors matching web exactly
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
  if (points >= 4000) return '#4CAF50';
  if (points >= 2000) return '#FFC107';
  return '#F44336';
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

// Sidebar width in landscape (matches web's 400px sidebar proportionally)
const SIDEBAR_WIDTH = 340;

export default function GameResultsScreen() {
  const { totalScore, rounds } = useLocalSearchParams<{
    totalScore: string;
    rounds: string;
  }>();
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isLandscape = width > height;

  // Download marker assets to local filesystem so native Google Maps can load them
  const [pinUris, setPinUris] = useState<{ guess?: string; actual?: string }>({});
  useEffect(() => {
    (async () => {
      const [g, a] = await Asset.loadAsync([guessPinModule, actualPinModule]);
      setPinUris({ guess: g.localUri ?? g.uri, actual: a.localUri ?? a.uri });
    })();
  }, []);

  const parsedRounds: RoundResult[] = useMemo(
    () => (rounds ? JSON.parse(rounds) : []),
    [rounds],
  );
  const score = parseInt(totalScore ?? '0', 10);
  const maxScore = parsedRounds.length * 5000;
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const stars = useMemo(() => getStars(percentage), [percentage]);

  const [activeRound, setActiveRound] = useState<number | null>(null);
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  // Animated panel height for smooth expand/collapse
  const panelAnim = useRef(new Animated.Value(0)).current; // 0 = collapsed, 1 = expanded

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
      easing: (t: number) => 1 - Math.pow(1 - t, 3),
      useNativeDriver: false,
    }).start();

    return () => {
      animatedValue.removeListener(listener);
    };
  }, [score]);

  // Star entrance animations
  const starAnims = useRef(stars.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    starAnims.forEach((anim, i) => {
      anim.setValue(0);
    });
    Animated.stagger(
      300,
      starAnims.map((anim) =>
        Animated.spring(anim, {
          toValue: 1,
          friction: 4,
          tension: 80,
          useNativeDriver: true,
        }),
      ),
    ).start();
  }, []);

  // Round item slide-in animations
  const roundAnims = useRef(parsedRounds.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    roundAnims.forEach((anim) => anim.setValue(0));
    Animated.stagger(
      100,
      roundAnims.map((anim) =>
        Animated.timing(anim, {
          toValue: 1,
          duration: 400,
          easing: (t: number) => 1 - Math.pow(1 - t, 3),
          useNativeDriver: true,
        }),
      ),
    ).start();
  }, []);

  // Map edge padding based on layout
  const getMapPadding = useCallback(() => {
    if (isLandscape) {
      return { top: 40, right: SIDEBAR_WIDTH + 20, bottom: 40, left: 40 };
    }
    const panelH = detailsExpanded ? height * 0.55 : height * 0.32;
    return { top: 40 + insets.top, right: 30, bottom: panelH + 20, left: 30 };
  }, [isLandscape, detailsExpanded, height, insets.top]);

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
        edgePadding: getMapPadding(),
        animated: true,
      });
    }
  }, [parsedRounds, getMapPadding]);

  useEffect(() => {
    const timeout = setTimeout(fitMapToAllRounds, 500);
    return () => clearTimeout(timeout);
  }, [fitMapToAllRounds]);

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
          edgePadding: getMapPadding(),
          animated: true,
        });
      }
    },
    [parsedRounds, getMapPadding],
  );

  const handleRoundPress = useCallback(
    (index: number) => {
      if (activeRound === index) {
        setActiveRound(null);
        setTimeout(fitMapToAllRounds, 100);
      } else {
        setActiveRound(index);
        focusOnRound(index);
      }
    },
    [activeRound, fitMapToAllRounds, focusOnRound],
  );

  const toggleDetails = useCallback(() => {
    const expanding = !detailsExpanded;
    setDetailsExpanded(expanding);
    Animated.spring(panelAnim, {
      toValue: expanding ? 1 : 0,
      friction: 12,
      tension: 65,
      useNativeDriver: false,
    }).start();
  }, [detailsExpanded, panelAnim]);

  const handlePlayAgain = () => {
    router.replace({
      pathname: '/game/[id]',
      params: { id: 'singleplayer', map: 'all', rounds: '5', time: '60' },
    });
  };

  const handleGoHome = () => {
    router.replace('/(tabs)/home');
  };

  // ── Map markers ────────────────────────────────────────────
  const renderMapMarkers = () =>
    parsedRounds.map((round, index) => {
      const hasActual = round.actualLat != null && round.actualLong != null;
      const hasGuess = round.guessLat != null && round.guessLong != null;

      if (activeRound !== null && activeRound !== index) return null;

      return (
        <React.Fragment key={index}>
          {hasActual && pinUris.actual && (
            <Marker
              coordinate={{ latitude: round.actualLat!, longitude: round.actualLong! }}
              image={{ uri: pinUris.actual }}
              anchor={{ x: 0.5, y: 1 }}
            />
          )}
          {hasGuess && pinUris.guess && (
            <Marker
              coordinate={{ latitude: round.guessLat, longitude: round.guessLong }}
              image={{ uri: pinUris.guess }}
              anchor={{ x: 0.5, y: 1 }}
            />
          )}
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
    });

  // ── Sidebar header (stars + score + buttons) ───────────────
  const renderHeader = (compact: boolean) => (
    <View style={[styles.header, compact && styles.headerCompact]}>
      {/* Stars */}
      <View style={[styles.starsRow, compact && { marginBottom: 4 }]}>
        {stars.map((starColor, i) => (
          <Animated.View
            key={i}
            style={{
              transform: [
                {
                  scale: starAnims[i]
                    ? starAnims[i].interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 1],
                      })
                    : 1,
                },
                {
                  rotate: starAnims[i]
                    ? starAnims[i].interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: ['-180deg', '-90deg', '0deg'],
                      })
                    : '0deg',
                },
              ],
              opacity: starAnims[i] || 1,
            }}
          >
            <Ionicons
              name="star"
              size={compact ? 26 : 34}
              color={starColor}
              style={{
                textShadowColor: starColor,
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 8,
              }}
            />
          </Animated.View>
        ))}
      </View>

      {/* Score */}
      <Text style={[styles.scoreValue, compact && { fontSize: 30 }]}>
        {displayScore.toLocaleString()}
      </Text>
      <Text style={[styles.scoreSubtitle, compact && { fontSize: 11, marginBottom: 4 }]}>
        out of {maxScore.toLocaleString()} points
      </Text>

      {/* Action buttons */}
      <View style={styles.headerButtons}>
        {!isLandscape && (
          <Pressable
            onPress={toggleDetails}
            style={({ pressed }) => [
              styles.detailsToggleBtn,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={styles.detailsToggleBtnText}>
              {detailsExpanded ? 'Hide Details' : 'View Details'}
            </Text>
            <Ionicons
              name={detailsExpanded ? 'chevron-down' : 'chevron-up'}
              size={16}
              color={colors.white}
            />
          </Pressable>
        )}
        <Pressable
          onPress={handlePlayAgain}
          style={({ pressed }) => [pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
        >
          <LinearGradient
            colors={['#4CAF50', '#45a049']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.actionBtnPrimary}
          >
            <Ionicons name="refresh" size={16} color={colors.white} />
            <Text style={styles.actionBtnPrimaryText}>Play Again</Text>
          </LinearGradient>
        </Pressable>
        <Pressable
          onPress={handleGoHome}
          style={({ pressed }) => [
            styles.actionBtnSecondary,
            pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
          ]}
        >
          <Text style={styles.actionBtnSecondaryText}>Home</Text>
        </Pressable>
      </View>
    </View>
  );

  // ── Rounds list ────────────────────────────────────────────
  const renderRoundsList = () => (
    <>
      <View style={styles.roundsHeader}>
        <Text style={styles.roundsHeaderText}>Round Details</Text>
      </View>
      {parsedRounds.map((round, index) => {
        const isActive = activeRound === index;
        return (
          <Animated.View
            key={index}
            style={{
              opacity: roundAnims[index] || 1,
              transform: [
                {
                  translateX: roundAnims[index]
                    ? roundAnims[index].interpolate({
                        inputRange: [0, 1],
                        outputRange: [30, 0],
                      })
                    : 0,
                },
              ],
            }}
          >
            <Pressable
              style={({ pressed }) => [
                styles.roundItem,
                isActive && styles.roundItemActive,
                pressed && { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
              ]}
              onPress={() => handleRoundPress(index)}
            >
              {/* Round header row */}
              <View style={styles.roundItemHeader}>
                <Text style={styles.roundNumber}>Round {index + 1}</Text>
                <Text style={[styles.roundPts, { color: getPointsColor(round.points) }]}>
                  {round.points.toLocaleString()} pts
                </Text>
              </View>

              {/* Detail rows */}
              <View style={styles.roundDetails}>
                {round.distance != null && round.distance > 0 && (
                  <View style={styles.detailRow}>
                    <View style={styles.detailLabel}>
                      <Text style={styles.detailIcon}>📏</Text>
                      <Text style={styles.detailText}>Distance</Text>
                    </View>
                    <Text style={styles.detailValue}>{formatDistance(round.distance)}</Text>
                  </View>
                )}
                {round.timeTaken != null && round.timeTaken > 0 && (
                  <View style={styles.detailRow}>
                    <View style={styles.detailLabel}>
                      <Text style={styles.detailIcon}>⏱️</Text>
                      <Text style={styles.detailText}>Time</Text>
                    </View>
                    <Text style={styles.detailValue}>{formatTime(round.timeTaken)}</Text>
                  </View>
                )}
              </View>
            </Pressable>
          </Animated.View>
        );
      })}
    </>
  );

  // ═══════════════════════════════════════════════════════════
  // LANDSCAPE LAYOUT — map left, sidebar right (like web desktop)
  // ═══════════════════════════════════════════════════════════
  if (isLandscape) {
    return (
      <View style={styles.root}>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {/* Map area */}
          <View style={{ flex: 1 }}>
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
              moveOnMarkerPress={false}
            >
              {renderMapMarkers()}
            </MapView>
          </View>

          {/* Sidebar — matches web .game-summary-sidebar */}
          <SafeAreaView
            edges={['top', 'bottom', 'right']}
            style={[styles.sidebar, { width: SIDEBAR_WIDTH }]}
          >
            <LinearGradient
              colors={['rgba(20, 65, 25, 0.97)', 'rgba(20, 65, 25, 0.88)']}
              style={styles.sidebarGradient}
            >
              {renderHeader(false)}

              <View style={styles.sidebarDivider} />

              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: spacing.lg }}
                showsVerticalScrollIndicator={false}
              >
                {renderRoundsList()}
              </ScrollView>
            </LinearGradient>
          </SafeAreaView>
        </View>
      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // PORTRAIT LAYOUT — map top, bottom sheet panel (like web mobile)
  // ═══════════════════════════════════════════════════════════
  const collapsedHeight = height * 0.35;
  const expandedHeight = height * 0.68;

  const animatedPanelHeight = panelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [collapsedHeight, expandedHeight],
  });

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
        {renderMapMarkers()}
      </MapView>

      {/* Bottom panel — matches web .game-summary-sidebar on mobile */}
      <Animated.View
        style={[
          styles.portraitPanel,
          {
            height: animatedPanelHeight,
            paddingBottom: Math.max(insets.bottom, 8),
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(20, 65, 25, 0.97)', 'rgba(20, 65, 25, 0.90)']}
          style={styles.portraitPanelGradient}
        >
          {/* Drag handle */}
          <View style={styles.handleBar} />

          {renderHeader(detailsExpanded)}

          {/* Rounds section — always rendered, animated via panel height */}
          {detailsExpanded && (
            <>
              <View style={styles.sidebarDivider} />
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: spacing.lg }}
                showsVerticalScrollIndicator={true}
                bounces={true}
                nestedScrollEnabled={true}
              >
                {renderRoundsList()}
              </ScrollView>
            </>
          )}
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ── Sidebar (landscape) ────────────────────────────────────
  sidebar: {
    borderLeftWidth: 2,
    borderLeftColor: colors.primary,
  },
  sidebarGradient: {
    flex: 1,
  },
  sidebarDivider: {
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },

  // ── Portrait bottom panel ──────────────────────────────────
  portraitPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
      },
      android: { elevation: 24 },
    }),
  },
  portraitPanelGradient: {
    flex: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },

  // ── Header section (stars, score, buttons) ─────────────────
  header: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerCompact: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: spacing.sm,
  },
  scoreValue: {
    fontSize: 44,
    fontWeight: 'bold',
    color: '#4CAF50',
    letterSpacing: -1,
    textShadowColor: 'rgba(76, 175, 80, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  scoreSubtitle: {
    fontSize: fontSizes.sm,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 2,
    marginBottom: spacing.md,
  },

  // Buttons row inside header
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  detailsToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  detailsToggleBtnText: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontWeight: '600',
  },
  actionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  actionBtnPrimaryText: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontWeight: '600',
  },
  actionBtnSecondary: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  actionBtnSecondaryText: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontWeight: '600',
  },

  // ── Rounds list ────────────────────────────────────────────
  roundsHeader: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  roundsHeaderText: {
    color: colors.white,
    fontSize: fontSizes.md,
    fontWeight: '700',
  },
  roundItem: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  roundItemActive: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  roundItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  roundNumber: {
    color: colors.white,
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  roundPts: {
    fontSize: fontSizes.md,
    fontWeight: '700',
  },
  roundDetails: {
    gap: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailIcon: {
    fontSize: 14,
  },
  detailText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: fontSizes.xs,
  },
  detailValue: {
    color: colors.white,
    fontSize: fontSizes.xs,
    fontWeight: '500',
  },
});
