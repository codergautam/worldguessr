import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Animated,
  Linking,
  Platform,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Polyline, Callout, PROVIDER_GOOGLE } from 'react-native-maps';
import { colors } from '../../src/shared';
import { findDistance } from '../../src/shared/game/calcPoints';
import { api } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';
import PinMarker from '../../src/components/game/PinMarker';

const guessPinImage = require('../../assets/marker-src.png');
const actualPinImage = require('../../assets/marker-dest.png');
const oppPinImage = require('../../assets/marker-opp.png');
import { spacing, fontSizes, borderRadius } from '../../src/styles/theme';

interface OpponentGuess {
  playerId: string;
  username: string;
  guessLat: number;
  guessLong: number;
  points: number;
  timeTaken: number;
}

interface PlayerInfo {
  playerId: string;
  username: string;
  totalPoints: number;
  finalRank?: number;
  elo?: { before?: number; after?: number; change?: number };
}

interface MultiplayerInfo {
  gameType: string;
  players: PlayerInfo[];
  myId: string;
  isDuel: boolean;
  isWinner: boolean;
  isDraw: boolean;
}

interface DuelOpponent {
  username: string;
  points: number;
  didGuess: boolean;
}

interface RoundResult {
  guessLat: number | null;
  guessLong: number | null;
  actualLat?: number;
  actualLong?: number;
  panoId?: string;
  points: number;
  distance: number;
  timeTaken?: number;
  didGuess: boolean;
  opponents?: OpponentGuess[];       // opponents with valid coords (for map markers)
  duelOpponent?: DuelOpponent;       // primary opponent info for duel UI (even if no guess)
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
  const { totalScore, rounds, extent: extentParam, gameId, fromHistory } = useLocalSearchParams<{
    totalScore: string;
    rounds: string;
    extent?: string;
    gameId?: string;
    fromHistory?: string;
  }>();

  const isHistoryView = fromHistory === 'true';

  // History mode: fetch game details and transform into RoundResult[]
  const [historyLoading, setHistoryLoading] = useState(!!gameId && !rounds);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<{ score: number; rounds: RoundResult[] } | null>(null);
  const [multiplayerInfo, setMultiplayerInfo] = useState<MultiplayerInfo | null>(null);

  useEffect(() => {
    if (!gameId || rounds) return;
    const fetchHistory = async () => {
      try {
        const secret = useAuthStore.getState().secret;
        if (!secret) { setHistoryError('Not authenticated'); setHistoryLoading(false); return; }
        const data = await api.gameDetails(secret, gameId);
        const game = data.game as any;
        const myId: string = game.currentUserId;
        const isDuel = game.gameType === 'ranked_duel';
        const myPlayer = game.players.find((p: any) => p.accountId === myId);

        const transformedRounds: RoundResult[] = game.rounds
          .map((round: any) => {
            const guess = round.guess;
            const userDidGuess = guess != null && guess.guessLat != null && guess.guessLong != null;
            const dist = userDidGuess
              ? findDistance(round.location.lat, round.location.long, guess.guessLat, guess.guessLong)
              : 0;

            // Collect opponent guesses with valid coords (for map markers)
            const opponents: OpponentGuess[] = (round.allGuesses || [])
              .filter((g: any) => g.playerId !== myId && g.guessLat != null && g.guessLong != null)
              .map((g: any) => ({
                playerId: g.playerId,
                username: g.username,
                guessLat: g.guessLat,
                guessLong: g.guessLong,
                points: g.points,
                timeTaken: g.timeTaken,
              }));

            // For duel UI: get primary opponent info even if they didn't guess
            const oppAllGuess = (round.allGuesses || []).find((g: any) => g.playerId !== myId);
            const duelOpponent: DuelOpponent | undefined = oppAllGuess
              ? {
                  username: oppAllGuess.username,
                  points: oppAllGuess.points ?? 0,
                  didGuess: oppAllGuess.guessLat != null && oppAllGuess.guessLong != null,
                }
              : undefined;

            return {
              guessLat: userDidGuess ? guess.guessLat : null,
              guessLong: userDidGuess ? guess.guessLong : null,
              actualLat: round.location.lat,
              actualLong: round.location.long,
              panoId: round.location.panoId ?? undefined,
              points: guess?.points ?? 0,
              distance: dist,
              timeTaken: guess?.timeTaken,
              didGuess: userDidGuess,
              opponents: opponents.length > 0 ? opponents : undefined,
              duelOpponent,
            };
          });

        const total = transformedRounds.reduce((sum, r) => sum + r.points, 0);
        setHistoryData({ score: total, rounds: transformedRounds });

        // Build multiplayer info if more than 1 player
        if (game.players.length > 1) {
          setMultiplayerInfo({
            gameType: game.gameType,
            players: game.players.map((p: any) => ({
              playerId: p.accountId,
              username: p.username,
              totalPoints: p.totalPoints,
              finalRank: p.finalRank,
              elo: p.elo,
            })),
            myId,
            isDuel,
            isWinner: myPlayer?.finalRank === 1,
            isDraw: game.result?.isDraw ?? false,
          });
        }
      } catch (err) {
        console.error('Error fetching game details:', err);
        setHistoryError('Failed to load game details');
      } finally {
        setHistoryLoading(false);
      }
    };
    fetchHistory();
  }, [gameId]);

