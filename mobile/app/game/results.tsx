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
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Polyline, Callout, PROVIDER_GOOGLE } from 'react-native-maps';
import EmbeddedMap from '../../src/components/game/EmbeddedMap';
import { colors, formatDistance } from '../../src/shared';
import { useSettingsStore } from '../../src/store/settingsStore';
import { findDistance } from '../../src/shared/game/calcPoints';
import { api } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';
import { maybeShowGameInterstitial } from '../../src/services/ads';
import PinMarker from '../../src/components/game/PinMarker';
import CountryFlag from '../../src/components/CountryFlag';
import EloChangeDisplay from '../../src/components/multiplayer/EloChangeDisplay';

const guessPinImage = require('../../assets/marker-src.png');
const actualPinImage = require('../../assets/marker-dest.png');
const oppPinImage = require('../../assets/marker-opp.png');
import { spacing, fontSizes, borderRadius } from '../../src/styles/theme';

interface OpponentGuess {
  playerId: string;
  username: string;
  countryCode?: string;
  guessLat: number;
  guessLong: number;
  points: number;
  timeTaken: number;
}

interface PlayerMapGuess {
  playerId: string;
  username: string;
  countryCode?: string;
  guessLat: number;
  guessLong: number;
  points: number;
  timeTaken?: number;
}

interface PlayerRoundData {
  roundNumber: number;
  points: number;
  distance?: number;
  timeTaken?: number;
}

interface PlayerInfo {
  playerId: string;
  username: string;
  countryCode?: string;
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
  roundData: Record<string, PlayerRoundData[]>;
}

interface DuelOpponent {
  username: string;
  countryCode?: string;
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
  xpEarned?: number;
  didGuess: boolean;
  opponents?: OpponentGuess[];
  allPlayerGuesses?: PlayerMapGuess[];
  duelOpponent?: DuelOpponent;
}

