import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  Animated,
  Easing,
  Platform,
  Modal,
  Alert,
  InteractionManager,
} from 'react-native';
import Reanimated, {
  FadeInDown,
  ReduceMotion,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, calcPoints, findDistance, getPlayerColor } from '../../src/shared';
import { spacing, fontSizes, borderRadius } from '../../src/styles/theme';
import { api } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';
import { useMultiplayerStore, type GameData, type MPPlayer, type RoundHistoryEntry } from '../../src/store/multiplayerStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { wsService } from '../../src/services/websocket';
import { dismissAllSafe } from '../../src/utils/navigation';

import StreetViewWebView from '../../src/components/game/StreetViewWebView';
import EmbeddedMap from '../../src/components/game/EmbeddedMap';
import GameSurface, { GameSurfaceHandle } from '../../src/components/game/GameSurface';
import ConfettiBurst from '../../src/components/onboarding/ConfettiBurst';
import { hintCircle } from '@shared/game/hint';
import GameLoadingOverlay from '../../src/components/game/GameLoadingOverlay';
import GameTimer from '../../src/components/game/GameTimer';
import MapSelectorModal from '../../src/components/game/MapSelectorModal';
import CountryEndBanner from '../../src/components/game/CountryEndBanner';
import ClassicEndBanner from '../../src/components/game/ClassicEndBanner';
import GetReadyOverlay from '../../src/components/multiplayer/GetReadyOverlay';
import DuelHUD from '../../src/components/multiplayer/DuelHUD';
import PlayerList from '../../src/components/multiplayer/PlayerList';
import EmoteReactions from '../../src/components/multiplayer/EmoteReactions';
import MultiplayerLobby from '../../src/components/multiplayer/MultiplayerLobby';
import TransitionCurtain from '../../src/components/TransitionCurtain';
import RevealView from '../../src/components/RevealView';
import BackButton from '../../src/components/ui/BackButton';
import { localeString, t } from '../../src/shared';
import {
  CountryGuesserSubMode,
  COUNTRY_GUESSER_TOTAL_ROUNDS,
  SINGLEPLAYER_DEFAULT_MODE_KEY,
  defaultModeValueForSubMode,
  subModeFromDefaultMode,
} from '../../src/hooks/useCountryGuesserGame';
import useCountryGuesserGame from '../../src/hooks/useCountryGuesserGame';
import { continentFromCode, countryCenterFromCode } from '../../src/shared/data/countryHelpers';
// Fetched at runtime from hosted URL (can't import from public/ in RN)
let officialCountryMapsCache: any[] | null = null;
async function getOfficialCountryMaps(): Promise<any[]> {
  if (officialCountryMapsCache) return officialCountryMapsCache;
  try {
    const res = await fetch('https://worldguessr.com/officialCountryMaps.json');
    officialCountryMapsCache = await res.json();
  } catch {
    officialCountryMapsCache = [];
  }
  return officialCountryMapsCache!;
}

let countryMaxDistsCache: Record<string, number> | null = null;
async function getCountryMaxDists(): Promise<Record<string, number>> {
  if (countryMaxDistsCache) return countryMaxDistsCache;
  try {
    const res = await fetch('https://worldguessr.com/countryMaxDists.json');
    countryMaxDistsCache = await res.json();
  } catch {
    countryMaxDistsCache = {};
  }
  return countryMaxDistsCache!;
}