  // Parse extent [west, south, east, north] if provided
  const extent: [number, number, number, number] | null = useMemo(() => {
    if (!extentParam) return null;
    try {
      const parsed = JSON.parse(extentParam);
      if (Array.isArray(parsed) && parsed.length === 4) return parsed as [number, number, number, number];
    } catch {}
    return null;
  }, [extentParam]);
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isLandscape = width > height;

  const openInGoogleMaps = useCallback((lat: number, lng: number, panoId?: string) => {
    const url = panoId
      ? `https://www.google.com/maps/@?api=1&map_action=pano&pano=${panoId}`
      : `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
    Linking.openURL(url);
  }, []);

  const parsedRounds: RoundResult[] = useMemo(
    () => historyData ? historyData.rounds : (rounds ? JSON.parse(rounds) : []),
    [rounds, historyData],
  );
  const score = historyData ? historyData.score : parseInt(totalScore ?? '0', 10);
  const maxScore = parsedRounds.length * 5000;
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const stars = useMemo(() => getStars(percentage), [percentage]);

  const [activeRound, setActiveRound] = useState<number | null>(null);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [collapsedContentHeight, setCollapsedContentHeight] = useState(0);

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
      r.opponents?.forEach((opp) => {
        coords.push({ latitude: opp.guessLat, longitude: opp.guessLong });
      });
    });

    // Include extent corners so the map shows the full playable area
    if (extent) {
      const [west, south, east, north] = extent;
      coords.push({ latitude: south, longitude: west });
      coords.push({ latitude: north, longitude: east });
    }

    if (coords.length > 0) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: getMapPadding(),
        animated: true,
      });
    }
  }, [parsedRounds, getMapPadding, extent]);

  const didInitialFit = useRef(false);
  useEffect(() => {
    if (didInitialFit.current) return;
    const timeout = setTimeout(() => {
      didInitialFit.current = true;
      fitMapToAllRounds();
    }, 500);
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
      round.opponents?.forEach((opp) => {
        coords.push({ latitude: opp.guessLat, longitude: opp.guessLong });
      });

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

  // ── Helper: find my ELO data for duel header ─────────────
  const myEloData = useMemo(() => {
    if (!multiplayerInfo?.isDuel) return null;
    const me = multiplayerInfo.players.find(p => p.playerId === multiplayerInfo.myId);
    return me?.elo ?? null;
  }, [multiplayerInfo]);

  // ── Helper: find my rank for multiplayer header ──────────
  const myRank = useMemo(() => {
    if (!multiplayerInfo || multiplayerInfo.isDuel) return null;
    const sorted = [...multiplayerInfo.players].sort((a, b) => b.totalPoints - a.totalPoints);
    const idx = sorted.findIndex(p => p.playerId === multiplayerInfo.myId);
    return idx >= 0 ? { rank: idx + 1, total: sorted.length } : null;
  }, [multiplayerInfo]);

  // ── History loading / error states ────────────────────────
  if (historyLoading) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={{ color: 'rgba(255,255,255,0.7)', marginTop: 16, fontFamily: 'Lexend' }}>
          Loading game details...
        </Text>
      </View>
    );
  }
  if (historyError) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: '#F44336', fontSize: 16, fontFamily: 'Lexend' }}>{historyError}</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: '#4CAF50', fontFamily: 'Lexend-SemiBold' }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  // ── Map markers ────────────────────────────────────────────
  const renderMapMarkers = () =>
    parsedRounds.map((round, index) => {
      const hasActual = round.actualLat != null && round.actualLong != null;
      const hasGuess = round.guessLat != null && round.guessLong != null;

      if (activeRound !== null && activeRound !== index) return null;

      return (
        <React.Fragment key={index}>
          {hasActual && (
            <PinMarker
              identifier={`actual-${index}`}
              coordinate={{ latitude: round.actualLat!, longitude: round.actualLong! }}
              imageSource={actualPinImage}
              stopPropagation
            >
              <Callout onPress={() => openInGoogleMaps(round.actualLat!, round.actualLong!, round.panoId)}>
                <View style={styles.calloutContainer}>
                  <Text style={styles.calloutTitle}>Round {index + 1} — Actual Location</Text>
                  <Text style={[styles.calloutPoints, { color: getPointsColor(round.points) }]}>
                    {round.points.toLocaleString()} points
                  </Text>
                  {round.distance != null && (
                    <Text style={styles.calloutDistance}>
                      Distance: {formatDistance(round.distance)}
                    </Text>
                  )}
                  <View style={styles.calloutActionBtn}>
                    <Text style={styles.calloutActionText}>📍 Open in Maps</Text>
                  </View>
                </View>
              </Callout>
            </PinMarker>
          )}
          {hasGuess && (
            <PinMarker
              identifier={`guess-${index}`}
              coordinate={{ latitude: round.guessLat!, longitude: round.guessLong! }}
              imageSource={guessPinImage}
              stopPropagation
            >
              <Callout>
                <View style={styles.calloutContainer}>
                  <Text style={styles.calloutTitle}>Round {index + 1} — Your Guess</Text>
                  <Text style={[styles.calloutPoints, { color: getPointsColor(round.points) }]}>
                    {round.points.toLocaleString()} points
                  </Text>
                  {round.distance != null && (
                    <Text style={styles.calloutDistance}>
                      Distance: {formatDistance(round.distance)}
                    </Text>
                  )}
                </View>
              </Callout>
            </PinMarker>
          )}
          {hasActual && hasGuess && (
            <Polyline
              coordinates={[
                { latitude: round.actualLat!, longitude: round.actualLong! },
                { latitude: round.guessLat!, longitude: round.guessLong! },
              ]}
              strokeColor={getPolylineColor(round.points)}
              strokeWidth={3}
              lineDashPattern={[10, 5]}
            />
          )}
          {/* Opponent guesses */}
          {hasActual && round.opponents?.map((opp) => (
            <React.Fragment key={`opp-${index}-${opp.playerId}`}>
              <PinMarker
                identifier={`opp-${index}-${opp.playerId}`}
                coordinate={{ latitude: opp.guessLat, longitude: opp.guessLong }}
                imageSource={oppPinImage}
                stopPropagation
              >
                <Callout>
                  <View style={styles.calloutContainer}>
                    <Text style={styles.calloutTitle}>{opp.username}</Text>
                    <Text style={[styles.calloutPoints, { color: getPointsColor(opp.points) }]}>
                      {opp.points.toLocaleString()} points
                    </Text>
                  </View>
                </Callout>
              </PinMarker>
              <Polyline
                coordinates={[
                  { latitude: round.actualLat!, longitude: round.actualLong! },
                  { latitude: opp.guessLat, longitude: opp.guessLong },
                ]}
                strokeColor={getPolylineColor(opp.points)}
                strokeWidth={2}
                lineDashPattern={[6, 4]}
              />
            </React.Fragment>
          ))}
        </React.Fragment>
      );
    });

  // ── Sidebar header (stars + score + buttons) ───────────────
  const renderHeader = (compact: boolean) => (
    <View style={[styles.header, compact && styles.headerCompact]}>
      {/* Duel: Victory/Defeat/Draw title + ELO */}
      {multiplayerInfo?.isDuel ? (
        <>
          <Text style={[
            styles.duelTitle,
            compact && { fontSize: 24 },
            { color: multiplayerInfo.isDraw ? '#FFC107' : multiplayerInfo.isWinner ? '#4CAF50' : '#F44336' },
          ]}>
            {multiplayerInfo.isDraw ? 'Draw' : multiplayerInfo.isWinner ? 'Victory' : 'Defeat'}
          </Text>
          {myEloData && typeof myEloData.before === 'number' && typeof myEloData.after === 'number' && (
            <View style={styles.eloContainer}>
              <Text style={styles.eloLabel}>ELO</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.eloValue}>{myEloData.after}</Text>
                <Text style={[
                  styles.eloChange,
                  { color: (myEloData.change ?? 0) >= 0 ? '#4CAF50' : '#F44336' },
                ]}>
                  {(myEloData.change ?? 0) > 0 ? '+' : ''}{myEloData.change ?? 0}
                </Text>
              </View>
            </View>
          )}
        </>
      ) : (
        <>
          {/* Stars (singleplayer + multiplayer non-duel) */}
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
          {/* Multiplayer rank */}
          {myRank && (
            <Text style={[styles.rankText, compact && { fontSize: 14 }]}>
              Rank {myRank.rank}/{myRank.total}
            </Text>
          )}
        </>
      )}

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
        {isHistoryView ? (
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
          >
            <LinearGradient
              colors={['#4CAF50', '#45a049']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.actionBtnPrimary}
            >
              <Ionicons name="arrow-back" size={16} color={colors.white} />
              <Text style={styles.actionBtnPrimaryText}>Back</Text>
            </LinearGradient>
          </Pressable>
        ) : (
          <>
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
          </>
        )}
      </View>
    </View>
  );

  // ── Leaderboard for multiplayer non-duel ──────────────────
  const renderLeaderboard = () => {
    if (!multiplayerInfo || multiplayerInfo.isDuel) return null;
    const sorted = [...multiplayerInfo.players].sort((a, b) => b.totalPoints - a.totalPoints);
    const trophyColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
    return (
      <View style={{ marginBottom: 8 }}>
        <View style={styles.roundsHeader}>
          <Text style={styles.roundsHeaderText}>Final Scores</Text>
        </View>
        {sorted.map((player, idx) => {
          const isMe = player.playerId === multiplayerInfo.myId;
          return (
            <View
              key={player.playerId}
              style={[styles.roundItem, isMe && { backgroundColor: 'rgba(76, 175, 80, 0.15)' }]}
            >
              <View style={styles.roundItemHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {idx < 3 && (
                    <Ionicons name="trophy" size={16} color={trophyColors[idx]} />
                  )}
                  <Text style={[styles.roundNumber, isMe && { color: '#4CAF50' }]}>
                    #{idx + 1} {player.username}{isMe ? ' (you)' : ''}
                  </Text>
                </View>
                <Text style={[styles.roundPts, { color: getPointsColor(player.totalPoints) }]}>
                  {player.totalPoints.toLocaleString()} pts
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  // ── Rounds list ────────────────────────────────────────────
  const renderRoundsList = () => (
    <>
      {/* Multiplayer leaderboard */}
      {renderLeaderboard()}

      <View style={styles.roundsHeader}>
        <Text style={styles.roundsHeaderText}>Round Details</Text>
      </View>
      {parsedRounds.map((round, index) => {
        const isActive = activeRound === index;
        const duelOpp = round.duelOpponent;

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
                {round.timeTaken != null && round.timeTaken > 0 && (
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontFamily: 'Lexend' }}>
                    {formatTime(round.timeTaken)}
                  </Text>
                )}
              </View>

              {/* Duel: side-by-side comparison */}
              {multiplayerInfo?.isDuel && duelOpp ? (
                <View style={styles.duelRoundRow}>
                  <View style={styles.duelPlayerCol}>
                    <Text style={styles.duelPlayerName}>You</Text>
                    {round.didGuess ? (
                      <Text style={[styles.duelPlayerScore, { color: getPointsColor(round.points) }]}>
                        {round.points} pts
                      </Text>
                    ) : (
                      <Text style={[styles.duelPlayerScore, { color: 'rgba(255,255,255,0.4)' }]}>
                        No guess
                      </Text>
                    )}
                    {round.didGuess && duelOpp.didGuess && round.points < duelOpp.points && (
                      <Text style={styles.healthDamage}>
                        -{duelOpp.points - round.points} ❤️
                      </Text>
                    )}
                  </View>

                  <Text style={styles.vsDivider}>VS</Text>

                  <View style={styles.duelPlayerCol}>
                    <Text style={styles.duelPlayerName}>{duelOpp.username}</Text>
                    {duelOpp.didGuess ? (
                      <Text style={[styles.duelPlayerScore, { color: getPointsColor(duelOpp.points) }]}>
                        {duelOpp.points} pts
                      </Text>
                    ) : (
                      <Text style={[styles.duelPlayerScore, { color: 'rgba(255,255,255,0.4)' }]}>
                        No guess
                      </Text>
                    )}
                    {round.didGuess && duelOpp.didGuess && duelOpp.points < round.points && (
                      <Text style={styles.healthDamage}>
                        -{round.points - duelOpp.points} ❤️
                      </Text>
                    )}
                  </View>
                </View>
              ) : (
                <>
                  {/* Standard: points + details */}
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 4 }}>
                    <Text style={[styles.roundPts, { color: getPointsColor(round.points) }]}>
                      {round.points.toLocaleString()} pts
                    </Text>
                  </View>
                </>
              )}

              {/* Detail rows (distance) — shown for non-duel types only */}
              {!multiplayerInfo?.isDuel && (
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
                </View>
              )}
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
          <View
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
          </View>
        </View>
      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // PORTRAIT LAYOUT — map top, bottom sheet panel (like web mobile)
  // ═══════════════════════════════════════════════════════════
  const bottomInsetPadding = Math.max(insets.bottom, 8);
  const panelBottomPadding = detailsExpanded ? bottomInsetPadding : 26;
  const collapsedHeight = collapsedContentHeight > 0
    ? collapsedContentHeight + panelBottomPadding
    : Math.min(height * 0.35, 240 + panelBottomPadding);
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
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(20, 65, 25, 0.97)', 'rgba(20, 65, 25, 0.90)']}
          style={[
            styles.portraitPanelGradient,
            {
              paddingBottom: panelBottomPadding,
            },
          ]}
        >
          <View
            onLayout={(event) => {
              if (detailsExpanded) return;
              const nextHeight = Math.ceil(event.nativeEvent.layout.height);
              if (Math.abs(nextHeight - collapsedContentHeight) >= 2) {
                setCollapsedContentHeight(nextHeight);
              }
            }}
          >
            {/* Drag handle — tap to toggle details */}
            <Pressable onPress={toggleDetails} style={styles.handleBarTouchArea}>
              <View style={styles.handleBar} />
            </Pressable>

            {renderHeader(detailsExpanded)}
          </View>

          {/* Rounds section — always rendered, animated via panel height */}
          {detailsExpanded && (
            <>
              <View style={styles.sidebarDivider} />
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: spacing.lg + bottomInsetPadding }}
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
    backgroundColor: 'rgba(20, 65, 25, 0.97)',
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
    backgroundColor: 'rgba(20, 65, 25, 0.97)',
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
  handleBarTouchArea: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 8,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
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
    fontFamily: 'Lexend-Bold',
    color: '#4CAF50',
    letterSpacing: -1,
    textShadowColor: 'rgba(76, 175, 80, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  scoreSubtitle: {
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend',
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
    fontFamily: 'Lexend-SemiBold',
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
    fontFamily: 'Lexend-SemiBold',
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
    fontFamily: 'Lexend-SemiBold',
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
    fontFamily: 'Lexend-Bold',
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
    fontFamily: 'Lexend-SemiBold',
  },
  roundPts: {
    fontSize: fontSizes.md,
    fontFamily: 'Lexend-Bold',
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
    fontFamily: 'Lexend',
  },
  detailValue: {
    color: colors.white,
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-Medium',
  },
  // ── Callout tooltips ─────────────────────────────────────────
  calloutContainer: {
    minWidth: 180,
    padding: 8,
  },
  calloutTitle: {
    fontFamily: 'Lexend-Bold',
    fontSize: 13,
    marginBottom: 4,
    color: '#333',
  },
  calloutPoints: {
    fontFamily: 'Lexend-Bold',
    fontSize: 13,
    marginBottom: 2,
  },
  calloutDistance: {
    fontSize: 12,
    fontFamily: 'Lexend',
    color: '#666',
    marginBottom: 4,
  },
  calloutActionBtn: {
    marginTop: 6,
    backgroundColor: '#4285F4',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  calloutActionText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'Lexend-SemiBold',
  },

  // ── Duel header styles ─────────────────────────────────────
  duelTitle: {
    fontSize: 32,
    fontFamily: 'Lexend-Bold',
    marginBottom: 4,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  eloContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  eloLabel: {
    fontSize: 11,
    fontFamily: 'Lexend',
    color: 'rgba(255, 255, 255, 0.6)',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  eloValue: {
    fontSize: 22,
    fontFamily: 'Lexend-Bold',
    color: colors.white,
  },
  eloChange: {
    fontSize: 16,
    fontFamily: 'Lexend-Bold',
  },
  rankText: {
    fontSize: 16,
    fontFamily: 'Lexend-Bold',
    color: colors.white,
    marginBottom: 4,
    opacity: 0.9,
  },

  // ── Duel round comparison styles ───────────────────────────
  duelRoundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 4,
  },
  duelPlayerCol: {
    flex: 1,
    alignItems: 'center',
  },
  duelPlayerName: {
    fontSize: 12,
    fontFamily: 'Lexend',
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 2,
  },
  duelPlayerScore: {
    fontSize: 15,
    fontFamily: 'Lexend-Bold',
  },
  healthDamage: {
    fontSize: 12,
    fontFamily: 'Lexend',
    color: '#ff6b6b',
    marginTop: 2,
  },
  vsDivider: {
    paddingHorizontal: 12,
    fontSize: 12,
    fontFamily: 'Lexend-Bold',
    color: 'rgba(255, 255, 255, 0.4)',
  },
});
