import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Image,
  ImageBackground,
  StyleSheet,
  Pressable,
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
import { useAuthStore } from '../../src/store/authStore';
import { useMultiplayerStore } from '../../src/store/multiplayerStore';
import { wsService } from '../../src/services/websocket';

import StreetViewWebView from '../../src/components/game/StreetViewWebView';
import GuessMap from '../../src/components/game/GuessMap';
import GameTimer from '../../src/components/game/GameTimer';
import MapSelectorModal from '../../src/components/game/MapSelectorModal';
import GetReadyOverlay from '../../src/components/multiplayer/GetReadyOverlay';
import DuelHUD from '../../src/components/multiplayer/DuelHUD';
import MultiplayerEndBanner from '../../src/components/multiplayer/MultiplayerEndBanner';
import GameChat from '../../src/components/multiplayer/GameChat';
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
  const isSingleplayer = id === 'singleplayer';
  const isMultiplayer = !isSingleplayer;
  const secret = useAuthStore((s) => s.secret);

  // Multiplayer state
  const gameData = useMultiplayerStore((s) => s.gameData);
  const inGame = useMultiplayerStore((s) => s.inGame);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [allLocations, setAllLocations] = useState<Location[]>([]);
  const roundStartTimeRef = useRef<number>(Date.now());

  // Track whether we already sent a guess this round (multiplayer)
  const mpGuessSentRef = useRef(false);

  // Navigate home if multiplayer game shuts down
  useEffect(() => {
    if (isMultiplayer && !inGame) {
      router.dismissAll();
    }
  }, [isMultiplayer, inGame]);

  // Sync multiplayer gameData → local gameState for rendering
  useEffect(() => {
    if (!isMultiplayer || !gameData) return;

    const mpLocations = gameData.locations.map((loc) => ({
      lat: loc.lat,
      long: loc.long,
      country: loc.country,
      panoId: loc.panoId,
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
  const [currentMapName, setCurrentMapName] = useState('All Countries');
  const [nmpzEnabled, setNmpzEnabled] = useState(false);
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [timerDuration, setTimerDuration] = useState(30);
  const [mapModalVisible, setMapModalVisible] = useState(false);

  const [gameState, setGameState] = useState<GameState>({
    currentRound: 1,
    totalRounds: rounds ? parseInt(rounds, 10) : DEFAULT_GAME_OPTIONS.totalRounds,
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
  const showLoadingBanner = isLoading || !streetViewLoaded;

  // Animation values
  const loadingOpacity = useRef(new Animated.Value(1)).current;
  const sceneOpacity = useRef(new Animated.Value(0)).current;
  const mapSlideAnim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = shown
  const mapBtnsAnim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = shown
  const bannerSlideAnim = useRef(new Animated.Value(300)).current;
  const fabScaleAnim = useRef(new Animated.Value(1)).current;
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
        loadingOpacity.setValue(1);
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

  // Map height interpolation: 0 = hidden (0px), 1 = EXPANDED_MAP_HEIGHT_RATIO of screen (or 100% when answer shown)
  const mapHeight = mapSlideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, gameState.isShowingResult ? height : height * EXPANDED_MAP_HEIGHT_RATIO],
  });

  // Fetch locations from server based on currentMapSlug (singleplayer only)
  useEffect(() => {
    if (isMultiplayer) return; // Multiplayer locations come from gameData
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
          setCurrentMapName('All Countries');
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
        setLoadError(error instanceof Error ? error.message : 'Failed to load game');
        setIsLoading(false);
      }
    }

    fetchLocations();
  }, [currentMapSlug]);

  const currentLocation = gameState.locations[gameState.currentRound - 1];

  const handleMapPress = useCallback((lat: number, lng: number) => {
    if (gameState.isShowingResult) return;
    setGuessPosition({ lat, lng });
  }, [gameState.isShowingResult]);

  const handleSubmitGuess = useCallback(() => {
    if (!guessPosition || !currentLocation) return;

    // Multiplayer: send guess to server
    if (isMultiplayer) {
      if (mpGuessSentRef.current) return;
      mpGuessSentRef.current = true;
      wsService.send({
        type: 'place',
        latLong: [guessPosition.lat, guessPosition.lng],
        final: true,
      });
      setMiniMapShown(false);
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
  }, [guessPosition, currentLocation, gameState.maxDist, isMultiplayer]);

  const handleTimeUp = useCallback(() => {
    if (gameState.isShowingResult) return;

    // Multiplayer: server handles time-up, just send current guess if any
    if (isMultiplayer) {
      if (guessPosition && !mpGuessSentRef.current) {
        mpGuessSentRef.current = true;
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

  // Multiplayer: navigate to results when duelEnd arrives or final round ends
  const mpResultsNavigated = useRef(false);
  useEffect(() => {
    if (!isMultiplayer || !gameData) return;
    if (mpResultsNavigated.current) return;
    if (gameData.duelEnd || (gameData.state === 'end' && gameData.curRound >= gameData.rounds)) {
      mpResultsNavigated.current = true;
      // Small delay so user sees the end banner
      const timer = setTimeout(() => {
        router.push({
          pathname: '/game/results',
          params: {
            totalScore: (gameData.players.find((p) => p.id === gameData.myId)?.score ?? 0).toString(),
            rounds: JSON.stringify(gameData.roundHistory ?? []),
            multiplayer: 'true',
            duelEnd: gameData.duelEnd ? JSON.stringify(gameData.duelEnd) : '',
            players: JSON.stringify(gameData.players),
          },
        });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isMultiplayer, gameData?.duelEnd, gameData?.state, gameData?.curRound]);

  const spResultsNavigated = useRef(false);
  const handleNextRound = useCallback(() => {
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
          rounds: JSON.stringify(gameState.guesses),
          extent: gameState.extent ? JSON.stringify(gameState.extent) : '',
        },
      });
      return;
    }

    // Mark that we're doing a manual fade-in so the useEffect doesn't snap opacity
    isManualFadeIn.current = true;
    setStreetViewLoaded(false);

    // Animate loading banner fade-in OVER the map/end banner
    Animated.timing(loadingOpacity, {
      toValue: 1,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      // Only after the banner fully covers the screen, change game state
      // (which removes the map/end banner underneath)
      setGameState((prev) => ({
        ...prev,
        currentRound: prev.currentRound + 1,
        isShowingResult: false,
      }));
      setGuessPosition(null);
      setMiniMapShown(false);
      roundStartTimeRef.current = Date.now();
    });
  }, [gameState, router, secret, isSingleplayer, currentMapSlug, currentMapName]);

  const handleQuit = () => {
    if (isMultiplayer) {
      wsService.send({ type: 'leaveGame' });
      useMultiplayerStore.getState().reset();
    }
    router.dismissAll();
  };

  const handleMapSelect = useCallback((slug: string, name: string) => {
    setMapModalVisible(false);
    if (slug === currentMapSlug) return;
    setIsLoading(true);
    setLoadError(null);
    setCurrentMapSlug(slug);
    setCurrentMapName(name);
    // Full game reset
    setGameState((prev) => ({
      ...prev,
      currentRound: 1,
      guesses: [],
      totalScore: 0,
      isShowingResult: false,
      locations: [],
    }));
    setGuessPosition(null);
    setMiniMapShown(false);
    setStreetViewLoaded(false);
  }, [currentMapSlug]);

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

  // Error state — only show if loading finished with an error (singleplayer only)
  if (isSingleplayer && !isLoading && (loadError || !currentLocation)) {
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
  const mpGetReady = isMultiplayer && gameData?.state === 'getready';
  const showFab = !showLoadingBanner && !miniMapShown && !gameState.isShowingResult && !mpGetReady;
  const scenePointerEvents = showLoadingBanner && !hasCompletedInitialReveal.current ? 'none' : 'box-none';

  return (
    <View style={styles.container}>
      <Animated.View
        style={[StyleSheet.absoluteFillObject, { opacity: sceneOpacity }]}
        pointerEvents={scenePointerEvents}
      >
        {/* Street View - FULLSCREEN */}
        <View style={StyleSheet.absoluteFillObject}>
          {currentLocation && (
            <StreetViewWebView
              lat={currentLocation.lat}
              long={currentLocation.long}
              onLoad={handleStreetViewLoad}
              nmpz={isMultiplayer ? (gameData?.nm ?? false) : nmpzEnabled}
            />
          )}
        </View>

        {/* Round/score/timer pill + map selector - top right */}
        {!gameState.isShowingResult && (
          <SafeAreaView style={[styles.timerContainer, { paddingRight: Math.max(insets.right, spacing.lg) }]} edges={['top']} pointerEvents="box-none">
            {/* Map selector button (singleplayer only) */}
            {isSingleplayer && (
              <Pressable
                style={({ pressed }) => [styles.mapSelectorBtn, pressed && { opacity: 0.85 }]}
                onPress={() => setMapModalVisible(true)}
              >
                <Text style={styles.mapSelectorText} numberOfLines={1}>
                  {currentMapName}{nmpzEnabled ? ', NMPZ' : ''}
                </Text>
                <Ionicons name="pencil" size={14} color="rgba(255,255,255,0.7)" />
              </Pressable>
            )}
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
              timeOffset={isMultiplayer ? wsService.timeOffset : undefined}
            />
          </SafeAreaView>
        )}

        {/* Back button - top left (matches web navbar red back button) */}
        <SafeAreaView style={[styles.backButtonContainer, { paddingLeft: Math.max(insets.left, spacing.lg) }]} edges={['top']} pointerEvents="box-none">
          <Pressable
            style={({ pressed }) => [
              styles.backButton,
              pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] },
            ]}
            onPress={handleQuit}
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
        </SafeAreaView>

        {/* ═══ DUEL HUD - shown during duel games ═══ */}
        {isMultiplayer && gameData?.duel && !gameState.isShowingResult && gameData.state === 'guess' && (
          <SafeAreaView
            style={[styles.duelHudContainer, { paddingLeft: Math.max(insets.left, spacing.md), paddingRight: Math.max(insets.right, spacing.md) }]}
            edges={['top']}
            pointerEvents="none"
          >
            <DuelHUD players={gameData.players} myId={gameData.myId} />
          </SafeAreaView>
        )}

        {/* ═══ MAP OVERLAY - slides up from bottom ═══ */}
        <Animated.View
          style={[
            styles.mapOverlay,
            { height: mapHeight },
          ]}
          pointerEvents={miniMapShown || gameState.isShowingResult ? 'auto' : 'none'}
        >
          {/* Inner wrapper gives MapView a fixed height so initialRegion works
              even when the animated outer container starts at 0px height.
              Use EXPANDED_MAP_HEIGHT_RATIO height during gameplay so MKMapView's native gesture recognizers
              don't extend into the Guess button area (iOS ignores overflow:hidden for
              native gesture hit-testing). Full height during results (no buttons). */}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: gameState.isShowingResult ? height : height * EXPANDED_MAP_HEIGHT_RATIO }}>
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
                extent={gameState.extent}
                guessPoints={gameState.guesses[gameState.currentRound - 1]?.points}
                opponentGuesses={
                  isMultiplayer && gameState.isShowingResult && gameData
                    ? gameData.players
                        .filter((p) => p.id !== gameData.myId && p.latLong && p.latLong[0] !== 0)
                        .map((p) => ({
                          lat: p.latLong![0],
                          lng: p.latLong![1],
                          username: p.username,
                          points: calcPoints({
                            lat: currentLocation.lat,
                            lon: currentLocation.long,
                            guessLat: p.latLong![0],
                            guessLon: p.latLong![1],
                            maxDist: gameState.maxDist,
                          }),
                        }))
                    : undefined
                }
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
              { bottom: height * EXPANDED_MAP_HEIGHT_RATIO + 8, paddingHorizontal: Math.max(insets.right, spacing.md) },
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
                right: Math.max(insets.right, 60),
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
        {gameState.isShowingResult && isMultiplayer && gameData && currentLocation && (
          <View style={{ paddingBottom: Math.max(insets.bottom, spacing.lg) }}>
            <MultiplayerEndBanner
              round={gameState.currentRound}
              totalRounds={gameState.totalRounds}
              players={gameData.players}
              myId={gameData.myId}
              location={currentLocation}
              maxDist={gameState.maxDist}
              duel={gameData.duel}
              isAutoTransition={true}
            />
          </View>
        )}

        {/* Singleplayer end banner */}
        {gameState.isShowingResult && isSingleplayer && lastGuess && (
          <Animated.View
            style={[
              styles.endBanner,
              {
                transform: [{ translateY: bannerSlideAnim }],
                paddingBottom: Math.max(insets.bottom, spacing.lg),
                paddingLeft: insets.left,
                paddingRight: insets.right,
              },
            ]}
          >
            <View style={styles.endBannerContent}>
              <Text style={styles.endBannerRound}>
                Round {gameState.currentRound}/{gameState.totalRounds}
              </Text>
              <Text style={styles.endBannerDistance}>
                {lastGuess.guessLat === 0 && lastGuess.guessLong === 0
                  ? "You didn't guess"
                  : lastGuess.distance >= 1
                    ? `Your guess was ${formatDist(lastGuess.distance)} away`
                    : `Your guess was ${Math.round(lastGuess.distance * 1000)} m away`
                }
              </Text>
              <Text style={[styles.endBannerPoints, { color: getPointsColor(lastGuess.points) }]}>
                {lastGuess.points.toLocaleString()} points
              </Text>
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

        {/* ═══ GET READY OVERLAY - multiplayer countdown before round ═══ */}
        {isMultiplayer && gameData?.state === 'getready' && (
          <GetReadyOverlay
            round={gameData.curRound}
            totalRounds={gameData.rounds}
            nextEvtTime={gameData.nextEvtTime}
            timeOffset={wsService.timeOffset}
            generated={gameData.generated ?? gameData.rounds}
          />
        )}
      </Animated.View>

      {/* ═══ GAME CHAT - multiplayer non-duel games ═══ */}
      {isMultiplayer && !gameData?.duel && gameData?.state === 'guess' && (
        <GameChat />
      )}

      {/* ═══ LOADING BANNER OVERLAY — initial load & between rounds ═══ */}
      <Animated.View
        style={[
          styles.loadingBannerOverlay,
          { opacity: loadingOpacity },
        ]}
        pointerEvents={showLoadingBanner ? 'auto' : 'none'}
      >
        <ImageBackground
          source={require('../../assets/street2.jpg')}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />
        <View style={styles.loadingDarkOverlay} />
        <View style={styles.loadingBannerContent}>
          <Image source={require('../../assets/loader.gif')} style={styles.loadingSpinner} />
          <Text style={styles.loadingBannerText}>Loading...</Text>
        </View>
      </Animated.View>

      {/* ═══ MAP SELECTOR MODAL (singleplayer) ═══ */}
      {isSingleplayer && (
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
        />
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
    fontFamily: 'Lexend-Medium',
  },
  errorText: {
    marginTop: spacing.lg,
    fontSize: fontSizes.md,
    color: colors.error,
    textAlign: 'center',
    fontFamily: 'Lexend-Medium',
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
    fontFamily: 'Lexend-SemiBold',
    color: colors.white,
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
  mapSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Platform.OS === 'android' ? '#1a4423' : 'rgba(26, 68, 35, 0.85)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    maxWidth: 180,
  },
  mapSelectorText: {
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.xs,
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
    fontFamily: 'Lexend-SemiBold',
    textAlign: 'center',
  },
  endBannerDistance: {
    color: colors.white,
    fontSize: fontSizes.lg,
    fontFamily: 'Lexend-SemiBold',
    textAlign: 'center',
  },
  endBannerPoints: {
    fontSize: fontSizes['2xl'],
    fontFamily: 'Lexend-Bold',
    textAlign: 'center',
  },
  endBannerTotal: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-Medium',
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
    fontFamily: 'Lexend-SemiBold',
  },

  // ── Loading Banner Overlay ─────────────────────────────────
  loadingBannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#08120d',
  },
  loadingDarkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  loadingBannerCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loadingSpinner: {
    width: 80,
    height: 80,
  },
  loadingBannerText: {
    color: '#fff',
    fontSize: 42,
    fontFamily: 'Lexend-Bold',
  },
});