interface Location {
  lat: number;
  long: number;
  country?: string;
  panoId?: string;
  heading?: number;
  head?: number;
  pitch?: number;
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

// extent = [west, south, east, north] i.e. [minLng, minLat, maxLng, maxLat]
type Extent = [number, number, number, number] | null;

interface GameState {
  currentRound: number;
  totalRounds: number;
  locations: Location[];
  guesses: RoundResult[];
  totalScore: number;
  isShowingResult: boolean;
  timePerRound: number;
  maxDist: number;
  extent: Extent;
}

const DEFAULT_GAME_OPTIONS = {
  totalRounds: 5,
  timePerRound: 60,
  location: 'all',
  maxDist: 20000,
};

/** Fraction of screen height the expanded minimap occupies during gameplay (0–1) */
const EXPANDED_MAP_HEIGHT_RATIO = 0.5;
const EXPANDED_MAP_LANDSCAPE_HEIGHT_RATIO = 0.6;

interface PlayerGuessMarker {
  id: string;
  lat: number;
  lng: number;
  username: string;
  points?: number;
  color: string;
}

function findRoundHistory(roundHistory: RoundHistoryEntry[] | undefined, roundNumber: number): RoundHistoryEntry | undefined {
  if (!roundHistory || roundNumber < 1) return undefined;
  return roundHistory.find((entry) => entry.round === roundNumber)
    ?? roundHistory[roundNumber - 1]
    ?? roundHistory[roundHistory.length - 1];
}

function buildHistoryPlayerGuesses(history: RoundHistoryEntry | undefined): PlayerGuessMarker[] {
  if (!history) return [];

  return Object.entries(history.players)
    .filter(([, player]) => player.lat != null && player.long != null)
    .map(([playerId, player]) => ({
      id: playerId,
      lat: player.lat!,
      lng: player.long!,
      username: player.username,
      points: player.points,
      color: getPlayerColor(playerId),
    }));
}

function buildCurrentPlayerGuesses(players: MPPlayer[], actualLocation: Location | undefined, maxDist: number): PlayerGuessMarker[] {
  return players
    .filter((player) => player.latLong && player.latLong[0] !== 0)
    .map((player) => ({
      id: player.id,
      lat: player.latLong![0],
      lng: player.latLong![1],
      username: player.username,
      points: actualLocation
        ? calcPoints({
            lat: actualLocation.lat,
            lon: actualLocation.long,
            guessLat: player.latLong![0],
            guessLon: player.latLong![1],
            maxDist,
          })
        : undefined,
      color: getPlayerColor(player.id),
    }));
}

function useGameStartingCountdown(nextEvtTime: number | undefined, timeOffset: number, enabled: boolean): number {
  const [countdown, setCountdown] = useState(0);
  useEffect(() => {
    if (!enabled || nextEvtTime == null) {
      setCountdown(0);
      return;
    }
    const update = () => {
      // Match web (gameUI.js): floor to tenths so the value never rounds up
      // past the true remaining time, and show 0.1s markers.
      setCountdown(Math.max(0, Math.floor((nextEvtTime - Date.now() - timeOffset) / 100) / 10));
    };
    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [nextEvtTime, timeOffset, enabled]);
  return countdown;
}

function BetweenRoundsLeaderboard({
  gameData,
  timeOffset,
}: {
  gameData: GameData;
  timeOffset: number;
}) {
  // The view stays mounted for the whole between-rounds getready at opacity 0,
  // then fades the dark leaderboard in over the last ~5s and back out before the
  // next round. We drive a PERSISTENT view's opacity with RN Animated (whose
  // value is read synchronously at render) instead of mounting a Reanimated.View
  // with useAnimatedStyle — that mounted one frame at the base style's opacity
  // (1) before the animated style applied, which read as an instant flash-in.
  const opacity = useRef(new Animated.Value(0)).current;
  const shownRef = useRef(false);

  useEffect(() => {
    const tick = () => {
      const msLeft = gameData.nextEvtTime - Date.now() - timeOffset;
      // Visible from the last 5s down to ~0.6s left; the trailing margin lets the
      // fade-out finish before the parent unmounts this at the guess phase.
      const show = msLeft > 600 && msLeft < 5000;
      if (show === shownRef.current) return;
      shownRef.current = show;
      Animated.timing(opacity, {
        toValue: show ? 0.92 : 0,
        duration: show ? 500 : 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    };
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [gameData.nextEvtTime, timeOffset, opacity]);

  return (
    <Animated.View
      style={[styles.betweenRoundsOverlay, { opacity }]}
      pointerEvents="none"
    >
      <SafeAreaView style={styles.betweenRoundsInner} edges={['top', 'bottom']}>
        <Text style={styles.betweenRoundsTitle}>{t('leaderboard')}</Text>
        <View style={styles.betweenRoundsListWrap}>
          <PlayerList
            players={gameData.players}
            myId={gameData.myId}
            mode="betweenRounds"
          />
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

function DuelWarningModal({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.warningModalOverlay} onPress={onDismiss}>
        <View style={styles.warningModalCard}>
          <Ionicons name="warning" size={26} color={colors.warning} />
          <Text style={styles.warningModalTitle}>{t('fairPlayWarning', undefined, 'Fair Play Warning')}</Text>
          <Text style={styles.warningModalText}>
            {localeString('duelWarningText')}
          </Text>
        </View>
      </Pressable>
    </Modal>
  );
}

export default function GameScreen() {
  const { id, map, mapName, rounds, time, mode } = useLocalSearchParams<{
    id: string;
    map?: string;
    mapName?: string;
    rounds?: string;
    time?: string;
    mode?: string;
  }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isSingleplayer = id === 'singleplayer';
  const isMultiplayer = !isSingleplayer;
  const secret = useAuthStore((s) => s.secret);
  const mapType = useSettingsStore((s) => s.mapType);
  const language = useSettingsStore((s) => s.language);
  const emotesEnabled = useSettingsStore((s) => s.multiplayerEmotesEnabled);
  const initialCountrySubMode = subModeFromDefaultMode(mode);

  // Multiplayer state
  const gameData = useMultiplayerStore((s) => s.gameData);
  const inGame = useMultiplayerStore((s) => s.inGame);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [allLocations, setAllLocations] = useState<Location[]>([]);
  const roundStartTimeRef = useRef<number>(Date.now());

  // Track whether we already sent a guess this round (multiplayer). The UI lock
  // ("Waiting for N…") is driven purely by the server's `player.final` (set
  // optimistically on submit, reset every round by the server's clearGuesses) —
  // mirroring web. This ref only guards against double-sending.
  const mpGuessSentRef = useRef(false);
  const duelWarningShownRef = useRef(false);
  const [duelWarningVisible, setDuelWarningVisible] = useState(false);

  // Navigate home if multiplayer game shuts down
  useEffect(() => {
    if (isMultiplayer && !inGame) {
      dismissAllSafe();
    }
  }, [isMultiplayer, inGame]);

  useEffect(() => {
    if (
      isMultiplayer
      && gameData?.public
      && gameData.duel
      && gameData.state === 'getready'
      && gameData.curRound === 1
      && !duelWarningShownRef.current
    ) {
      duelWarningShownRef.current = true;
      setDuelWarningVisible(true);
    }
  }, [gameData?.curRound, gameData?.duel, gameData?.public, gameData?.state, isMultiplayer]);

  // Sync multiplayer gameData → local gameState for rendering
  useEffect(() => {
    if (!isMultiplayer || !gameData) return;

    const mpLocations = (gameData.locations ?? []).map((loc) => ({
      lat: loc.lat,
      long: loc.long,
      country: loc.country,
      panoId: loc.panoId,
      heading: loc.heading ?? loc.head,
      pitch: loc.pitch,
    }));

    setGameState((prev) => ({
      ...prev,
      currentRound: gameData.curRound,
      totalRounds: gameData.rounds,
      locations: mpLocations,
      timePerRound: gameData.timePerRound,
      maxDist: gameData.maxDist,
      extent: gameData.extent,
      // Show result when server state is 'end' and we have locations
      isShowingResult: gameData.state === 'end' && mpLocations.length > 0,
    }));

    // Reset guess tracking on new round
    if (gameData.state === 'getready' || gameData.state === 'guess') {
      if (gameData.state === 'getready') {
        mpGuessSentRef.current = false;
        setGuessPosition(null);
        setMiniMapShown(false);
      }
    }

    if (mpLocations.length > 0) {
      setIsLoading(false);
    }
  }, [isMultiplayer, gameData?.state, gameData?.curRound, gameData?.locations?.length]);

  // Singleplayer game options
  const [currentMapSlug, setCurrentMapSlug] = useState(map || 'all');
  // Show Street View ↔ Map toggle on the round-end banner (web parity).
  const [showPano, setShowPano] = useState(false);
  // Hint: 2 per game; using one halves that round's points (web parity).
  const [hintShown, setHintShown] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [confettiKey, setConfettiKey] = useState(0);

  const handleHint = useCallback(() => {
    if (hintShown || hintsUsed >= 2) return;
    setHintShown(true);
    setHintsUsed((n) => n + 1);
  }, [hintShown, hintsUsed]);
  const [currentMapName, setCurrentMapName] = useState(
    initialCountrySubMode === 'continent'
      ? t('continentGuesser')
      : initialCountrySubMode === 'country'
        ? t('countryGuesser')
        : map === 'all' || !map
          ? t('world')
          : mapName || map,
  );
  const [countryGuesserSubMode, setCountryGuesserSubMode] = useState<CountryGuesserSubMode | null>(
    initialCountrySubMode,
  );
  const [nmpzEnabled, setNmpzEnabled] = useState(false);
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [timerDuration, setTimerDuration] = useState(30);
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const isCountryGuesserMode = isSingleplayer && countryGuesserSubMode !== null;
  const singleplayerSurfaceRef = useRef<GameSurfaceHandle>(null);
  const countryGame = useCountryGuesserGame({
    enabled: isCountryGuesserMode,
    subMode: countryGuesserSubMode ?? 'country',
  });

  const [gameState, setGameState] = useState<GameState>({
    currentRound: 1,
    totalRounds: isSingleplayer
      ? DEFAULT_GAME_OPTIONS.totalRounds
      : (rounds ? parseInt(rounds, 10) : DEFAULT_GAME_OPTIONS.totalRounds),
    locations: [],
    guesses: [],
    totalScore: 0,
    isShowingResult: false,
    timePerRound: time ? parseInt(time, 10) : DEFAULT_GAME_OPTIONS.timePerRound,
    maxDist: DEFAULT_GAME_OPTIONS.maxDist,
    extent: null,
  });

  const [guessPosition, setGuessPosition] = useState<{ lat: number; lng: number } | null>(null);
  // Map is HIDDEN by default on mobile, matching web behavior
  const [miniMapShown, setMiniMapShown] = useState(false);
  // Mount the map eagerly once loading completes to avoid first-touch issues
  const [mapMounted, setMapMounted] = useState(false);

  // Street view loading state — true = panorama not yet ready
  const [streetViewLoaded, setStreetViewLoaded] = useState(false);

  // Defer the StreetView WebView mount until the screen-transition settles, so
  // the preloaded street2 loading overlay paints instantly instead of leaving a
  // black/blank gap during the slide into the game. (Mirrors GameSurface.)
  const [canMountStreetView, setCanMountStreetView] = useState(false);
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      setCanMountStreetView(true);
    });
    return () => handle.cancel();
  }, []);
  const mpInitialGetReady = !!(isMultiplayer
    && gameData?.state === 'getready'
    && gameData.curRound === 1
    && !gameData.duel);
  // The loading banner covers an UNREADY street view during ACTIVE play only.
  // Never show it during an MP reveal: 'getready' (between-rounds) or 'end'
  // (final). At 'end' the server bumps curRound past totalRounds, which trips the
  // streetViewLoaded reset effect — but currentLocation is clamped to the last
  // real round, so the WebView never reloads and `streetViewLoaded` stays false
  // forever. Without the 'end' guard that left the spinner covering the answer
  // reveal for the whole 2s hold before results (the "MP results loads, SP is
  // instant" bug — SP has no phantom post-final round so it never resets).
  const showLoadingBanner = mpInitialGetReady
    || ((isLoading || !streetViewLoaded)
      && !(isMultiplayer && (gameData?.state === 'getready' || gameData?.state === 'end')));
  const showBetweenRoundMap = isMultiplayer
    && gameData?.state === 'getready'
    && gameData.curRound > 1
    && ((gameData.roundHistory?.length ?? 0) > 0 || (gameData.locations?.length ?? 0) >= gameData.curRound - 1);
  const showMapResult = gameState.isShowingResult || showBetweenRoundMap;
  // Once I've submitted this round (server `me.final`, set optimistically on
  // submit, reset each round by clearGuesses), the pin must lock — web doesn't
  // let you move your guess while waiting for the other players. Drives the
  // map's `interactive` below so the embed ignores further pin taps.
  const mpGuessSubmitted = isMultiplayer && !!gameData?.players.find((p) => p.id === gameData?.myId)?.final;
  const timeOffset = wsService.getTimeOffset();
  const gameStartingCountdown = useGameStartingCountdown(
    gameData?.nextEvtTime,
    timeOffset,
    mpInitialGetReady,
  );

  // Animation values
  const loadingOpacity = useRef(new Animated.Value(1)).current;
  const sceneOpacity = useRef(new Animated.Value(0)).current;
  const mapSlideAnim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = shown
  const mapBtnsAnim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = shown
  const bannerSlideAnim = useRef(new Animated.Value(300)).current;
  const fabScaleAnim = useRef(new Animated.Value(1)).current;
  const singleplayerTopRightAnim = useRef(new Animated.Value(1)).current;
  const hasCompletedInitialReveal = useRef(false);

  // Mount map eagerly once game loads — prevents first-touch being swallowed
  // by a freshly-mounted MapView when showing the first round's result
  useEffect(() => {
    if (!isLoading && !mapMounted) {
      // Small delay so the initial render settles before adding the MapView
      const timer = setTimeout(() => setMapMounted(true), 300);
      return () => clearTimeout(timer);
    }
  }, [isLoading, mapMounted]);

  useEffect(() => {
    Animated.timing(singleplayerTopRightAnim, {
      toValue: mapModalVisible ? 0 : 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [mapModalVisible, singleplayerTopRightAnim]);

  // Ref to prevent the useEffect from snapping opacity when handleNextRound
  // is already running a manual fade-in animation
  const isManualFadeIn = useRef(false);

  // Fade loading banner in/out
  const fadeOutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (fadeOutTimer.current) {
      clearTimeout(fadeOutTimer.current);
      fadeOutTimer.current = null;
    }

    if (showLoadingBanner) {
      // If handleNextRound is running a manual fade-in, don't snap
      if (!isManualFadeIn.current) {
        Animated.timing(loadingOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    } else {
      isManualFadeIn.current = false;
      // Delay before fading out so the StreetView has time to paint its first frame
      fadeOutTimer.current = setTimeout(() => {
        Animated.timing(loadingOpacity, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      }, 400);
    }

    return () => {
      if (fadeOutTimer.current) clearTimeout(fadeOutTimer.current);
    };
  }, [showLoadingBanner]);

  useEffect(() => {
    if (showLoadingBanner) {
      if (!hasCompletedInitialReveal.current) {
        sceneOpacity.setValue(0);
      }
      return;
    }

    if (!hasCompletedInitialReveal.current) {
      Animated.timing(sceneOpacity, {
        toValue: 1,
        duration: 550,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          hasCompletedInitialReveal.current = true;
        }
      });
    }
  }, [showLoadingBanner, sceneOpacity]);

  // Reset streetViewLoaded when round changes (between rounds)
  useEffect(() => {
    setStreetViewLoaded(false);
  }, [gameState.currentRound]);

  const handleStreetViewLoad = useCallback(() => {
    setStreetViewLoaded(true);
  }, []);

  // The result map keeps its WebView full-screen and only resizes an in-page band
  // on reveal. Hold the clip where it is until the embed signals — PRECISELY, not
  // on a guessed timer — that the in-page resize is finished, then snap to full so
  // the un-resized map is never shown. The timeout is only a safety net.
  const [mapRevealReady, setMapRevealReady] = useState(false);
  const handleRevealReady = useCallback(() => setMapRevealReady(true), []);
  useEffect(() => {
    if (!showMapResult) {
      setMapRevealReady(false);
      return;
    }
    const t = setTimeout(() => setMapRevealReady(true), 700);
    return () => clearTimeout(t);
  }, [showMapResult]);

  // Animate map slide in/out. The map WebView's native frame is kept FULL-SCREEN
  // at all times and only clipped to a bottom band while guessing; the in-page map
  // resizes on reveal and we snap the clip to full only once it's done (above).
  useEffect(() => {
    if (showMapResult) {
      // Slide the clip up to full once the embed signals its in-page resize is
      // done. The embed pins the guessing content in place (no re-center jump),
      // so this is a clean slide that reveals more map above; the WebView is
      // already full-size, so the height animation does no per-frame re-fit.
      if (mapRevealReady) {
        Animated.timing(mapSlideAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
      }
    } else if (miniMapShown) {
      Animated.spring(mapSlideAnim, {
        toValue: miniFraction,
        friction: 10,
        tension: 80,
        useNativeDriver: false,
      }).start();
    } else {
      Animated.timing(mapSlideAnim, {
        toValue: 0,
        duration: 150,
        easing: Easing.ease,
        useNativeDriver: false,
      }).start();
    }
  }, [miniMapShown, showMapResult, mapRevealReady]);

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

  // FAB entrance animation — only on first appearance
  const fabHasAnimated = useRef(false);
  useEffect(() => {
    if (!isLoading && !miniMapShown && !gameState.isShowingResult && !fabHasAnimated.current) {
      fabHasAnimated.current = true;
      fabScaleAnim.setValue(0);
      Animated.spring(fabScaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 80,
        useNativeDriver: true,
      }).start();
    }
  }, [isLoading, miniMapShown, gameState.isShowingResult]);

  const expandedMapHeight = height * (width > height ? EXPANDED_MAP_LANDSCAPE_HEIGHT_RATIO : EXPANDED_MAP_HEIGHT_RATIO);
  // mapSlideAnim value for the open mini-map (mapHeight uses a constant full-range
  // so reveal animates mini→full smoothly instead of jumping).
  const miniFraction = height > 0 ? expandedMapHeight / height : 0.5;

  // Map height interpolation: 0 = hidden (0px), 1 = expanded map height (or 100% when answer shown)
  const mapHeight = mapSlideAnim.interpolate({
    inputRange: [0, 1],
    // CONSTANT range so reveal animates mini→full smoothly instead of jumping.
    outputRange: [0, height],
  });

  // Fetch locations from server based on currentMapSlug (singleplayer only)
  useEffect(() => {
    if (isMultiplayer || isCountryGuesserMode) return; // Multiplayer locations come from gameData; country modes use their shared component.
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000;

    async function fetchLocations(attempt = 1) {
      try {
        setIsLoading(true);
        setLoadError(null);

        let data: any;
        const mapSlug = currentMapSlug;

        if (mapSlug === 'all') {
          data = await api.fetchAllLocations();
          setCurrentMapName(t('world'));
        } else if (mapSlug.length === 2 && mapSlug === mapSlug.toUpperCase()) {
          data = await api.fetchCountryLocations(mapSlug);
          // Look up country name + maxDist from hosted JSON (matches web countryMaxDists import)
          const [officialCountryMaps, countryMaxDists] = await Promise.all([
            getOfficialCountryMaps(),
            getCountryMaxDists(),
          ]);
          const countryEntry = officialCountryMaps.find((m: any) => m.countryCode === mapSlug);
          setCurrentMapName(countryEntry?.name || mapSlug);
          // Attach maxDist so it's picked up below
          data.maxDist = countryMaxDists[mapSlug] ?? DEFAULT_GAME_OPTIONS.maxDist;
        } else {
          data = await api.fetchMapLocations(mapSlug);
          setCurrentMapName((data as any).name || mapSlug);
        }

        if (!data.ready || !data.locations || data.locations.length === 0) {
          throw new Error(t('noLocationsForMap', undefined, 'No locations available for this map'));
        }

        const normalizedLocations = data.locations.map((loc: any) => ({
          lat: loc.lat,
          long: loc.long ?? loc.lng,
          country: loc.country,
          panoId: loc.panoId,
          heading: loc.heading ?? loc.head,
          pitch: loc.pitch,
        }));

        const shuffled = [...normalizedLocations].sort(() => Math.random() - 0.5);
        const totalRounds = gameState.totalRounds;
        const selectedLocations = shuffled.slice(0, totalRounds);

        // Compute extent based on map type
        let extent: Extent = null;
        if (mapSlug === 'all') {
          extent = null; // World view
        } else if (mapSlug.length === 2 && mapSlug === mapSlug.toUpperCase()) {
          // officialCountryMaps already fetched above (cached)
          const officialCountryMaps = await getOfficialCountryMaps();
          const countryMap = officialCountryMaps.find((m: any) => m.countryCode === mapSlug);
          extent = countryMap?.extent ?? null;
        } else {
          // Community map — compute bounding box from all locations
          const lngs = normalizedLocations.map((l: Location) => l.long);
          const lats = normalizedLocations.map((l: Location) => l.lat);
          extent = [
            Math.min(...lngs),
            Math.min(...lats),
            Math.max(...lngs),
            Math.max(...lats),
          ];
        }

        setAllLocations(shuffled);
        setGameState((prev) => ({
          ...prev,
          locations: selectedLocations,
          maxDist: data.maxDist ?? DEFAULT_GAME_OPTIONS.maxDist,
          extent,
        }));
        setHintShown(false);
        setHintsUsed(0);
        setIsLoading(false);
        roundStartTimeRef.current = Date.now();

        // Track map play (matches web behavior — skip default "all" map)
        if (mapSlug !== 'all') {
          api.trackMapPlay(mapSlug);
        }
      } catch (error) {
        if (attempt < MAX_RETRIES) {
          console.warn(`Failed to fetch locations (attempt ${attempt}/${MAX_RETRIES}), retrying...`);
          setTimeout(() => fetchLocations(attempt + 1), RETRY_DELAY);
          return;
        }
        console.error('Failed to fetch locations after all retries:', error);
        setLoadError(error instanceof Error ? error.message : t('failedToLoadGame', undefined, 'Failed to load game'));
        setIsLoading(false);
      }
    }

    fetchLocations();
  }, [currentMapSlug, isCountryGuesserMode, isMultiplayer]);

  // Multiplayer state='end' arrives with curRound = rounds + 1 (see ws.js:1509-1519),
  // so clamp to the last real round before indexing locations.
  const effectiveRoundIndex = Math.min(gameState.currentRound, gameState.totalRounds) - 1;
  const currentLocation = gameState.locations[Math.max(0, effectiveRoundIndex)];
  const completedRoundNumber = isMultiplayer && gameData ? gameData.curRound - 1 : 0;
  const betweenRoundHistory = showBetweenRoundMap && gameData
    ? findRoundHistory(gameData.roundHistory, completedRoundNumber)
    : undefined;
  const betweenRoundLocation = betweenRoundHistory?.location
    ?? (showBetweenRoundMap && gameData ? gameData.locations?.[completedRoundNumber - 1] : undefined);
  const mapActualLocation = showBetweenRoundMap ? betweenRoundLocation : currentLocation;
  const betweenRoundPlayerGuesses = showBetweenRoundMap && gameData
    ? (betweenRoundHistory
        ? buildHistoryPlayerGuesses(betweenRoundHistory)
        : buildCurrentPlayerGuesses(gameData.players, betweenRoundLocation, gameState.maxDist))
    : [];
  const currentRoundPlayerGuesses = isMultiplayer && gameData && gameState.isShowingResult
    ? buildCurrentPlayerGuesses(gameData.players, currentLocation, gameState.maxDist)
    : [];

  // My own result for the answer-reveal banner — reuses the singleplayer
  // ClassicEndBanner (web parity: endBanner.js shows your distance/points; only
  // the Next-Round button is hidden in MP). My guess persists on gameData.players
  // through the reveal (server clears it only at getready→guess).
  const mpMe = isMultiplayer && gameData
    ? gameData.players.find((p) => p.id === gameData.myId)
    : undefined;
  const mpMyGuess = mpMe?.latLong && (mpMe.latLong[0] !== 0 || mpMe.latLong[1] !== 0)
    ? mpMe.latLong
    : null;
  const mpReveal = isMultiplayer && gameData && showMapResult && mapActualLocation
    ? {
        didGuess: !!mpMyGuess,
        distance: mpMyGuess
          ? findDistance(mapActualLocation.lat, mapActualLocation.long, mpMyGuess[0], mpMyGuess[1])
          : null,
        points: mpMyGuess
          ? calcPoints({
              lat: mapActualLocation.lat,
              lon: mapActualLocation.long,
              guessLat: mpMyGuess[0],
              guessLon: mpMyGuess[1],
              maxDist: gameState.maxDist,
            })
          : 0,
        guessLat: mpMyGuess ? mpMyGuess[0] : null,
        guessLng: mpMyGuess ? mpMyGuess[1] : null,
        // "It was {Country}!" reveal only on the world map (matches singleplayer).
        answerCountry: (gameData.map === 'all' || !gameData.map)
          ? mapActualLocation.country ?? null
          : null,
        isFinal: gameState.isShowingResult,
      }
    : null;

  const handleMapPress = useCallback((lat: number, lng: number) => {
    if (gameState.isShowingResult) return;
    // Guess locked once submitted (multiplayer) — can't move the pin while
    // waiting for other players (web parity). Belt-and-suspenders alongside the
    // map's `interactive={false}`.
    if (mpGuessSentRef.current) return;
    setGuessPosition({ lat, lng });
  }, [gameState.isShowingResult]);

  const handleSubmitGuess = useCallback(() => {
    if (!guessPosition || !currentLocation) return;

    // Multiplayer: send guess to server
    if (isMultiplayer) {
      if (mpGuessSentRef.current) return;
      mpGuessSentRef.current = true;
      // Match web (home.js:2315) — optimistically mark my player as final so the
      // "Waiting for N players..." count drops instantly instead of waiting for
      // the server's broadcast to ack our own guess.
      useMultiplayerStore.setState((s) => {
        if (!s.gameData) return s;
        return {
          gameData: {
            ...s.gameData,
            players: s.gameData.players.map((p) =>
              p.id === s.gameData!.myId
                ? { ...p, final: true, latLong: [guessPosition.lat, guessPosition.lng] }
                : p,
            ),
          },
        };
      });
      wsService.send({
        type: 'place',
        latLong: [guessPosition.lat, guessPosition.lng],
        final: true,
      });
      return;
    }

    // Singleplayer: local calculation
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
      usedHint: hintShown,
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
    setMiniMapShown(false);
    setShowPano(false);
    if (points >= 4850) setConfettiKey((k) => k + 1);
  }, [guessPosition, currentLocation, gameState.maxDist, isMultiplayer, hintShown]);

  const handleTimeUp = useCallback(() => {
    if (gameState.isShowingResult) return;

    // Only auto-submit during the ACTIVE multiplayer 'guess' phase. The round
    // timer can fire onTimeUp late — after the next round's getready reset has
    // run — which would re-send a stale guess and re-lock mpGuessSentRef,
    // silently swallowing every guess in round 2+. Read live store state so a
    // stale-closure timer firing at the round boundary is caught too.
    if (isMultiplayer && useMultiplayerStore.getState().gameData?.state !== 'guess') return;

    // Multiplayer: server handles time-up, just send current guess if any
    if (isMultiplayer) {
      if (guessPosition && !mpGuessSentRef.current) {
        mpGuessSentRef.current = true;
        useMultiplayerStore.setState((s) => {
          if (!s.gameData) return s;
          return {
            gameData: {
              ...s.gameData,
              players: s.gameData.players.map((p) =>
                p.id === s.gameData!.myId
                  ? { ...p, final: true, latLong: [guessPosition.lat, guessPosition.lng] }
                  : p,
              ),
            },
          };
        });
        wsService.send({
          type: 'place',
          latLong: [guessPosition.lat, guessPosition.lng],
          final: true,
        });
      }
      return;
    }

    // Singleplayer
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
  }, [guessPosition, currentLocation, gameState.isShowingResult, handleSubmitGuess, isMultiplayer]);

  // Multiplayer: navigate to results when duelEnd arrives or final round ends.
  // Match web: brief answer hold then fade-out before nav so the cut isn't jarring.
  const mpResultsNavigated = useRef(false);
  useEffect(() => {
    if (!isMultiplayer || !gameData) return;
    if (mpResultsNavigated.current) return;
    if (!(gameData.duelEnd || (gameData.state === 'end' && gameData.curRound >= gameData.rounds))) return;

    mpResultsNavigated.current = true;
    const snapshot = {
      totalScore: (gameData.players.find((p) => p.id === gameData.myId)?.score ?? 0).toString(),
      rounds: JSON.stringify(gameData.roundHistory ?? []),
      multiplayer: 'true',
      duelEnd: gameData.duelEnd ? JSON.stringify(gameData.duelEnd) : '',
      players: JSON.stringify(gameData.players),
      myId: gameData.myId,
      gameId: gameData.code ?? '',
      duel: gameData.duel ? 'true' : 'false',
      // Public flag drives the results-screen "Play Again": only public games
      // (ranked duels + unranked public multiplayer) have a queue to re-enter.
      // Private/party games have no public queue, so Play Again falls back home.
      public: gameData.public ? 'true' : 'false',
    };

    // Hold the answer banner ~2s (web parity), then push results. The results
    // route's 'fade' transition crossfades it in over the live answer scene —
    // matching singleplayer and web. (Previously we faded the scene to black
    // first and let it slide in, which read as a jarring double cut.)
    const HOLD_MS = 2000;
    const holdTimer = setTimeout(() => {
      router.push({ pathname: '/game/results', params: snapshot });
    }, HOLD_MS);
    return () => clearTimeout(holdTimer);
  }, [isMultiplayer, gameData?.duelEnd, gameData?.state, gameData?.curRound]);

  const spResultsNavigated = useRef(false);
  const handleNextRound = useCallback(() => {
    setShowPano(false); // each round's result starts on the map (web parity)
    if (gameState.currentRound >= gameState.totalRounds) {
      if (spResultsNavigated.current) return;
      spResultsNavigated.current = true;
      // Store game if logged in (matches web gameUI.js behavior)
      if (secret && isSingleplayer && gameState.guesses.length > 0) {
        const isOfficial = currentMapSlug === 'all' || (currentMapSlug.length === 2 && currentMapSlug === currentMapSlug.toUpperCase());
        api.storeGame(secret, {
          official: isOfficial,
          location: currentMapName,
          rounds: gameState.guesses.map((g) => ({
            lat: g.guessLat,
            long: g.guessLong,
            actualLat: g.actualLat,
            actualLong: g.actualLong,
            panoId: g.panoId,
            usedHint: false,
            maxDist: gameState.maxDist,
            roundTime: g.timeTaken,
            xp: isOfficial ? Math.round(g.points / 50) : 0,
            points: g.points,
          })),
        }).catch(() => {});
      }

      router.push({
        pathname: '/game/results',
        params: {
          totalScore: gameState.totalScore.toString(),
          rounds: JSON.stringify(gameState.guesses.map((g) => ({
            ...g,
            xpEarned: secret && (currentMapSlug === 'all' || (currentMapSlug.length === 2 && currentMapSlug === currentMapSlug.toUpperCase()))
              ? Math.round(g.points / 50)
              : 0,
          }))),
          extent: gameState.extent ? JSON.stringify(gameState.extent) : '',
        },
      });
      return;
    }

    const advanceRound = () => {
      setGameState((prev) => ({
        ...prev,
        currentRound: prev.currentRound + 1,
        isShowingResult: false,
      }));
      setGuessPosition(null);
      setHintShown(false); // hint is per-round; the 2/game count persists
      roundStartTimeRef.current = Date.now();
    };

    if (singleplayerSurfaceRef.current) {
      singleplayerSurfaceRef.current.beginRoundTransition(advanceRound);
    } else {
      advanceRound();
    }
  }, [gameState, router, secret, isSingleplayer, currentMapSlug, currentMapName]);

  const handleQuit = () => {
    if (isMultiplayer) {
      useMultiplayerStore.getState().leaveGame();
    }
    dismissAllSafe();
  };

  // Multiplayer leave — direct port of web backBtnPressed (home.js:2453-2513):
  //   • ranked duel in progress → forfeit confirm
  //   • host of a non-waiting private game → resetGame (back to the lobby, stays)
  //   • everyone else → leaveGame + reset + exit home
  // This is the single source of truth for leaving; the visible back button and
  // the Android hardware-back listener both route through it.
  const leftRef = useRef(false);
  const handleLeave = useCallback(() => {
    if (!isMultiplayer) {
      dismissAllSafe();
      return;
    }
    const gd = useMultiplayerStore.getState().gameData;
    const doLeave = () => {
      if (gd && gd.host && gd.state !== 'waiting') {
        // Host backing out of an in-progress/finished private game: reset to the
        // lobby instead of ending it. The server flips state→'waiting' and this
        // screen re-renders <MultiplayerLobby/> (no navigation).
        wsService.send({ type: 'resetGame' });
        return;
      }
      if (leftRef.current) return;
      leftRef.current = true;
      useMultiplayerStore.getState().leaveGame();
      dismissAllSafe();
    };
    // Ranked duel = duel && public (server: ws.js `game.duel && game.public`).
    const isRankedDuel = !!gd?.duel && !!gd?.public && gd?.state !== 'end';
    if (isRankedDuel) {
      Alert.alert(
        t('forfeitGameTitle', undefined, 'Forfeit game?'),
        t('forfeitGameMessage', undefined, 'Leaving now will count as a loss.'),
        [
          { text: t('cancel'), style: 'cancel' },
          { text: t('forfeit', undefined, 'Forfeit'), style: 'destructive', onPress: doLeave },
        ],
      );
      return;
    }
    doLeave();
  }, [isMultiplayer, router]);

  // Route Android hardware-back / swipe through handleLeave (multiplayer only).
  // Always preventDefault and delegate: handleLeave decides whether to navigate
  // (leave → dismissAll) or stay (host → resetGame → lobby re-render).
  useEffect(() => {
    if (!isMultiplayer) return;
    const sub = navigation.addListener('beforeRemove', (e: any) => {
      if (leftRef.current) return; // we already initiated dismissAll — allow it
      // If the server already tore the game down (gameShutdown → inGame false),
      // let the removal proceed; only intercept while still in a game.
      if (!useMultiplayerStore.getState().inGame) return;
      e.preventDefault();
      handleLeave();
    });
    return sub;
  }, [isMultiplayer, navigation, handleLeave]);

  const handleMapSelect = useCallback((slug: string, name: string) => {
    const wasCountryGuesserMode = countryGuesserSubMode !== null;

    if (slug === '__countryGuesser' || slug === '__continentGuesser') {
      const nextSubMode = slug === '__continentGuesser' ? 'continent' : 'country';
      if (countryGuesserSubMode === nextSubMode) {
        return;
      }
      AsyncStorage.setItem(
        SINGLEPLAYER_DEFAULT_MODE_KEY,
        slug === '__continentGuesser' ? 'continentGuesser' : 'countryGuesser',
      ).catch(() => {});
      setCurrentMapSlug('all');
      setCurrentMapName(name);
      setIsLoading(false);
      setLoadError(null);
      setGuessPosition(null);
      setMiniMapShown(false);
      setStreetViewLoaded(false);
      setGameState((prev) => ({
        ...prev,
        currentRound: 1,
        totalRounds: COUNTRY_GUESSER_TOTAL_ROUNDS,
        guesses: [],
        totalScore: 0,
        isShowingResult: false,
        locations: [],
        extent: null,
        maxDist: DEFAULT_GAME_OPTIONS.maxDist,
      }));
      setCountryGuesserSubMode(nextSubMode);
      return;
    }

    AsyncStorage.setItem(SINGLEPLAYER_DEFAULT_MODE_KEY, 'world').catch(() => {});

    if (slug === currentMapSlug && !wasCountryGuesserMode) {
      setMapModalVisible(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    setCurrentMapSlug(slug);
    setCurrentMapName(name);
    // Full game reset
    setGameState((prev) => ({
      ...prev,
      currentRound: 1,
      totalRounds: DEFAULT_GAME_OPTIONS.totalRounds,
      guesses: [],
      totalScore: 0,
      isShowingResult: false,
      locations: [],
      extent: null,
    }));
    setGuessPosition(null);
    setMiniMapShown(false);
    setStreetViewLoaded(false);
    setCountryGuesserSubMode(null);
  }, [countryGuesserSubMode, currentMapSlug]);

  const completeCountryGuesserGame = useCallback(() => {
    const subMode = countryGuesserSubMode ?? 'country';

    if (secret && countryGame.results.length > 0) {
      api.storeGame(secret, {
        official: true,
        location: 'all',
        countryGuesser: true,
        countryGuessrSubMode: subMode,
        rounds: countryGame.results.map((result) => ({
          lat: result.guessLat,
          long: result.guessLong,
          actualLat: result.actualLat,
          actualLong: result.actualLong,
          panoId: result.panoId,
          country: result.country,
          usedHint: false,
          maxDist: 20000,
          roundTime: result.timeTaken,
          xp: result.points > 0 ? 20 : 0,
          points: result.points,
        })),
      }).catch(() => {});
    }

    router.push({
      pathname: '/game/results',
      params: {
        totalScore: countryGame.totalPoints.toString(),
        rounds: JSON.stringify(
          countryGame.results.map((result) => ({
            guessLat: result.guessLat,
            guessLong: result.guessLong,
            actualLat: result.actualLat,
            actualLong: result.actualLong,
            panoId: result.panoId,
            points: result.points,
            xpEarned: secret && result.points > 0 ? 20 : 0,
            distance: 0,
            timeTaken: result.timeTaken,
            country: result.country,
            picked: result.picked,
            correct: result.correct,
          })),
        ),
        mode: defaultModeValueForSubMode(subMode),
      },
    });
  }, [countryGame.results, countryGame.totalPoints, countryGuesserSubMode, router, secret]);

  const handleCountryNextRound = useCallback(() => {
    if (countryGame.isFinal) {
      completeCountryGuesserGame();
      return;
    }
    singleplayerSurfaceRef.current?.beginRoundTransition(countryGame.advance);
  }, [completeCountryGuesserGame, countryGame]);

  const lastGuess = gameState.guesses[gameState.guesses.length - 1];

  if (isSingleplayer) {
    const activeCountryMode = countryGuesserSubMode ?? 'country';
    const activeLocation = isCountryGuesserMode ? countryGame.currentLoc : currentLocation;
    const activeRound = isCountryGuesserMode ? countryGame.round : gameState.currentRound;
    const activeTotalRounds = isCountryGuesserMode ? countryGame.totalRounds : gameState.totalRounds;
    const activeTotalScore = isCountryGuesserMode ? countryGame.totalPoints : gameState.totalScore;
    const activeShowingResult = isCountryGuesserMode ? countryGame.showResult : gameState.isShowingResult;
    const hintCircleData =
      !isCountryGuesserMode && hintShown && currentLocation
        ? hintCircle(
            { lat: currentLocation.lat, long: currentLocation.long },
            gameState.maxDist,
            gameState.currentRound,
            2_500_000, // cap so react-native-maps renders the circle (see daily HINT_MAX_RADIUS_M)
          )
        : null;
    const countryCorrectAnswer =
      countryGame.currentLoc && activeCountryMode === 'continent'
        ? continentFromCode(countryGame.currentLoc.country)
        : countryGame.currentLoc?.country ?? null;
    const countryGuessPosition =
      isCountryGuesserMode &&
      activeCountryMode === 'country' &&
      countryGame.showResult &&
      countryGame.lastResult?.points === 0
        ? countryCenterFromCode(countryGame.picked)
        : null;

    const singleplayerEndBanner = isCountryGuesserMode
      ? (countryGame.showResult && countryGame.lastResult && countryGame.currentLoc ? (
          <CountryEndBanner
            mode={activeCountryMode}
            correctCountry={countryGame.currentLoc.country}
            picked={countryGame.picked}
            points={countryGame.lastResult.points}
            streak={countryGame.streak}
            round={countryGame.round}
            totalRounds={countryGame.totalRounds}
            onNext={handleCountryNextRound}
            isFinal={countryGame.isFinal}
          />
        ) : null)
      : (gameState.isShowingResult && lastGuess ? (
          <ClassicEndBanner
            points={lastGuess.points}
            distance={lastGuess.distance}
            didGuess={!(lastGuess.guessLat === 0 && lastGuess.guessLong === 0)}
            answerCountry={currentMapSlug === 'all' ? currentLocation?.country ?? null : null}
            guessLat={lastGuess.guessLat}
            guessLng={lastGuess.guessLong}
            panoShown={showPano}
            onTogglePano={() => setShowPano((v) => !v)}
            onNext={handleNextRound}
            isFinal={gameState.currentRound >= gameState.totalRounds}
          />
        ) : null);

    return (
      <View style={styles.container}>
        <GameSurface
          ref={singleplayerSurfaceRef}
          location={activeLocation ?? null}
          roundKey={`${isCountryGuesserMode ? activeCountryMode : currentMapSlug}-${activeRound}`}
          variant={isCountryGuesserMode ? activeCountryMode : 'pin'}
          extent={isCountryGuesserMode ? null : gameState.extent}
          guessPoints={isCountryGuesserMode ? undefined : gameState.guesses[gameState.currentRound - 1]?.points}
          isShowingResult={activeShowingResult}
          showPanoOnResult={!isCountryGuesserMode && showPano}
          onHint={isCountryGuesserMode ? undefined : handleHint}
          hintShown={hintShown}
          hintDisabled={hintsUsed >= 2}
          hintCircleData={hintCircleData}
          maxDist={isCountryGuesserMode ? undefined : gameState.maxDist}
          round={gameState.currentRound}
          guessPosition={guessPosition}
          onGuessPositionChange={setGuessPosition}
          onSubmitPin={handleSubmitGuess}
          countryOptions={countryGame.otherOptions}
          countryPicked={countryGame.picked}
          correctAnswer={countryGame.showResult ? countryCorrectAnswer : null}
          countryGuessPosition={countryGuessPosition}
          onAnswerCountry={countryGame.submit}
          loadingError={isCountryGuesserMode ? countryGame.loadError : loadError}
          onLoadingRetry={handleQuit}
          loadingRetryLabel={t('back')}
          hideInputs={
            isCountryGuesserMode
              ? countryGame.loading || !!countryGame.loadError || !countryGame.currentLoc
              : isLoading || !!loadError || !currentLocation
          }
          topLeftSlot={<BackButton onPress={handleQuit} />}
          topRightSlot={
            <Animated.View
              pointerEvents={mapModalVisible ? 'none' : 'auto'}
              style={[
                styles.singleplayerTopRightSlot,
                {
                  opacity: singleplayerTopRightAnim,
                  transform: [{
                    translateX: singleplayerTopRightAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [80, 0],
                    }),
                  }],
                },
              ]}
            >
              <Pressable
                disabled={activeShowingResult}
                style={({ pressed }) => [
                  styles.mapSelectorBtn,
                  activeShowingResult && styles.mapSelectorBtnDisabled,
                  pressed && !activeShowingResult && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                ]}
                onPress={() => setMapModalVisible(true)}
              >
                <Ionicons name="map" size={14} color="rgba(255,255,255,0.85)" />
                <Text style={styles.mapSelectorText} numberOfLines={1}>
                  {currentMapName}{!isCountryGuesserMode && nmpzEnabled ? ', NMPZ' : ''}
                </Text>
                <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.85)" />
              </Pressable>
              <GameTimer
                timeRemaining={timerEnabled ? timerDuration : gameState.timePerRound}
                onTimeUp={handleTimeUp}
                isPaused={activeShowingResult || mapModalVisible || isCountryGuesserMode}
                roundKey={activeRound}
                currentRound={activeRound}
                totalRounds={activeTotalRounds}
                totalScore={activeTotalScore}
                showTimer={!isCountryGuesserMode && timerEnabled && !activeShowingResult}
                hasGuess={!!guessPosition}
              />
            </Animated.View>
          }
          endBannerContent={singleplayerEndBanner}
        />

        <MapSelectorModal
          visible={mapModalVisible}
          onClose={() => setMapModalVisible(false)}
          onSelectMap={handleMapSelect}
          currentMapSlug={currentMapSlug}
          nmpzEnabled={nmpzEnabled}
          onNmpzToggle={setNmpzEnabled}
          timerEnabled={timerEnabled}
          onTimerToggle={setTimerEnabled}
          timerDuration={timerDuration}
          onTimerDurationChange={setTimerDuration}
          showSingleplayerModes
          currentSingleplayerMode={
            countryGuesserSubMode === 'continent'
              ? 'continent'
              : countryGuesserSubMode === 'country'
                ? 'country'
                : currentMapSlug === 'all'
                  ? 'world'
                  : null
          }
        />

        {confettiKey > 0 && <ConfettiBurst trigger={confettiKey} />}
      </View>
    );
  }

  // Multiplayer lobby (waiting state) — unified into this screen so the party
  // lobby and the game live on ONE route. Lobby→game and game→lobby (host reset)
  // are pure re-renders, eliminating the router.replace leave/back races. When a
  // private game finishes, the server resets it to 'waiting' and this re-renders.
  const isLobby = isMultiplayer && gameData?.state === 'waiting';
  const mpGetReady = isMultiplayer && gameData?.state === 'getready';
  // Ranked duel (matchmade, ELO-affecting) = duel && public. Used to hide the
  // back button so ranked feels committed (server auto-ends timed rounds).
  const isRankedInProgress = isMultiplayer && !!gameData?.duel && !!gameData?.public && gameData?.state !== 'end';
  const showFab = !showLoadingBanner && !miniMapShown && !gameState.isShowingResult && !mpGetReady;
  const scenePointerEvents = showLoadingBanner && !hasCompletedInitialReveal.current ? 'none' : 'box-none';

  // Lobby (waiting) and the in-game scene share ONE persistent container so the
  // TransitionCurtain below can mask the heavy lobby⇄WebView swap (party start,
  // and host "Play Again"/back → lobby): it fades through the brand colour
  // instead of flashing WebView-teardown artifacts. getready⇄guess stay 'game'.
  return (
    <View style={styles.container}>
      {isLobby ? (
        <MultiplayerLobby onLeave={handleLeave} />
      ) : (
      <View style={styles.container}>
      <Animated.View
        style={[StyleSheet.absoluteFillObject, { opacity: sceneOpacity }]}
        pointerEvents={scenePointerEvents}
      >
        {/* Street View - FULLSCREEN */}
        <View style={StyleSheet.absoluteFillObject}>
          {currentLocation && canMountStreetView && (
            <StreetViewWebView
              lat={currentLocation.lat}
              long={currentLocation.long}
              heading={currentLocation.heading ?? currentLocation.head}
              pitch={currentLocation.pitch}
              onLoad={handleStreetViewLoad}
              nmpz={isMultiplayer ? (gameData?.nm ?? false) : nmpzEnabled}
              // Dual-slot crossfade: the next round's pano (currentLocation bumps
              // to round N+1 during the between-rounds reveal — that's the
              // preload) loads in the HIDDEN slot while the current pano stays
              // visible, then crossfades when ready. Without this the pano
              // reloaded in-place in the visible slot → the iframe's white
              // mid-load frame flashed when the answer map slid down. Preserves
              // the preload; only removes the flash.
              smoothTransitions
            />
          )}
        </View>

        {/* Multiplayer round/score/timer pill - top right.
            Web parity (gameUI.js multiplayerTimerShown): the pill is shown ONLY during the
            active 'guess' phase — hidden across the whole answer reveal (getready round>1 and
            'end', via showMapResult) and during loading (showLoadingBanner). RevealView
            fades it in/out so the show/hide isn't a hard flash.
            Duels use the centered timer below the health bars instead (see DUEL HUD). */}
        {isMultiplayer && !gameData?.duel && (
          <SafeAreaView style={[styles.timerContainer, { paddingRight: Math.max(insets.right, spacing.lg) }]} edges={['top']} pointerEvents="box-none">
            <RevealView visible={!showMapResult && !showLoadingBanner} translateY={-10} durationIn={260} durationOut={180}>
              <GameTimer
                timeRemaining={timerEnabled ? timerDuration : gameState.timePerRound}
                onTimeUp={handleTimeUp}
                isPaused={gameState.isShowingResult || mapModalVisible}
                roundKey={gameState.currentRound}
                currentRound={gameState.currentRound}
                totalRounds={gameState.totalRounds}
                totalScore={isMultiplayer
                  ? (gameData?.players.find((p) => p.id === gameData?.myId)?.score ?? 0)
                  : gameState.totalScore}
                showTimer={!isSingleplayer || timerEnabled}
                serverEndTime={isMultiplayer ? gameData?.nextEvtTime : undefined}
                timeOffset={isMultiplayer ? timeOffset : undefined}
                criticalEnabled={gameData?.state === 'guess'}
                hasGuess={!!guessPosition}
              />
            </RevealView>
          </SafeAreaView>
        )}

        {/* Back button - top left (matches web navbar red back button).
            Hidden during a ranked duel so it feels committed — there is no easy
            exit; the server auto-ends the timed rounds. (Android hardware-back
            still routes through handleLeave's forfeit confirm.) */}
        {!isRankedInProgress && (
          <SafeAreaView style={[styles.backButtonContainer, { paddingLeft: Math.max(insets.left, spacing.lg) }]} edges={['top']} pointerEvents="box-none">
            <BackButton onPress={handleLeave} />
          </SafeAreaView>
        )}

        {/* ═══ DUEL HUD - health bars persistent through guess + between-rounds (matches web's .hb-parent) ═══ */}
        {isMultiplayer && gameData?.duel && !gameState.isShowingResult
          && (gameData.state === 'guess' || (gameData.state === 'getready' && gameData.curRound > 1)) && (
          <SafeAreaView
            style={[styles.duelHudContainer, { paddingLeft: Math.max(insets.left, spacing.md), paddingRight: Math.max(insets.right, spacing.md) }]}
            edges={['top']}
            pointerEvents="box-none"
          >
            <DuelHUD players={gameData.players} myId={gameData.myId} />
            {/* Centered, single-line timer BELOW the health bars (web .timer.duel).
                Round + seconds in one line; the score is the health, shown above. */}
            <Reanimated.View
              entering={FadeInDown.duration(420).delay(80).reduceMotion(ReduceMotion.Never)}
              pointerEvents="none"
            >
              <GameTimer
                variant="duel"
                timeRemaining={gameState.timePerRound}
                onTimeUp={handleTimeUp}
                isPaused={gameState.isShowingResult || mapModalVisible}
                roundKey={gameState.currentRound}
                currentRound={gameState.currentRound}
                totalRounds={gameState.totalRounds}
                totalScore={0}
                showTimer
                serverEndTime={gameData.nextEvtTime}
                timeOffset={timeOffset}
                criticalEnabled={gameData.state === 'guess'}
                hasGuess={!!guessPosition}
              />
            </Reanimated.View>
          </SafeAreaView>
        )}

        {/* ═══ MAP OVERLAY - slides up from bottom ═══ */}
        <Animated.View
          style={[styles.mapOverlay, { height: mapHeight }]}
          pointerEvents={miniMapShown || showMapResult ? 'auto' : 'none'}
        >
          {/* The WebView's native frame is kept FULL-SCREEN and bottom-anchored at
              all times; the outer clip reveals only its bottom band while guessing
              and snaps to full on result. The native frame never resizes, so the
              reveal can't produce the WebView's "content snaps to top:0" flicker.
              The map draws into a bottom band INSIDE the page (mapBandFraction) so
              the guessing fit matches the old mini-map. */}
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height }}>
            {mapMounted && (
              <EmbeddedMap
                route="map"
                mapType={mapType}
                lang={language}
                mapBandFraction={miniFraction}
                onRevealReady={handleRevealReady}
                location={
                  mapActualLocation
                    ? { lat: mapActualLocation.lat, long: mapActualLocation.long }
                    : null
                }
                guessPosition={showBetweenRoundMap ? null : guessPosition}
                onGuessPositionChange={(p) => handleMapPress(p.lat, p.lng)}
                isShowingResult={showMapResult}
                interactive={!showMapResult && !mpGuessSubmitted}
                extent={gameState.extent}
                maxDist={gameState.maxDist}
                round={gameState.currentRound}
                // All players (self + opponents) → Map.js multiplayerState; its
                // MultiplayerLayer renders opponents and freezes the reveal.
                multiplayerState={{
                  inGame: true,
                  gameData: {
                    myId: gameData?.myId,
                    state: showMapResult ? 'end' : 'guess',
                    curRound: gameState.currentRound,
                    players: (showBetweenRoundMap
                      ? betweenRoundPlayerGuesses
                      : currentRoundPlayerGuesses
                    ).map((p) => ({
                      id: p.id,
                      username: p.username,
                      guess: [p.lat, p.lng],
                      final: true,
                    })),
                  },
                }}
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
              { bottom: expandedMapHeight + 8, paddingHorizontal: Math.max(insets.right, spacing.md) },
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
            {/* Guess submit button (blue) — locked + "Waiting for N..." in multiplayer after submit */}
            {(() => {
              const myPlayer = isMultiplayer && gameData
                ? gameData.players.find((p) => p.id === gameData.myId)
                : undefined;
              const locked = isMultiplayer && !!myPlayer?.final;
              const waitingCount = isMultiplayer && gameData
                ? gameData.players.reduce((acc, p) => (p.final ? acc - 1 : acc), gameData.players.length)
                : 0;
              const buttonText = locked
                ? (waitingCount > 0
                    ? t('waitingForPlayers', { p: waitingCount })
                    : t('waiting'))
                : t('guess');
              const disabled = !guessPosition || locked;
              const showActive = !!guessPosition && !locked;
              return (
                <Pressable
                  onPress={handleSubmitGuess}
                  disabled={disabled}
                  style={({ pressed }) => [
                    styles.guessSubmitBtn,
                    pressed && showActive && { opacity: 0.85 },
                  ]}
                >
                  <LinearGradient
                    colors={
                      locked
                        ? ['#3a3a3a', '#2a2a2a']
                        : showActive
                          ? ['#1d1d5b', '#1e3e9c']
                          : ['#555', '#444']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.guessSubmitBtnGradient}
                  >
                    <Text
                      style={[
                        styles.guessSubmitBtnText,
                        !showActive && !locked && { opacity: 0.5 },
                        locked && { opacity: 0.85 },
                      ]}
                      numberOfLines={1}
                    >
                      {buttonText}
                    </Text>
                  </LinearGradient>
                </Pressable>
              );
            })()}

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
        {showFab && (() => {
          const myPlayer = isMultiplayer && gameData
            ? gameData.players.find((p) => p.id === gameData.myId)
            : undefined;
          const locked = false;

          const fabText =  t('guess');
          return (
            <Animated.View
              style={[
                styles.guessFab,
                {
                  transform: [{ scale: fabScaleAnim }],
                  bottom: Math.max(insets.bottom, 20) + 20,
                  right: Math.max(insets.right, 60),
                },
              ]}
            >
              <Pressable
                onPress={() => setMiniMapShown(true)}
                disabled={locked}
                style={({ pressed }) => [pressed && !locked && { opacity: 0.85, transform: [{ scale: 0.96 }] }]}
              >
                <LinearGradient
                  colors={locked ? ['#3a3a3a', '#2a2a2a'] : [colors.primary, colors.primaryDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.guessFabInner}
                >
                  <Ionicons name="map" size={28} color={colors.white} />
                  <Text style={styles.guessFabText} numberOfLines={1}>{fabText}</Text>
                </LinearGradient>
              </Pressable>
            </Animated.View>
          );
        })()}

        {/* ═══ RESULT BANNER — your distance/points during the answer reveal ═══
            Reuses the singleplayer ClassicEndBanner (web parity: endBanner.js shows
            your distance/points; only the Next-Round button is hidden in MP). One
            render for both the between-rounds 'getready' reveal and the final 'end'
            reveal. RevealView slides it up like singleplayer (and back down on exit). */}
        <RevealView
          visible={!!mpReveal}
          style={[styles.mpBannerWrap, {
            paddingBottom: Math.max(insets.bottom, spacing.md),
            paddingLeft: insets.left,
            paddingRight: insets.right,
          }]}
          translateY={300}
          durationIn={420}
          durationOut={220}
          pointerEvents="none"
        >
          {mpReveal && (
            <ClassicEndBanner
              points={mpReveal.points}
              distance={mpReveal.distance}
              didGuess={mpReveal.didGuess}
              answerCountry={mpReveal.answerCountry}
              guessLat={mpReveal.guessLat}
              guessLng={mpReveal.guessLng}
              totalRounds={gameData?.rounds}
              isFinal={mpReveal.isFinal}
            />
          )}
        </RevealView>

        {/* ═══ GET READY OVERLAY - multiplayer countdown before round ═══ */}
        {/* Skip post-final-round getready: server briefly stays in getready with
            curRound = rounds + 1 before flipping to 'end'. Web suppresses this via
            `curRound <= rounds` (gameUI.js:298). The results screen is more detailed. */}
        {isMultiplayer && gameData?.state === 'getready' && !gameData.duel
          && gameData.curRound > 1 && gameData.curRound <= gameData.rounds && (
          <BetweenRoundsLeaderboard
            gameData={gameData}
            timeOffset={timeOffset}
          />
        )}

        {/* Duel round 1 only — between-round duel getready shows the answer map underneath,
            matching web (components/gameUI.js where health bars stay visible across all states). */}
        {isMultiplayer && gameData?.state === 'getready' && gameData.duel && gameData.curRound === 1 && (
          <GetReadyOverlay
            round={gameData.curRound}
            totalRounds={gameData.rounds}
            nextEvtTime={gameData.nextEvtTime}
            timeOffset={timeOffset}
            generated={gameData.generated ?? gameData.rounds}
          />
        )}
      </Animated.View>

      <DuelWarningModal
        visible={duelWarningVisible}
        onDismiss={() => setDuelWarningVisible(false)}
      />

      {/* ═══ EMOTE REACTIONS — multiplayer, during active play (replaces chat) ═══ */}
      {/* Gated by the settings toggle (mirrors web's multiplayerEmotesEnabled). */}
      {emotesEnabled && isMultiplayer && gameData
        && (gameData.state === 'guess' || gameData.state === 'getready' || gameData.state === 'end') && (
        <EmoteReactions hidden={miniMapShown && !gameState.isShowingResult} hideName={!!gameData.duel} />
      )}

      {/* ═══ LOADING BANNER OVERLAY — shared with onboarding + country guesser ═══ */}
      <GameLoadingOverlay
        opacity={loadingOpacity}
        interactive={showLoadingBanner}
        message={mpInitialGetReady
          ? t('gameStartingIn', { t: gameStartingCountdown.toFixed(1) })
          : undefined}
      />
      </View>
      )}
      <TransitionCurtain sceneKey={isLobby ? 'lobby' : 'game'} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // ── Timer (top right) - matches web .timer.shown ─────────
  timerContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 102,
    alignItems: 'flex-end',
    gap: spacing.xs,
    paddingRight: spacing.lg,
    paddingTop: spacing.sm,
  },
  singleplayerTopRightSlot: {
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  // Bottom-anchored end-banner slot — mirrors GameSurface.endBanner so the MP
  // answer banner pins to the screen bottom (the absolute wrapper owns the
  // anchor + safe-area padding; ClassicEndBanner just flows inside it).
  mpBannerWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1001,
  },
  betweenRoundsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1200,
    // Solid #06100d; the view's animated opacity settles at 0.92 (matches web
    // .leaderboardInRound + .leaderboardShown) so the answer map shows faintly
    // behind and the white player cards carry the contrast.
    backgroundColor: '#06100d',
  },
  betweenRoundsInner: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    alignItems: 'stretch',
    justifyContent: 'center', // vertically centered (web: justify-content: safe center)
    gap: spacing.sm,
  },
  betweenRoundsListWrap: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    marginTop: spacing.md,
  },
  betweenRoundsTitle: {
    color: colors.white,
    fontSize: 30,
    fontFamily: 'Lexend-Bold',
    textAlign: 'center',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  mapSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Platform.OS === 'android' ? '#1a4423' : 'rgba(26, 68, 35, 0.9)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.primary,
    maxWidth: 210,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
    }),
  },
  mapSelectorBtnDisabled: {
    opacity: 0.65,
  },
  mapSelectorText: {
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.sm,
    flexShrink: 1,
  },

  // ── Duel HUD (top center) ──
  duelHudContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 101,
    alignItems: 'center',
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },

  // ── Back button (top left) — matches web red navbar back btn ──
  backButtonContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 102,
    paddingLeft: spacing.lg,
    paddingTop: spacing.sm,
  },
  warningModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.68)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  warningModalCard: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: borderRadius.xl,
    backgroundColor: '#171b18',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.35)',
  },
  warningModalTitle: {
    color: colors.white,
    fontSize: fontSizes.lg,
    fontFamily: 'Lexend-Bold',
  },
  warningModalText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-SemiBold',
    textAlign: 'center',
    lineHeight: 21,
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
    fontFamily: 'Lexend-SemiBold',
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
    fontFamily: 'Lexend-SemiBold',
  },

});