interface LiveRoundHistoryEntry {
  round: number;
  location: {
    lat: number;
    long: number;
    panoId?: string;
  };
  players: Record<string, {
    username: string;
    countryCode?: string;
    lat: number | null;
    long: number | null;
    points: number;
    final: boolean;
    timeTaken?: number;
  }>;
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

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function parseLiveRoundHistory(roundsParam?: string): LiveRoundHistoryEntry[] {
  if (!roundsParam) return [];
  try {
    const parsed = JSON.parse(roundsParam) as LiveRoundHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function transformLiveRounds(history: LiveRoundHistoryEntry[], myId: string): RoundResult[] {
  return history.map((round) => {
    const effectiveMyId = myId || Object.keys(round.players)[0] || '';
    const mine = round.players[effectiveMyId];
    const didGuess = mine?.lat != null && mine.long != null;
    const opponents: OpponentGuess[] = Object.entries(round.players)
      .filter(([playerId, player]) => playerId !== effectiveMyId && player.lat != null && player.long != null)
      .map(([playerId, player]) => ({
        playerId,
        username: player.username,
        countryCode: player.countryCode,
        guessLat: player.lat!,
        guessLong: player.long!,
        points: player.points ?? 0,
        timeTaken: player.timeTaken ?? 0,
      }));
    const allPlayerGuesses: PlayerMapGuess[] = Object.entries(round.players)
      .filter(([, player]) => player.lat != null && player.long != null)
      .map(([playerId, player]) => ({
        playerId,
        username: player.username,
        countryCode: player.countryCode,
        guessLat: player.lat!,
        guessLong: player.long!,
        points: player.points ?? 0,
        timeTaken: player.timeTaken,
      }));
    const duelOpponentEntry = Object.entries(round.players).find(([playerId]) => playerId !== effectiveMyId);
    const duelOpponent = duelOpponentEntry
      ? {
          username: duelOpponentEntry[1].username,
          countryCode: duelOpponentEntry[1].countryCode,
          points: duelOpponentEntry[1].points ?? 0,
          didGuess: duelOpponentEntry[1].lat != null && duelOpponentEntry[1].long != null,
        }
      : undefined;
    const guessLat = didGuess ? mine?.lat ?? null : null;
    const guessLong = didGuess ? mine?.long ?? null : null;
    const distance = guessLat != null && guessLong != null
      ? findDistance(round.location.lat, round.location.long, guessLat, guessLong)
      : 0;

    return {
      guessLat,
      guessLong,
      actualLat: round.location.lat,
      actualLong: round.location.long,
      panoId: round.location.panoId,
      points: mine?.points ?? 0,
      distance,
      timeTaken: mine?.timeTaken,
      didGuess,
      opponents: opponents.length > 0 ? opponents : undefined,
      allPlayerGuesses: allPlayerGuesses.length > 0 ? allPlayerGuesses : undefined,
      duelOpponent,
    };
  });
}

function buildLiveRoundData(history: LiveRoundHistoryEntry[]): Record<string, PlayerRoundData[]> {
  const roundData: Record<string, PlayerRoundData[]> = {};
  history.forEach((round, index) => {
    Object.entries(round.players).forEach(([playerId, player]) => {
      if (!roundData[playerId]) roundData[playerId] = [];
      const distance = player.lat != null && player.long != null
        ? findDistance(round.location.lat, round.location.long, player.lat, player.long)
        : undefined;
      roundData[playerId].push({
        roundNumber: index + 1,
        points: player.points ?? 0,
        distance,
        timeTaken: player.timeTaken,
      });
    });
  });
  return roundData;
}

// Sidebar width in landscape (matches web's 400px sidebar proportionally)
const SIDEBAR_WIDTH = 340;

export default function GameResultsScreen() {
  const {
    totalScore,
    rounds,
    extent: extentParam,
    gameId,
    fromHistory,
    multiplayer: mpParam,
    duelEnd: duelEndParam,
    players: playersParam,
    mode,
    myId: liveMyIdParam,
    duel: duelParam,
  } = useLocalSearchParams<{
    totalScore: string;
    rounds: string;
    extent?: string;
    gameId?: string;
    fromHistory?: string;
    multiplayer?: string;
    duelEnd?: string;
    players?: string;
    mode?: string;
    myId?: string;
    duel?: string;
  }>();

  const isHistoryView = fromHistory === 'true';
  const isLiveMultiplayer = mpParam === 'true';
  const secret = useAuthStore((s) => s.secret);

  // History mode: fetch game details and transform into RoundResult[]
  const [historyLoading, setHistoryLoading] = useState(!!gameId && !rounds);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<{ score: number; rounds: RoundResult[] } | null>(null);
  const [historyMode, setHistoryMode] = useState<string | null>(null);
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
        if (game.settings?.countryGuesser) {
          setHistoryMode(
            game.settings.countryGuessrSubMode === 'continent'
              ? 'continentGuesser'
              : 'countryGuesser',
          );
        } else {
          setHistoryMode(null);
        }

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
                countryCode: g.countryCode,
                guessLat: g.guessLat,
                guessLong: g.guessLong,
                points: g.points,
                timeTaken: g.timeTaken,
              }));
            const allPlayerGuesses: PlayerMapGuess[] = (round.allGuesses || [])
              .filter((g: any) => g.guessLat != null && g.guessLong != null)
              .map((g: any) => ({
                playerId: g.playerId,
                username: g.username,
                countryCode: g.countryCode,
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
                  countryCode: oppAllGuess.countryCode,
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
              xpEarned: guess?.xpEarned,
              didGuess: userDidGuess,
              opponents: opponents.length > 0 ? opponents : undefined,
              allPlayerGuesses: allPlayerGuesses.length > 0 ? allPlayerGuesses : undefined,
              duelOpponent,
            };
          });

        const total = transformedRounds.reduce((sum, r) => sum + r.points, 0);
        setHistoryData({ score: total, rounds: transformedRounds });

        // Build per-player round data for drill-down
        const roundData: Record<string, PlayerRoundData[]> = {};
        game.rounds.forEach((round: any, idx: number) => {
          (round.allGuesses || []).forEach((g: any) => {
            if (!roundData[g.playerId]) roundData[g.playerId] = [];
            const d = (g.guessLat != null && g.guessLong != null)
              ? findDistance(round.location.lat, round.location.long, g.guessLat, g.guessLong)
              : undefined;
            roundData[g.playerId].push({
              roundNumber: idx + 1,
              points: g.points ?? 0,
              distance: d,
              timeTaken: g.timeTaken,
            });
          });
        });

