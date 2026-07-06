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
  BackHandler,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import EmbeddedMap from '../../src/components/game/EmbeddedMap';
import { colors, formatDistance, t } from '../../src/shared';
import { useSettingsStore } from '../../src/store/settingsStore';
import { findDistance } from '../../src/shared/game/calcPoints';
import { api } from '../../src/services/api';
import { haptics, hapticForScore } from '../../src/services/haptics';
import { useAuthStore } from '../../src/store/authStore';
import { useMultiplayerStore } from '../../src/store/multiplayerStore';
import { dismissAllSafe } from '../../src/utils/navigation';
import { maybeShowGameInterstitial, runGameInterstitial } from '../../src/services/ads';
import PlayerName from '../../src/components/PlayerName';
import EloChangeDisplay from '../../src/components/multiplayer/EloChangeDisplay';
import EmoteReactions from '../../src/components/multiplayer/EmoteReactions';
import BackButton from '../../src/components/ui/BackButton';
import ReviewPromptModal from '../../src/components/ReviewPromptModal';
import { useReviewPrompt } from '../../src/hooks/useReviewPrompt';

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
  timeElapsedMs?: number;
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


// Same thresholds as web's getPointsColor (3000/1500) so the points text
// colour stays consistent with the embedded results map across platforms.
function getPointsColor(points: number): string {
  if (points >= 3000) return '#4CAF50';
  if (points >= 1500) return '#FFC107';
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
    public: publicParam,
    map: mapParam,
    mapName: mapNameParam,
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
    public?: string;
    map?: string;
    mapName?: string;
  }>();

  const isHistoryView = fromHistory === 'true';
  const isLiveMultiplayer = mpParam === 'true';
  const secret = useAuthStore((s) => s.secret);

  // Rate-us prompt: this screen mounts once per finished game, so mounting is the
  // completion signal. Count every game EXCEPT private parties (and never history
  // replays). A live MP game is a private party when it's neither a duel nor a
  // public/matchmade game — derivable straight from the route params.
  const isDuelGame = !!duelEndParam || duelParam === 'true';
  const isPrivateParty = isLiveMultiplayer && !isDuelGame && publicParam !== 'true';
  const review = useReviewPrompt(!isHistoryView && !isPrivateParty);

  // Party play-again (B14): a private-party HOST resets the shared lobby instead
  // of going home. Narrow primitive selectors avoid broad re-renders. gameData
  // persists into results for parties (server keeps state='end' ~2h), so host/
  // state stay readable here.
  const mpHost = useMultiplayerStore((s) => s.gameData?.host);
  const mpState = useMultiplayerStore((s) => s.gameData?.state);
  const isPartyHost = isPrivateParty && !!mpHost;

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
        if (!secret) { setHistoryError(t('notAuthenticated', undefined, 'Not authenticated')); setHistoryLoading(false); return; }
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
        setHistoryError(t('errorLoadingGame'));
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
        timeElapsedMs: typeof duelEnd?.timeElapsed === 'number' ? duelEnd.timeElapsed : undefined,
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
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const units = useSettingsStore((s) => s.units);
  const mapType = useSettingsStore((s) => s.mapType);
  const language = useSettingsStore((s) => s.language);
  const emotesEnabled = useSettingsStore((s) => s.multiplayerEmotesEnabled);

  const isLandscape = width > height;

  // Web keeps the emote sender mounted through `state === 'end'` (home.js, flipped to
  // `rightSide`), so it stays usable on the summary. Mobile splits results into this
  // separate route, so we re-mount it here for LIVE multiplayer only — never for
  // singleplayer or history replays (no live game / WS room to send into). `sendEmote`
  // is WS-only (no in-game guard) and useWebSocket keeps the socket alive on /game/results.
  const showEmotes = isLiveMultiplayer && !isHistoryView && emotesEnabled;

  const openInGoogleMaps = useCallback((lat: number, lng: number, panoId?: string) => {
    haptics.light();
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
    }).start(({ finished }) => {
      // Score-graded celebration once the headline total lands. Normalize the
      // multi-round total to the per-guess 0–5000 scale (average per round) so
      // it maps onto the same intensity tiers as a single guess.
      if (finished && score > 0) {
        hapticForScore(score / Math.max(1, parsedRounds.length));
      }
    });

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

  const handleRoundPress = useCallback((index: number) => {
    // Toggle round focus. The embedded results map watches `activeRound` and
    // does its own camera fit/zoom, so there's nothing to drive from here.
    setActiveRound((prev) => (prev === index ? null : index));
  }, []);

  const toggleDetails = useCallback(() => {
    haptics.light();
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
    haptics.medium();
    if (isLiveMultiplayer) {
      // Party host (B14): web parity (home.js backBtnPressed → resetGame for a
      // non-'waiting' host). Tell the server to reset the shared party back to
      // the lobby; do NOT navigate here — the host-gated effect dismisses this
      // route once state flips to 'waiting' (so the finished scene never flashes).
      if (isPartyHost) {
        useMultiplayerStore.getState().resetGame();
        return;
      }
      // Mirror web's backBtnPressed(true, type): leave the finished game, then
      // re-queue into the SAME public queue. Only public games (ranked duels +
      // unranked public multiplayer) have a queue to rejoin; private/party games
      // have none, so for those we just go home.
      const isDuel = !!multiplayerInfo?.isDuel;
      const isPublic = publicParam === 'true' || isDuel; // duels are always public

      useMultiplayerStore.getState().leaveGame();

      if (isPublic) {
        // Hand off to home.tsx's re-queue effect (the single owner of "→ /queue"):
        // it reads nextGameQueued/nextGameType and fires the right publicDuel/
        // unrankedDuel for us. Arm it only AFTER the interstitial is dismissed,
        // so we don't re-enter the queue (and get matched) behind the ad.
        runGameInterstitial(isDuel ? 'rankedDuel' : 'unrankedDuel').then(() => {
          useMultiplayerStore.setState({
            nextGameQueued: true,
            nextGameType: isDuel ? 'ranked' : 'unranked',
          });
        });
      }
      dismissAllSafe();
      return;
    }
    // Play Again restarts the SAME singleplayer game the player just finished —
    // preserving the map they chose (world, a country, or a community map)
    // instead of resetting to the world map. Country-guesser modes always run on
    // map 'all' (the submode drives them). Singleplayer is ad-eligible in every
    // case, so the interstitial gating is unchanged.
    maybeShowGameInterstitial('singleplayer');
    const replayMap = isCountryGuesserResult ? 'all' : (mapParam || 'all');
    router.replace({
      pathname: '/game/[id]',
      params: {
        id: 'singleplayer',
        map: replayMap,
        ...(replayMap !== 'all' && mapNameParam ? { mapName: mapNameParam } : {}),
        rounds: isCountryGuesserResult ? '10' : '5',
        time: '60',
        mode: mode || 'world',
      },
    });
  };

  // Party play-again (B14): once the host's resetGame lands and the server flips
  // the shared game back to 'waiting', game/[id] underneath has already swapped
  // to the MultiplayerLobby (TransitionCurtain masks it). Pop THIS results route
  // (one level — never dismissAllSafe, which would go home) so the 300ms 'fade'
  // crossfades results→lobby on the shared backdrop. Ref-guarded against double
  // dismiss; host-gated so non-hosts keep their current behavior.
  const partyLobbyDismissed = useRef(false);
  useEffect(() => {
    if (!isPartyHost) return;
    if (mpState === 'waiting' && !partyLobbyDismissed.current) {
      partyLobbyDismissed.current = true;
      router.canGoBack() ? router.back() : dismissAllSafe();
    }
  }, [isPartyHost, mpState, router]);

  const handleGoHome = useCallback(() => {
    // No haptic here: the back button taps fire it via the shared BackButton, and
    // the standalone Home CTA fires it inline — keeping it out avoids a double buzz.
    if (isLiveMultiplayer) {
      // Tell the SERVER we're leaving — not just reset() local state. Web parity:
      // backBtnPressed (home.js) sends `{type:'leaveGame'}` here. When a game ends
      // naturally the server keeps it in 'end' state (lingering ~2h) and KEEPS our
      // player.gameId pointing at it — it never auto-frees us. Every "start a game"
      // handler (publicDuel / unrankedDuel / createPrivateGame / joinPrivateGame) is
      // gated on `!player.gameId`, so until the server hears `leaveGame` it silently
      // drops every re-queue. The socket stays open (we still receive `t`/state), so
      // the client looks connected while none of its inputs take effect — the exact
      // "finished a game, now multiplayer is dead until I force-restart" bug. A bare
      // reset() only cleared local state and left the server-side gameId stuck.
      // leaveGame() sends `{type:'leaveGame'}` then runs reset(), so the local teardown
      // is unchanged; we just no longer skip telling the server. (No-op server-side if
      // the game is already gone — the handler guards on games.has(player.gameId).)
      useMultiplayerStore.getState().leaveGame();
    }
    dismissAllSafe();
  }, [isLiveMultiplayer]);
  const handleBackPress = useCallback(() => {
    if (isHistoryView) {
      router.back();
      return;
    }
    handleGoHome();
  }, [isHistoryView, router, handleGoHome]);

  // Android hardware-back / edge-swipe MUST exit to home (or pop, in history view),
  // exactly like the visible X button. Without this, the system back pops only this
  // results route and drops the player onto the finished game/[id] screen that's
  // still mounted underneath — frozen on its final answer reveal / between-rounds
  // leaderboard / full-screen map ("the glitched game page"). Returning true swallows
  // the default one-level pop so that ghost screen is never exposed. Android-only API;
  // a no-op subscription on iOS.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBackPress();
      return true;
    });
    return () => sub.remove();
  }, [handleBackPress]);

  const handleCopyGameId = useCallback(async () => {
    if (!gameId) return;
    haptics.light();
    await Clipboard.setStringAsync(gameId);
    haptics.success();
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
    if (words.length < 5) { Alert.alert(t('error'), t('reportDescriptionMinWords', undefined, 'Description must be at least 5 words.')); return; }
    if (words.length > 100) { Alert.alert(t('error'), t('reportDescriptionMaxWords', undefined, 'Description must be 100 words or less.')); return; }
    const secret = useAuthStore.getState().secret;
    if (!secret) return;
    setReportSubmitting(true);
    try {
      await api.submitReport(secret, reportReason as any, reportDescription.trim(), gameId!, multiplayerInfo!.gameType, reportTarget);
      Alert.alert(t('reportSubmittedTitle', undefined, 'Report Submitted'), t('reportSubmittedMessage', undefined, 'Thank you for your report. Our team will review it.'));
      setReportModalVisible(false);
      setReportReason('');
      setReportDescription('');
      setReportTarget(null);
    } catch (err: any) {
      console.log('Error submitting report:', err);
      Alert.alert(t('error'), err?.message || t('reportSubmitFailed', undefined, 'Failed to submit report. Please try again.'));
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
          {t('loadingGameDetails')}
        </Text>
      </View>
    );
  }
  if (historyError) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: '#F44336', fontSize: 16, fontFamily: 'Lexend' }}>{historyError}</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: '#4CAF50', fontFamily: 'Lexend-SemiBold' }}>{t('back')}</Text>
        </Pressable>
      </View>
    );
  }

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
            {t(multiplayerInfo.isDraw ? 'draw' : multiplayerInfo.isWinner ? 'victory' : 'defeat')}
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
              <Text style={styles.totalXpBadgeText}>{t('xpEarnedBadge', { xp: displayXp })}</Text>
            </View>
          )}
          {/* Multiplayer rank */}
          {myRank && (
            <Text style={[styles.rankText, compact && { fontSize: 14 }]}>
              {t('rankOfTotalSlash', { rank: myRank.rank, total: myRank.total })}
            </Text>
          )}
        </>
      )}

      {/* Score — singleplayer + non-duel multiplayer only. Web's duel header
          shows just title + ELO + time (no "out of N points"), so hide it for
          duels to match. */}
      {!multiplayerInfo?.isDuel && (
        <>
          <Text style={[styles.scoreValue, compact && { fontSize: 30 }]}>
            {displayScore.toLocaleString()}
          </Text>
          <Text style={[styles.scoreSubtitle, compact && { fontSize: 11, marginBottom: 4 }]}>
            {t('outOfPoints', { maxScore: maxScore.toLocaleString() })}
          </Text>
        </>
      )}

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
              {t(detailsExpanded ? 'hideDetails' : 'viewDetails')}
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
            onPress={() => {
              haptics.light();
              router.back();
            }}
            style={({ pressed }) => [pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
          >
            <LinearGradient
              colors={['#4CAF50', '#45a049']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.actionBtnPrimary}
            >
              <Ionicons name="close" size={16} color={colors.white} />
              <Text style={styles.actionBtnPrimaryText}>{t('back')}</Text>
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
                <Text style={styles.actionBtnPrimaryText}>
                  {isPartyHost ? t('backToLobby') : t('playAgain')}
                </Text>
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
            <Text style={styles.gameIdText}>{t('gameIdShort', { id: gameId.slice(0, 8) })}</Text>
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
              <Text style={styles.reportBtnText}>{t('report', undefined, 'Report')}</Text>
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
          <Text style={styles.roundsHeaderText}>{t('finalScores')}</Text>
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 }}>
                    {idx < 3 && (
                      <Ionicons name="trophy" size={16} color={trophyColors[idx]} />
                    )}
                    <PlayerName
                      name={`${t('leaderboardPlayerRank', { rank: idx + 1, username: player.username })}${isMe ? ` (${t('you')})` : ''}`}
                      countryCode={player.countryCode}
                      flagSize={14}
                      gap={8}
                      textStyle={[styles.roundNumber, isMe && { color: '#4CAF50' }]}
                    />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.roundPts, { color: getPointsColor(player.totalPoints) }]}>
                      {t('ptsCount', { points: player.totalPoints.toLocaleString() })}
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
                      <Text style={styles.playerDrillDownLabel}>{t('roundNumber', { round: pr.roundNumber })}</Text>
                      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                        {pr.distance != null && (
                          <Text style={styles.playerDrillDownDetail}>{formatDistance(pr.distance, units)}</Text>
                        )}
                        <Text style={[styles.playerDrillDownPts, { color: getPointsColor(pr.points) }]}>
                          {t('ptsCount', { points: pr.points.toLocaleString() })}
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
      <Modal visible={reportModalVisible} transparent animationType="fade" onRequestClose={() => setReportModalVisible(false)} supportedOrientations={['portrait', 'landscape']}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('reportPlayer', undefined, 'Report Player')}</Text>
            <Text style={styles.modalWarning}>
              {t('reportFalseWarning', undefined, 'False reports may result in action against your account.')}
            </Text>

            {/* Player selection (multiplayer with >1 opponent) */}
            {!reportTarget && opponents.length > 1 && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.modalLabel}>{t('selectPlayer', undefined, 'Select Player')}</Text>
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
            <Text style={styles.modalLabel}>{t('reason')}</Text>
            <View style={{ gap: 6, marginBottom: 12 }}>
              {([
                ['inappropriate_username', t('reportReasonInappropriateUsername')],
                ['cheating', t('reportReasonCheating')],
                ['other', t('reportReasonOther')],
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
            <Text style={styles.modalLabel}>{t('reportDescriptionLabel', undefined, 'Description (5-100 words)')}</Text>
            <TextInput
              style={styles.reportInput}
              multiline
              numberOfLines={4}
              placeholder={t('reportDescriptionPlaceholder', undefined, 'Describe the issue...')}
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={reportDescription}
              onChangeText={setReportDescription}
              textAlignVertical="top"
            />
            <Text style={styles.wordCount}>{t('wordCountOfMax', { count: wordCount })}</Text>

            {/* Buttons */}
            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => { setReportModalVisible(false); setReportReason(''); setReportDescription(''); setReportTarget(null); }}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>{t('cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmitReport}
                disabled={reportSubmitting || !reportReason || !reportTarget || wordCount < 5}
                style={[styles.modalSubmitBtn, (reportSubmitting || !reportReason || !reportTarget || wordCount < 5) && { opacity: 0.5 }]}
              >
                <Text style={styles.modalSubmitText}>{t(reportSubmitting ? 'submitting' : 'submit', undefined, reportSubmitting ? 'Submitting...' : 'Submit')}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  };
  const renderBackButton = () => <BackButton onPress={handleBackPress} />;

  // ── Rounds list ────────────────────────────────────────────
  const renderRoundsList = () => (
    <>
      {/* Multiplayer leaderboard */}
      {renderLeaderboard()}

      <View style={styles.roundsHeader}>
        <Text style={styles.roundsHeaderText}>{t('roundDetails')}</Text>
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
                <Text style={styles.roundNumber}>{t('roundNumber', { round: index + 1 })}</Text>
                {/* Duel: time + Street View button on the right (web parity:
                    roundOverScreen.js duel round-header). Non-duel keeps points. */}
                {multiplayerInfo?.isDuel ? (
                  <View style={styles.roundHeaderRight}>
                    {round.timeTaken != null && round.timeTaken > 0 && (
                      <Text style={styles.roundTimeText}>⏱️ {formatTime(round.timeTaken)}</Text>
                    )}
                    {round.actualLat != null && round.actualLong != null && (
                      <Pressable
                        onPress={() => openInGoogleMaps(round.actualLat!, round.actualLong!, round.panoId)}
                        style={({ pressed }) => [
                          styles.gmapsButton,
                          pressed && { backgroundColor: 'rgba(255, 255, 255, 0.2)' },
                        ]}
                        hitSlop={8}
                        accessibilityLabel={t('openInMaps')}
                      >
                        <Text style={styles.gmapsIcon}>📍</Text>
                      </Pressable>
                    )}
                  </View>
                ) : (
                  <Text style={[styles.roundPts, { color: getPointsColor(round.points) }]}>
                    {t('ptsCount', { points: round.points.toLocaleString() })}
                  </Text>
                )}
              </View>

              {/* Duel: side-by-side comparison */}
              {multiplayerInfo?.isDuel && duelOpp ? (
                <View style={styles.duelRoundRow}>
                  <View style={styles.duelPlayerCol}>
                    <PlayerName
                      name={t('you')}
                      countryCode={useAuthStore.getState().user?.countryCode}
                      flagSize={12}
                      gap={4}
                      textStyle={styles.duelPlayerName}
                    />
                    {round.didGuess ? (
                      <Text style={[styles.duelPlayerScore, { color: getPointsColor(round.points) }]}>
                        {t('ptsCount', { points: round.points })}
                      </Text>
                    ) : (
                      <Text style={[styles.duelPlayerScore, { color: 'rgba(255,255,255,0.4)' }]}>
                        {t('noGuess', undefined, 'No guess')}
                      </Text>
                    )}
                    {round.didGuess && duelOpp.didGuess && round.points < duelOpp.points && (
                      <Text style={styles.healthDamage}>
                        {t('duelHealthDamage', { damage: duelOpp.points - round.points }, '-{{damage}} ❤️')}
                      </Text>
                    )}
                  </View>

                  <Text style={styles.vsDivider}>{t('versus', undefined, 'VS')}</Text>

                  <View style={styles.duelPlayerCol}>
                    <PlayerName
                      name={duelOpp.username}
                      countryCode={duelOpp.countryCode}
                      flagSize={12}
                      gap={4}
                      textStyle={styles.duelPlayerName}
                    />
                    {duelOpp.didGuess ? (
                      <Text style={[styles.duelPlayerScore, { color: getPointsColor(duelOpp.points) }]}>
                        {t('ptsCount', { points: duelOpp.points })}
                      </Text>
                    ) : (
                      <Text style={[styles.duelPlayerScore, { color: 'rgba(255,255,255,0.4)' }]}>
                        {t('noGuess', undefined, 'No guess')}
                      </Text>
                    )}
                    {round.didGuess && duelOpp.didGuess && duelOpp.points < round.points && (
                      <Text style={styles.healthDamage}>
                        {t('duelHealthDamage', { damage: round.points - duelOpp.points }, '-{{damage}} ❤️')}
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
                        <Text style={styles.detailText}>{t('distance')}</Text>
                      </View>
                      <Text style={styles.detailValue}>{formatDistance(round.distance, units)}</Text>
                    </View>
                  )}
                  {round.timeTaken != null && round.timeTaken > 0 && (
                    <View style={styles.detailRow}>
                      <View style={styles.detailLabel}>
                        <Text style={styles.detailIcon}>⏱️</Text>
                        <Text style={styles.detailText}>{t('timeTaken')}</Text>
                      </View>
                      <Text style={styles.detailValue}>{formatTime(round.timeTaken)}</Text>
                    </View>
                  )}
                  {round.xpEarned != null && round.xpEarned > 0 && (
                    <View style={styles.detailRow}>
                      <View style={styles.detailLabel}>
                        <Text style={styles.detailIcon}>⭐</Text>
                        <Text style={styles.detailText}>{t('xp')}</Text>
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
              mapType={mapType}
              lang={language}
              onOpenMaps={({ lat, lng, panoId }) => openInGoogleMaps(lat, lng, panoId)}
              style={StyleSheet.absoluteFillObject}
              rounds={resultsRounds}
              activeRound={activeRound}
              isDuel={!!multiplayerInfo?.isDuel}
              selectedPlayer={selectedPlayer}
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
        {/* Emote sender — bottom-left of the map area; the sidebar owns the right edge. */}
        {showEmotes && <EmoteReactions hideName={isDuelGame} />}
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
        mapType={mapType}
        lang={language}
        onOpenMaps={({ lat, lng, panoId }) => openInGoogleMaps(lat, lng, panoId)}
        style={StyleSheet.absoluteFillObject}
        rounds={resultsRounds}
        activeRound={activeRound}
        isDuel={!!multiplayerInfo?.isDuel}
        selectedPlayer={selectedPlayer}
      />
      <View style={[styles.backButtonContainer, { paddingTop: insets.top + spacing.sm }]}>
        {renderBackButton()}
      </View>

      {/* Emote sender — lifted above the collapsed summary panel so it sits in the map
          area; reactions rise into the map. Hidden while details are expanded (the panel
          grows up over this corner), via the component's own fade-out. */}
      {showEmotes && (
        <EmoteReactions
          bottomOffset={collapsedHeight}
          hidden={detailsExpanded}
          hideName={isDuelGame}
        />
      )}

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
      <ReviewPromptModal
        visible={review.visible}
        onRate={review.onRate}
        onDismiss={review.onDismiss}
      />
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
  roundHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Web shows the time using `.round-points` (bold white) — mirror it.
  roundTimeText: {
    fontSize: fontSizes.md,
    fontFamily: 'Lexend-Bold',
    color: colors.white,
  },
  // Matches web roundOverScreen.js `.gmaps-icon` inline style exactly.
  gmapsButton: {
    width: 20,
    height: 20,
    borderRadius: 3,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  gmapsIcon: {
    fontSize: 12,
    lineHeight: 16,
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
    // Match roundItem's 20px right inset so the breakdown's points column
    // doesn't run to the card edge (it has no paddingRight otherwise).
    paddingRight: 20,
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