        // Build multiplayer info if more than 1 player
        if (game.players.length > 1) {
          setMultiplayerInfo({
            gameType: game.gameType,
            players: game.players.map((p: any) => ({
              playerId: p.accountId,
              username: p.username,
              countryCode: p.countryCode,
              totalPoints: p.totalPoints,
              finalRank: p.finalRank,
              elo: p.elo,
            })),
            myId,
            isDuel,
            isWinner: myPlayer?.finalRank === 1,
            isDraw: game.result?.isDraw ?? false,
            roundData,
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

  // Build multiplayer info from live game params
  useEffect(() => {
    if (!isLiveMultiplayer || !playersParam) return;
    try {
      const players = JSON.parse(playersParam);
      const duelEnd = duelEndParam ? JSON.parse(duelEndParam) : null;
      const liveHistory = parseLiveRoundHistory(rounds);
      const myId = liveMyIdParam ?? players.find((p: any) => p.id)?.id ?? '';
      const roundData = buildLiveRoundData(liveHistory);

      setMultiplayerInfo({
        gameType: duelEnd ? 'ranked_duel' : (duelParam === 'true' ? 'ranked_duel' : 'party'),
        players: players.map((p: any) => ({
          playerId: p.id,
          username: p.username,
          countryCode: p.countryCode,
          totalPoints: p.score ?? 0,
          elo: duelEnd && p.id === myId
            ? { before: duelEnd.oldElo, after: duelEnd.newElo, change: duelEnd.newElo - duelEnd.oldElo }
            : undefined,
        })),
        myId,
        isDuel: !!duelEnd,
        isWinner: duelEnd?.winner ?? false,
        isDraw: duelEnd?.draw ?? false,
        roundData,
      });
    } catch {}
  }, [isLiveMultiplayer, playersParam, duelEndParam, rounds, liveMyIdParam, duelParam]);

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
  const units = useSettingsStore((s) => s.units);

  const isLandscape = width > height;

  const openInGoogleMaps = useCallback((lat: number, lng: number, panoId?: string) => {
    const url = panoId
      ? `https://www.google.com/maps/@?api=1&map_action=pano&pano=${panoId}`
      : `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
    Linking.openURL(url);
  }, []);

  const parsedRounds: RoundResult[] = useMemo(() => {
    if (historyData) return historyData.rounds;
    if (!rounds) return [];
    if (isLiveMultiplayer) {
      return transformLiveRounds(parseLiveRoundHistory(rounds), liveMyIdParam ?? '');
    }
    try {
      const parsed = JSON.parse(rounds) as RoundResult[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [rounds, historyData, isLiveMultiplayer, liveMyIdParam]);

  // Web finalHistory shape for the results embed (components/ResultsMap.js): my
  // guess = guessLat/guessLong; players = opponents (which already exclude me).
  const resultsRounds = useMemo(
    () =>
      parsedRounds.map((r) => ({
        lat: r.actualLat,
        long: r.actualLong,
        guessLat: r.guessLat,
        guessLong: r.guessLong,
        points: r.points,
        panoId: r.panoId,
        players: (r.opponents ?? []).reduce(
          (acc, o) => {
            acc[o.playerId] = {
              lat: o.guessLat,
              long: o.guessLong,
              points: o.points,
              username: o.username,
              countryCode: o.countryCode,
            };
            return acc;
          },
          {} as Record<
            string,
            { lat: number; long: number; points: number; username: string; countryCode?: string }
          >,
        ),
      })),
    [parsedRounds],
  );
  const score = historyData ? historyData.score : parseInt(totalScore ?? '0', 10);
  const resultMode = mode ?? historyMode;
  const isCountryGuesserResult = resultMode === 'countryGuesser' || resultMode === 'continentGuesser';
  const maxScore = parsedRounds.length * (isCountryGuesserResult ? 1000 : 5000);
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const stars = useMemo(() => getStars(percentage), [percentage]);
  const totalXpEarned = useMemo(
    () => parsedRounds.reduce((sum, round) => sum + (round.xpEarned ?? 0), 0),
    [parsedRounds],
  );
  const showXpEarned = !!secret && totalXpEarned > 0 && !multiplayerInfo?.isDuel;

  const [activeRound, setActiveRound] = useState<number | null>(null);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [collapsedContentHeight, setCollapsedContentHeight] = useState(0);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [gameIdCopied, setGameIdCopied] = useState(false);
  const gameIdCopiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Report modal state
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportReason, setReportReason] = useState<'inappropriate_username' | 'cheating' | 'other' | ''>('');
  const [reportDescription, setReportDescription] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportTarget, setReportTarget] = useState<string | null>(null);

  // Animated panel height for smooth expand/collapse
  const panelAnim = useRef(new Animated.Value(0)).current; // 0 = collapsed, 1 = expanded

  // Animated score counter
  const animatedValue = useRef(new Animated.Value(0)).current;
  const [displayScore, setDisplayScore] = useState(0);
  const animatedXpValue = useRef(new Animated.Value(0)).current;
  const [displayXp, setDisplayXp] = useState(0);

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

  useEffect(() => {
    animatedXpValue.setValue(0);
    const listener = animatedXpValue.addListener(({ value }) => {
      setDisplayXp(Math.round(value));
    });

    Animated.timing(animatedXpValue, {
      toValue: totalXpEarned,
      duration: 1200,
      easing: (t: number) => 1 - Math.pow(1 - t, 3),
      useNativeDriver: false,
    }).start();

    return () => {
      animatedXpValue.removeListener(listener);
    };
  }, [totalXpEarned]);

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

  // Safely fit the map to a coord list. Two failure modes we have to handle
  // that bare fitToCoordinates can't:
  //   (1) Single coord (country-guesser round focus has no guess pin, only
  //       the actual location) — fitToCoordinates zooms to the maximum and
  //       feels like a punch to the face. We use a sensible regional zoom
  //       (~8° delta, same as GuessMap's no-guess reveal) instead.
  //   (2) Coordinates that span > 180° of longitude (e.g., a worldwide game
  //       where rounds are scattered across continents) — Google Maps'
  //       LatLngBounds takes the shortest east-west arc, which can fling
  //       the camera off to one side and hide half the pins. We detect a
  //       wide span and use animateToRegion with explicit deltas centered
  //       on the actual coordinate centroid instead.
  const fitToCoordsSafely = useCallback(
    (coords: { latitude: number; longitude: number }[]) => {
      if (!mapRef.current || coords.length === 0) return;

      if (coords.length === 1) {
        mapRef.current.animateToRegion(
          {
            latitude: coords[0].latitude,
            longitude: coords[0].longitude,
            latitudeDelta: 8,
            longitudeDelta: 8,
          },
          500,
        );
        return;
      }

      let minLat = Infinity;
      let maxLat = -Infinity;
      let minLng = Infinity;
      let maxLng = -Infinity;
      for (const c of coords) {
        if (c.latitude < minLat) minLat = c.latitude;
        if (c.latitude > maxLat) maxLat = c.latitude;
        if (c.longitude < minLng) minLng = c.longitude;
        if (c.longitude > maxLng) maxLng = c.longitude;
      }
      const latSpan = maxLat - minLat;
      const lngSpan = maxLng - minLng;

      if (lngSpan > 180 || latSpan > 120) {
        // Too wide for fitToCoordinates to handle reliably — show the full
        // span explicitly via animateToRegion. Pad deltas by 1.4x so the
        // outermost pins aren't flush with the map edge.
        mapRef.current.animateToRegion(
          {
            latitude: (minLat + maxLat) / 2,
            longitude: (minLng + maxLng) / 2,
            latitudeDelta: Math.min(180, Math.max(latSpan * 1.4, 40)),
            longitudeDelta: Math.min(360, Math.max(lngSpan * 1.4, 60)),
          },
          500,
        );
        return;
      }

      mapRef.current.fitToCoordinates(coords, {
        edgePadding: getMapPadding(),
        animated: true,
      });
    },
    [getMapPadding],
  );

  const fitMapToAllRounds = useCallback(() => {
    if (!mapRef.current || parsedRounds.length === 0) return;

    const coords: { latitude: number; longitude: number }[] = [];
    parsedRounds.forEach((r) => {
      if (r.actualLat != null && r.actualLong != null) {
        coords.push({ latitude: r.actualLat, longitude: r.actualLong });
      }
      if (!isCountryGuesserResult && r.guessLat != null && r.guessLong != null) {
        coords.push({ latitude: r.guessLat, longitude: r.guessLong });
      }
      if (!isCountryGuesserResult) {
        r.opponents?.forEach((opp) => {
          coords.push({ latitude: opp.guessLat, longitude: opp.guessLong });
        });
      }
    });

    // Include extent corners so the map shows the full playable area
    if (extent) {
      const [west, south, east, north] = extent;
      coords.push({ latitude: south, longitude: west });
      coords.push({ latitude: north, longitude: east });
    }

    fitToCoordsSafely(coords);
  }, [parsedRounds, extent, isCountryGuesserResult, fitToCoordsSafely]);

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
      if (!isCountryGuesserResult && round.guessLat != null && round.guessLong != null) {
        coords.push({ latitude: round.guessLat, longitude: round.guessLong });
      }
      if (!isCountryGuesserResult) {
        round.opponents?.forEach((opp) => {
          coords.push({ latitude: opp.guessLat, longitude: opp.guessLong });
        });
      }

      fitToCoordsSafely(coords);
    },
    [parsedRounds, isCountryGuesserResult, fitToCoordsSafely],
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
    if (isLiveMultiplayer) {
      // Clean up multiplayer state and go home to re-queue
      const { useMultiplayerStore: mpStore } = require('../../src/store/multiplayerStore');
      const { wsService: ws } = require('../../src/services/websocket');
      mpStore.getState().reset();
      // Auto re-queue for duels
      if (multiplayerInfo?.isDuel) {
        maybeShowGameInterstitial('rankedDuel');
        ws.send({ type: 'publicDuel' });
        mpStore.setState({ gameQueued: 'publicDuel' as const });
      }
      router.dismissAll();
      return;
    }
    // Play Again always restarts a world singleplayer game (map: 'all'),
    // never a community map — so it's always ad-eligible.
    maybeShowGameInterstitial('singleplayer');
    router.replace({
      pathname: '/game/[id]',
      params: {
        id: 'singleplayer',
        map: 'all',
        rounds: isCountryGuesserResult ? '10' : '5',
        time: '60',
        mode: mode || 'world',
      },
    });
  };

  const handleGoHome = () => {
    if (isLiveMultiplayer) {
      const { useMultiplayerStore: mpStore } = require('../../src/store/multiplayerStore');
      mpStore.getState().reset();
    }
    router.dismissAll();
  };
  const handleBackPress = () => {
    if (isHistoryView) {
      router.back();
      return;
    }
    handleGoHome();
  };

  const handleCopyGameId = useCallback(async () => {
    if (!gameId) return;
    await Clipboard.setStringAsync(gameId);
    setGameIdCopied(true);
    if (gameIdCopiedTimer.current) clearTimeout(gameIdCopiedTimer.current);
    gameIdCopiedTimer.current = setTimeout(() => {
      setGameIdCopied(false);
      gameIdCopiedTimer.current = null;
    }, 1600);
  }, [gameId]);

  useEffect(() => {
    return () => {
      if (gameIdCopiedTimer.current) clearTimeout(gameIdCopiedTimer.current);
    };
  }, []);

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

  const playerStreaks = useMemo(() => {
    const streaks: Record<string, number> = {};
    if (!multiplayerInfo) return streaks;

    multiplayerInfo.players.forEach((player) => {
      const roundsForPlayer = multiplayerInfo.roundData[player.playerId] ?? [];
      let best = 0;
      let current = 0;
      roundsForPlayer.forEach((round) => {
        if (round.points > 0) {
          current += 1;
          best = Math.max(best, current);
        } else {
          current = 0;
        }
      });
      streaks[player.playerId] = best;
    });

    return streaks;
  }, [multiplayerInfo]);


  // ── Report submit handler ─────────────────────────────
  const handleSubmitReport = async () => {
    if (!reportReason || !reportTarget) return;
    const words = reportDescription.trim().split(/\s+/).filter(Boolean);
    if (words.length < 5) { Alert.alert('Error', 'Description must be at least 5 words.'); return; }
    if (words.length > 100) { Alert.alert('Error', 'Description must be 100 words or less.'); return; }
    const secret = useAuthStore.getState().secret;
    if (!secret) return;
    setReportSubmitting(true);
    try {
      await api.submitReport(secret, reportReason as any, reportDescription.trim(), gameId!, multiplayerInfo!.gameType, reportTarget);
      Alert.alert('Report Submitted', 'Thank you for your report. Our team will review it.');
      setReportModalVisible(false);
      setReportReason('');
      setReportDescription('');
      setReportTarget(null);
    } catch (err: any) {
      console.log('Error submitting report:', err);
      Alert.alert('Error', err?.message || 'Failed to submit report. Please try again.');
    } finally {
      setReportSubmitting(false);
    }
  };

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
      const hasGuess =
        !isCountryGuesserResult && round.guessLat != null && round.guessLong != null;
      const hideRound = activeRound !== null && activeRound !== index;

      return (
        <React.Fragment key={index}>
          {hasActual && (
            <PinMarker
              identifier={`actual-${index}`}
              coordinate={{ latitude: round.actualLat!, longitude: round.actualLong! }}
              imageSource={actualPinImage}
              opacity={hideRound ? 0 : 1}
              stopPropagation
            >
              <Callout onPress={() => openInGoogleMaps(round.actualLat!, round.actualLong!, round.panoId)}>
                <View style={styles.calloutContainer}>
                  <Text style={styles.calloutTitle}>Round {index + 1} - Actual Location</Text>
                  <Text style={[styles.calloutPoints, { color: getPointsColor(round.points) }]}>
                    {round.points.toLocaleString()} points
                  </Text>
                  {round.distance != null && (
                    <Text style={styles.calloutDistance}>
                      Distance: {formatDistance(round.distance, units)}
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
              opacity={hideRound ? 0 : 1}
              stopPropagation
            >
              <Callout>
                <View style={styles.calloutContainer}>
                  <Text style={styles.calloutTitle}>Round {index + 1} - Your Guess</Text>
                  <Text style={[styles.calloutPoints, { color: getPointsColor(round.points) }]}>
                    {round.points.toLocaleString()} points
                  </Text>
                  {round.distance != null && (
                    <Text style={styles.calloutDistance}>
                      Distance: {formatDistance(round.distance, units)}
                    </Text>
                  )}
                </View>
              </Callout>
            </PinMarker>
          )}
          {!hideRound && hasActual && hasGuess && (
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
          {!isCountryGuesserResult && hasActual && round.opponents?.map((opp) => (
            <React.Fragment key={`opp-${index}-${opp.playerId}`}>
              <PinMarker
                identifier={`opp-${index}-${opp.playerId}`}
                coordinate={{ latitude: opp.guessLat, longitude: opp.guessLong }}
                imageSource={oppPinImage}
                opacity={hideRound ? 0 : 1}
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
              {!hideRound && (
                <Polyline
                  coordinates={[
                    { latitude: round.actualLat!, longitude: round.actualLong! },
                    { latitude: opp.guessLat, longitude: opp.guessLong },
                  ]}
                  strokeColor={getPolylineColor(opp.points)}
                  strokeWidth={2}
                  lineDashPattern={[6, 4]}
                />
              )}
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
            <EloChangeDisplay
              oldElo={myEloData.before}
              newElo={myEloData.after}
              winner={multiplayerInfo.isWinner}
              draw={multiplayerInfo.isDraw}
            />
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
          {showXpEarned && (
            <View style={[styles.headerXpBadge, compact && styles.headerXpBadgeCompact]}>
              <Text style={styles.totalXpBadgeText}>+{displayXp} XP</Text>
            </View>
          )}
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
            {/* <Pressable
              onPress={handleGoHome}
              style={({ pressed }) => [
                styles.actionBtnSecondary,
                pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
              ]}
            >
              <Text style={styles.actionBtnSecondaryText}>Home</Text>
            </Pressable> */}
          </>
        )}

      </View>

      {/* Game ID + Report row */}
      {gameId && isHistoryView && (
        <View style={styles.gameMetaRow}>
          <Pressable
            onPress={handleCopyGameId}
            style={styles.gameIdBtn}
          >
            <Text style={styles.gameIdText}>ID: {gameId.slice(0, 8)}...</Text>
            <Ionicons
              name={gameIdCopied ? 'checkmark' : 'copy-outline'}
              size={12}
              color={gameIdCopied ? '#4CAF50' : 'rgba(255,255,255,0.5)'}
            />
          </Pressable>
          {multiplayerInfo && (
            <Pressable
              onPress={() => {
                // Determine report target
                const opponents = multiplayerInfo.players.filter(p => p.playerId !== multiplayerInfo.myId);
                if (opponents.length === 1) {
                  setReportTarget(opponents[0].playerId);
                  setReportModalVisible(true);
                } else if (opponents.length > 1) {
                  setReportTarget(null);
                  setReportModalVisible(true);
                }
              }}
              style={styles.reportBtn}
            >
              <Ionicons name="flag-outline" size={14} color="#F44336" />
              <Text style={styles.reportBtnText}>Report</Text>
            </Pressable>
          )}
        </View>
      )}
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
          const isSelected = selectedPlayer === player.playerId;
          const playerRounds = multiplayerInfo.roundData[player.playerId];
          return (
            <React.Fragment key={player.playerId}>
              <Pressable
                onPress={() => setSelectedPlayer(isSelected ? null : player.playerId)}
                style={[styles.roundItem, isMe && { backgroundColor: 'rgba(76, 175, 80, 0.15)' }]}
              >
                <View style={styles.roundItemHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {idx < 3 && (
                      <Ionicons name="trophy" size={16} color={trophyColors[idx]} />
                    )}
                    {player.countryCode && <CountryFlag countryCode={player.countryCode} size={14} />}
                    <Text style={[styles.roundNumber, isMe && { color: '#4CAF50' }]}>
                      #{idx + 1} {player.username}{isMe ? ' (you)' : ''}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.roundPts, { color: getPointsColor(player.totalPoints) }]}>
                      {player.totalPoints.toLocaleString()} pts
                    </Text>
                    <Ionicons
                      name={isSelected ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color="rgba(255,255,255,0.4)"
                    />
                  </View>
                </View>
              </Pressable>
              {/* Per-player round drill-down */}
              {isSelected && playerRounds && (
                <View style={styles.playerDrillDown}>
                  {playerRounds.map((pr) => (
                    <View key={pr.roundNumber} style={styles.playerDrillDownRow}>
                      <Text style={styles.playerDrillDownLabel}>Round {pr.roundNumber}</Text>
                      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                        {pr.distance != null && (
                          <Text style={styles.playerDrillDownDetail}>{formatDistance(pr.distance, units)}</Text>
                        )}
                        <Text style={[styles.playerDrillDownPts, { color: getPointsColor(pr.points) }]}>
                          {pr.points.toLocaleString()} pts
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </React.Fragment>
          );
        })}
      </View>
    );
  };

  // ── Report modal ──────────────────────────────────────────
  const renderReportModal = () => {
    const opponents = multiplayerInfo?.players.filter(p => p.playerId !== multiplayerInfo?.myId) ?? [];
    const wordCount = reportDescription.trim().split(/\s+/).filter(Boolean).length;
    return (
      <Modal visible={reportModalVisible} transparent animationType="fade" onRequestClose={() => setReportModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Report Player</Text>
            <Text style={styles.modalWarning}>
              False reports may result in action against your account.
            </Text>

            {/* Player selection (multiplayer with >1 opponent) */}
            {!reportTarget && opponents.length > 1 && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.modalLabel}>Select Player</Text>
                {opponents.map(opp => (
                  <Pressable
                    key={opp.playerId}
                    onPress={() => setReportTarget(opp.playerId)}
                    style={[styles.reasonOption, reportTarget === opp.playerId && styles.reasonOptionActive]}
                  >
                    <Text style={styles.reasonOptionText}>{opp.username}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* Reason selection */}
            <Text style={styles.modalLabel}>Reason</Text>
            <View style={{ gap: 6, marginBottom: 12 }}>
              {([
                ['inappropriate_username', 'Inappropriate Username'],
                ['cheating', 'Cheating'],
                ['other', 'Other'],
              ] as const).map(([value, label]) => (
                <Pressable
                  key={value}
                  onPress={() => setReportReason(value)}
                  style={[styles.reasonOption, reportReason === value && styles.reasonOptionActive]}
                >
                  <Text style={[styles.reasonOptionText, reportReason === value && { color: '#fff' }]}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {/* Description */}
            <Text style={styles.modalLabel}>Description (5-100 words)</Text>
            <TextInput
              style={styles.reportInput}
              multiline
              numberOfLines={4}
              placeholder="Describe the issue..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={reportDescription}
              onChangeText={setReportDescription}
              textAlignVertical="top"
            />
            <Text style={styles.wordCount}>{wordCount}/100 words</Text>

            {/* Buttons */}
            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => { setReportModalVisible(false); setReportReason(''); setReportDescription(''); setReportTarget(null); }}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmitReport}
                disabled={reportSubmitting || !reportReason || !reportTarget || wordCount < 5}
                style={[styles.modalSubmitBtn, (reportSubmitting || !reportReason || !reportTarget || wordCount < 5) && { opacity: 0.5 }]}
              >
                <Text style={styles.modalSubmitText}>{reportSubmitting ? 'Submitting...' : 'Submit'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  };
  const renderBackButton = () => (
    <Pressable
      style={({ pressed }) => [
        styles.backButton,
        pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] },
      ]}
      onPress={handleBackPress}
    >
      <LinearGradient
        colors={['rgba(156,82,39,0.9)', 'rgba(91,29,29,0.9)', 'rgba(255,112,112,0.9)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.backButtonGradient}
      >
        <Ionicons name="arrow-back" size={22} color={colors.white} />
      </LinearGradient>
    </Pressable>
  );

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
                <Text style={[styles.roundPts, { color: getPointsColor(round.points) }]}>
                  {round.points.toLocaleString()} pts
                </Text>
              </View>

              {/* Duel: side-by-side comparison */}
              {multiplayerInfo?.isDuel && duelOpp ? (
                <View style={styles.duelRoundRow}>
                  <View style={styles.duelPlayerCol}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {useAuthStore.getState().user?.countryCode && (
                        <CountryFlag countryCode={useAuthStore.getState().user!.countryCode!} size={12} />
                      )}
                      <Text style={styles.duelPlayerName}>You</Text>
                    </View>
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {duelOpp.countryCode && <CountryFlag countryCode={duelOpp.countryCode} size={12} />}
                      <Text style={styles.duelPlayerName}>{duelOpp.username}</Text>
                    </View>
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
                null
              )}

              {/* Detail rows — shown for non-duel types only */}
              {!multiplayerInfo?.isDuel && (
                <View style={styles.roundDetails}>
                  {round.distance != null && round.distance > 0 && (
                    <View style={styles.detailRow}>
                      <View style={styles.detailLabel}>
                        <Text style={styles.detailIcon}>📏</Text>
                        <Text style={styles.detailText}>Distance</Text>
                      </View>
                      <Text style={styles.detailValue}>{formatDistance(round.distance, units)}</Text>
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
                  {round.xpEarned != null && round.xpEarned > 0 && (
                    <View style={styles.detailRow}>
                      <View style={styles.detailLabel}>
                        <Text style={styles.detailIcon}>⭐</Text>
                        <Text style={styles.detailText}>XP</Text>
                      </View>
                      <Text style={[styles.detailValue, { color: '#FFC107' }]}>+{round.xpEarned}</Text>
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
            <EmbeddedMap
              route="results"
              style={StyleSheet.absoluteFillObject}
              rounds={resultsRounds}
              activeRound={activeRound}
              isDuel={!!multiplayerInfo?.isDuel}
            />
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
        <View style={[styles.backButtonContainer, { paddingTop: insets.top + spacing.sm }]}>
          {renderBackButton()}
        </View>
        {renderReportModal()}
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
      <EmbeddedMap
        route="results"
        style={StyleSheet.absoluteFillObject}
        rounds={resultsRounds}
        activeRound={activeRound}
        isDuel={!!multiplayerInfo?.isDuel}
      />
      <View style={[styles.backButtonContainer, { paddingTop: insets.top + spacing.sm }]}>
        {renderBackButton()}
      </View>

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
      {renderReportModal()}
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
  backButtonContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 2000,
    paddingLeft: spacing.lg,
    paddingTop: spacing.sm,
  },
  backButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  backButtonGradient: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.4,
    borderColor: '#85200c',
  },

  // ── Header section (stars, score, buttons) ─────────────────
  header: {
    position: 'relative',
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
  headerXpBadge: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 193, 7, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 193, 7, 0.35)',
  },
  headerXpBadgeCompact: {
    top: spacing.sm,
    right: spacing.md,
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
  totalXpBadgeText: {
    color: '#FFC107',
    fontSize: fontSizes.xs,
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
  // Game meta row (game ID + report)
  gameMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  gameIdBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gameIdText: {
    fontSize: 11,
    fontFamily: 'Lexend',
    color: 'rgba(255,255,255,0.4)',
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(244,67,54,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(244,67,54,0.2)',
  },
  reportBtnText: {
    fontSize: 11,
    fontFamily: 'Lexend-Medium',
    color: '#F44336',
  },
  // Player drill-down
  playerDrillDown: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.15)',
    marginLeft: 16,
    paddingLeft: 12,
    paddingVertical: 4,
    marginBottom: 4,
  },
  playerDrillDownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  playerDrillDownLabel: {
    fontSize: 12,
    fontFamily: 'Lexend',
    color: 'rgba(255,255,255,0.6)',
  },
  playerDrillDownDetail: {
    fontSize: 12,
    fontFamily: 'Lexend',
    color: 'rgba(255,255,255,0.5)',
  },
  playerDrillDownPts: {
    fontSize: 12,
    fontFamily: 'Lexend-SemiBold',
  },
  // Report modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#1a2a1a',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Lexend-Bold',
    color: '#fff',
    marginBottom: 8,
  },
  modalWarning: {
    fontSize: 12,
    fontFamily: 'Lexend',
    color: '#FFC107',
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 13,
    fontFamily: 'Lexend-Medium',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 6,
  },
  reasonOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  reasonOptionActive: {
    backgroundColor: 'rgba(76, 175, 80, 0.3)',
    borderColor: '#4CAF50',
  },
  reasonOptionText: {
    fontSize: 13,
    fontFamily: 'Lexend',
    color: 'rgba(255,255,255,0.7)',
  },
  reportInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    color: '#fff',
    fontFamily: 'Lexend',
    fontSize: 13,
    padding: 10,
    minHeight: 80,
    marginTop: 4,
  },
  wordCount: {
    fontSize: 11,
    fontFamily: 'Lexend',
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    fontFamily: 'Lexend-Medium',
    color: 'rgba(255,255,255,0.7)',
  },
  modalSubmitBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F44336',
    alignItems: 'center',
  },
  modalSubmitText: {
    fontSize: 14,
    fontFamily: 'Lexend-Medium',
    color: '#fff',
  },
});
