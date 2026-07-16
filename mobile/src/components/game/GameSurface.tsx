import {
  forwardRef,
  ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  InteractionManager,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Pressable } from '../ui/SfxPressable';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../../shared';
import { t } from '../../shared/locale';
import { borderRadius, fontSizes, spacing } from '../../styles/theme';
import { gameUiScale, isTabletSize } from '../../styles/responsive';
import StreetViewWebView, { StreetViewHandle } from './StreetViewWebView';
import EmbeddedMap from './EmbeddedMap';
import ReloadButton from '../ui/ReloadButton';
import { haptics } from '../../services/haptics';
import { playSfx, preloadSfx, stopSfx } from '../../services/sound';
import { calcPoints } from '../../shared/game/calcPoints';
import { useSettingsStore } from '../../store/settingsStore';
import CountryButtons from './CountryButtons';
import GameLoadingOverlay from './GameLoadingOverlay';

/**
 * GameSurface — the shared visual shell for any round-based geo-guessing
 * variant. Owns the polished animations from the classic singleplayer screen
 * (`app/game/[id].tsx`) so onboarding + country-guesser inherit them for free:
 *
 *   • Loading overlay crossfade (200 ms in, 600 ms out after a 400 ms grace)
 *   • Scene fade-in on first reveal (550 ms easeOutCubic)
 *   • Map slide-up spring (friction 10 / tension 80) when result OR mini-map
 *   • Map button row spring (friction 8 / tension 50) when mini-map shown
 *   • Banner slide-up spring (friction 8 / tension 50, JS-driven so taps land)
 *   • Guess FAB pop-in spring on first appearance only
 *
 * Variants:
 *   `pin`        — classic geo-guessr: tap map to drop pin, Guess button.
 *   `country`    — choose-the-country: button grid with flags.
 *   `continent`  — choose-the-continent: 6-button grid.
 *
 * For non-pin variants, the actual location's pin is still rendered on the
 * map during result so the player gets the same "see where you missed by"
 * payoff as classic mode.
 */

interface Location {
  lat: number;
  long: number;
  country?: string;
  heading?: number | null;
  pitch?: number;
}

type Extent = [number, number, number, number] | null;

/**
 * A pano's identity for the loading-reset effect. Defined once so the
 * committed-preload guard compares the exact same string the effect computes.
 */
const fingerprintOf = (loc: Location | null) =>
  loc ? `${loc.lat}|${loc.long}|${loc.heading ?? ''}|${loc.pitch ?? ''}` : 'empty';

export type GameVariant = 'pin' | 'country' | 'continent';

export interface GameSurfaceHandle {
  /**
   * Run the same flicker-free round transition that classic singleplayer
   * uses. Fades the loading banner IN over the current scene first, and
   * only invokes `onCovered` once the banner is fully opaque — at which
   * point it's safe to swap state (round++, isShowingResult=false). The
   * banner then fades out automatically once the new panorama paints.
   */
  beginRoundTransition: (onCovered: () => void) => void;
}

interface GameSurfaceProps {
  /** Current round's location. */
  location: Location | null;
  /**
   * Next round's location. While the result screen is up, it's warmed in a
   * hidden Street View slot so tapping "Next" crossfades into an already-loaded
   * pano with no loading cover. Pass null to disable (final round, or modes
   * without a known-ahead next location — they fall back to the loading cover).
   */
  nextLocation?: Location | null;
  /** Map bounding box; `null` falls back to a world view (matches web). */
  extent?: Extent;
  /** Colors the guess→actual line in pin mode (fallback LeafletMap only). */
  guessPoints?: number;
  /** Tells the surface to show the map & end banner instead of the input UI. */
  isShowingResult: boolean;
  /** Round-keyed identifier so animations know when to reset. */
  roundKey: string | number;

  variant: GameVariant;

  // ── pin variant ─────────────────────────────────────────────────────────
  guessPosition?: { lat: number; lng: number } | null;
  onGuessPositionChange?: (p: { lat: number; lng: number }) => void;
  onSubmitPin?: () => void;

  // ── country / continent variants ────────────────────────────────────────
  countryOptions?: string[];
  countryPicked?: string | null;
  /** ISO-2 (country) or continent name — the answer we'll mark as correct. */
  correctAnswer?: string | null;
  /** Center point for a wrong country guess. Country mode only. */
  countryGuessPosition?: { lat: number; lng: number } | null;
  onAnswerCountry?: (answer: string) => void;

  // ── slot props ──────────────────────────────────────────────────────────
  topLeftSlot?: ReactNode;
  topCenterSlot?: ReactNode;
  topRightSlot?: ReactNode;
  /** Rendered inside the bottom-anchored animated banner when isShowingResult. */
  endBannerContent?: ReactNode;
  /** Defaults to "Loading round…" — override per variant. */
  loadingMessage?: string;
  loadingError?: string | null;
  onLoadingRetry?: () => void;
  loadingRetryLabel?: string;
  /** Back/leave handler shown on the loading cover (see GameLoadingOverlay.onBack).
   *  Pass only for modes where bailing mid-load is safe (singleplayer). */
  onLoadingBack?: () => void;
  /**
   * Suppresses the FAB / map / country buttons. Useful when a parent overlay
   * (e.g. onboarding's WelcomeOverlay) is up and we don't want input UI
   * peeking through the dim backdrop.
   */
  hideInputs?: boolean;
  /** When showing the result, collapse the map to reveal the answer's pano. */
  showPanoOnResult?: boolean;
  // ── hint (pin variant) ───────────────────────────────────────────────────
  onHint?: () => void;
  hintShown?: boolean;
  /** True when the 2-per-game hint limit is reached. */
  hintDisabled?: boolean;
  hintCircleData?: { center: { lat: number; lng: number }; radiusMeters: number } | null;
  /** Map mode max distance (km) — scales the embed hint circle radius. */
  maxDist?: number;
  /** Current round number — seeds the embed hint circle offset (matches web). */
  round?: number;
  /** Shows the blue "reload street view" button (web parity). Default on. */
  enableReload?: boolean;
  /** Locks Street View pan/zoom (web NMPZ — "No Move, Pan, Zoom"). */
  nmpz?: boolean;
}

/** Fraction of screen height the expanded minimap occupies during gameplay (0–1). */
export const EXPANDED_MAP_HEIGHT_RATIO = 0.65;
export const EXPANDED_MAP_LANDSCAPE_HEIGHT_RATIO = 0.6;

/**
 * Shared computation for the expanded (mini) guess-map height so the
 * singleplayer surface and the multiplayer screen in `app/game/[id].tsx`
 * stay in sync. Landscape uses a taller ratio since vertical space is scarce.
 */
export function getExpandedMapHeight(width: number, height: number): number {
  return (
    height *
    (width > height ? EXPANDED_MAP_LANDSCAPE_HEIGHT_RATIO : EXPANDED_MAP_HEIGHT_RATIO)
  );
}

function GameSurface(
  {
    location,
    nextLocation = null,
    extent = null,
    guessPoints,
    isShowingResult,
    roundKey,
    variant,
    guessPosition,
    onGuessPositionChange,
    onSubmitPin,
    countryOptions = [],
    countryPicked = null,
    correctAnswer = null,
    countryGuessPosition = null,
    onAnswerCountry,
    topLeftSlot,
    topCenterSlot,
    topRightSlot,
    endBannerContent,
    loadingMessage,
    loadingError,
    onLoadingRetry,
    loadingRetryLabel,
    onLoadingBack,
    hideInputs = false,
    showPanoOnResult = false,
    onHint,
    hintShown = false,
    hintDisabled = false,
    hintCircleData = null,
    maxDist,
    round,
    enableReload = true,
    nmpz = false,
  }: GameSurfaceProps,
  ref: React.Ref<GameSurfaceHandle>,
) {
  const insets = useSafeAreaInsets();
  const streetViewRef = useRef<StreetViewHandle>(null);
  const mapType = useSettingsStore((s) => s.mapType);
  const language = useSettingsStore((s) => s.language);
  const { width, height } = useWindowDimensions();
  // Tablet scaling for the in-game controls (Guess FAB, map-row buttons). Fixed
  // px controls read small on an iPad; bump them up. Phones: sc is 1.0× (no-op).
  const isTablet = isTabletSize(width, height);
  const uiScale = gameUiScale(width, height);
  const sc = (v: number) => Math.round(v * uiScale * 2) / 2;

  const expandedMapHeight = getExpandedMapHeight(width, height);
  // True full-screen height for the result reveal. Under Android edge-to-edge,
  // useWindowDimensions().height excludes the status-bar strip, so a bottom-anchored
  // map of just `height` stops `insets.top` short of the top — leaving a gap during
  // the full-screen show-answer reveal. Add the top inset back so the reveal is
  // genuinely edge-to-edge (harmless overshoot if `height` already covers it).
  const fullMapHeight = height + insets.top;
  // mapSlideAnim value for the open mini-map. Because mapHeight interpolates to a
  // CONSTANT full-height range, the mini state is this fraction — so reveal can
  // animate the height smoothly from mini → full instead of jumping.
  const miniFraction = fullMapHeight > 0 ? expandedMapHeight / fullMapHeight : 0.5;

  // ── State ──────────────────────────────────────────────────────────────
  const [streetViewLoaded, setStreetViewLoaded] = useState(false);
  const [miniMapShown, setMiniMapShown] = useState(false);
  const [mapMounted, setMapMounted] = useState(false);

  // Defer the StreetView WebView mount until the screen-transition animation
  // settles. Mounting a WebView is heavy enough to block the incoming screen's
  // first paint — that's what left the black/blank gap during the slide into a
  // game mode, before the street2 loading overlay (zIndex 2000) could show.
  // Holding the WebView back one tick lets the preloaded overlay paint instantly;
  // the WebView then mounts behind it and the overlay fades out once it loads.
  const [canMountStreetView, setCanMountStreetView] = useState(false);
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      setCanMountStreetView(true);
    });
    return () => handle.cancel();
  }, []);

  // Reset only when the panorama actually changes — not on every roundKey
  // bump. Mode switches (country ↔ classic during onboarding) re-key the
  // round but keep the same lat/long, and we don't want a stale "Loading…"
  // flash over a panorama that's already painted.
  const panoFingerprint = fingerprintOf(location);
  const lastFingerprint = useRef(panoFingerprint);
  // A round transition commits the PRELOADED next pano (already loaded) and flips
  // streetViewLoaded true under the cover so the next round's inputs come back.
  // When `location` then advances to that pano this effect must NOT treat it as a
  // fresh load and reset streetViewLoaded=false — for a 'ready' commit there is no
  // later onLoad to flip it back, so the FAB / country buttons would stay hidden.
  const committedPreloadFingerprintRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastFingerprint.current === panoFingerprint) return;
    if (committedPreloadFingerprintRef.current === panoFingerprint) {
      lastFingerprint.current = panoFingerprint;
      committedPreloadFingerprintRef.current = null;
      return; // committed preload — already loaded/visible; keep streetViewLoaded
    }
    lastFingerprint.current = panoFingerprint;
    setStreetViewLoaded(false);
    setMiniMapShown(false);
  }, [panoFingerprint]);

  // Mini-map should still close when the round changes even if the panorama
  // happens to be the same (defensive — shouldn't happen in real play).
  useEffect(() => {
    setMiniMapShown(false);
  }, [roundKey]);

  // Lazily mount the map so first-touch isn't swallowed (matches game/[id].tsx)
  useEffect(() => {
    if (streetViewLoaded && !mapMounted) {
      const t = setTimeout(() => setMapMounted(true), 300);
      return () => clearTimeout(t);
    }
  }, [streetViewLoaded, mapMounted]);

  // Decode the reveal whoosh before the first submit (web Map.js
  // ClickHandler-mount parity). The pin is NOT preloaded natively — it plays
  // inside the embed WebView (shim decodes it there on the host gain push).
  useEffect(() => {
    preloadSfx('guess');
  }, []);

  // Answer-reveal whoosh, centralized for every GameSurface mode (web
  // gameUI.js keys this on showAnswer for singleplayer/daily/onboarding
  // alike; multiplayer never mounts GameSurface — its server-timed reveal
  // lives in [id].tsx). Pitch carries MEANING so `rate` is deterministic,
  // never jittered: pin rounds recompute the score fraction FROM THE PIN with
  // usedHint:false (web gameUI.js guessRevealRate — pitch cues raw geographic
  // accuracy, so a hint-halved score must not drop the pitch; no pin = never
  // guessed = floor), country/continent rounds are binary (web parity). Two
  // guards: only a false→true flip plays (a results-view mount starts true
  // and must stay silent), and the roundKey latch stops replays from
  // result-time re-renders (pano toggle, rotation).
  const prevShowingResultRef = useRef(isShowingResult);
  const revealSfxKeyRef = useRef<string | number | null>(null);
  useEffect(() => {
    const was = prevShowingResultRef.current;
    prevShowingResultRef.current = isShowingResult;
    if (!isShowingResult || was) return;
    const key = roundKey ?? round ?? 0;
    if (revealSfxKeyRef.current === key) return;
    revealSfxKeyRef.current = key;
    const quality =
      variant === 'pin'
        ? location && guessPosition
          ? Math.min(
              1,
              calcPoints({
                lat: location.lat,
                lon: location.long,
                guessLat: guessPosition.lat,
                guessLon: guessPosition.lng,
                usedHint: false,
                maxDist: maxDist ?? 20000,
              }) / 5000,
            )
          : 0
        : countryPicked && correctAnswer && countryPicked === correctAnswer
          ? 1
          : 0;
    stopSfx('ticking'); // the round-clock bed must never survive into the reveal
    playSfx('guess', { rate: 0.85 + 0.35 * quality });
  }, [isShowingResult, roundKey, round, variant, location, guessPosition, maxDist, countryPicked, correctAnswer]);

  // ── Animations ─────────────────────────────────────────────────────────
  const loadingOpacity = useRef(new Animated.Value(1)).current;
  const sceneOpacity = useRef(new Animated.Value(0)).current;
  const mapSlideAnim = useRef(new Animated.Value(0)).current;
  const mapBtnsAnim = useRef(new Animated.Value(0)).current;
  const bannerSlideAnim = useRef(new Animated.Value(300)).current;
  const fabScaleAnim = useRef(new Animated.Value(1)).current;

  const hasCompletedInitialReveal = useRef(false);
  const isManualFadeIn = useRef(false);
  const fabHasAnimated = useRef(false);
  const fadeOutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showLoadingBanner = !streetViewLoaded;

  // Loading banner crossfade — direct port of game/[id].tsx:230-263.
  // While a round transition is driving the cover manually (isManualFadeIn), this
  // effect stays out of its way ENTIRELY: the transition flips streetViewLoaded
  // true early — to bring the next round's UI back behind the cover before it
  // lifts — and we must not also schedule a fade-out in response. The transition
  // clears isManualFadeIn when it hands control back.
  useEffect(() => {
    if (fadeOutTimer.current) {
      clearTimeout(fadeOutTimer.current);
      fadeOutTimer.current = null;
    }
    if (isManualFadeIn.current) return;
    if (showLoadingBanner) {
      Animated.timing(loadingOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
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

  // Scene fade-in on first reveal — port of game/[id].tsx:265-285
  useEffect(() => {
    if (showLoadingBanner) {
      if (!hasCompletedInitialReveal.current) sceneOpacity.setValue(0);
      return;
    }
    if (!hasCompletedInitialReveal.current) {
      Animated.timing(sceneOpacity, {
        toValue: 1,
        duration: 550,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) hasCompletedInitialReveal.current = true;
      });
    }
  }, [showLoadingBanner, sceneOpacity]);

  const isCountryVariant = variant === 'country' || variant === 'continent';

  // Map fade — tracks `mapSlideAnim` for pin (height + presence) but for
  // country / continent we want NO slide-up, NO double-zoom. Snap the
  // height immediately so the map view occupies its full footprint, and
  // crossfade its opacity in/out via `mapOpacity`. Round transitions for
  // country mode use the loading-banner cover, so the map's static height
  // never produces a jump.
  // `mapOpacity` runs 0 -> 1 during reveal and drives the scrim's inverse
  // opacity (max 0.55, not 1). Capping the scrim well below 1 means the
  // map is partially visible from the very first frame.
  // The pin-variant map keeps its WebView full-screen and only resizes an in-page
  // band on reveal. We hold the clip at its current size until the embed signals —
  // PRECISELY, not on a guessed timer — that the in-page resize is finished, then
  // snap to full. The timeout is only a safety net (e.g. the inline fallback map,
  // which never signals).
  const [mapRevealReady, setMapRevealReady] = useState(false);
  const handleRevealReady = useCallback(() => setMapRevealReady(true), []);
  useEffect(() => {
    if (isCountryVariant) return; // country reveals crossfade a full-size map; no gate
    if (!isShowingResult) {
      setMapRevealReady(false);
      return;
    }
    const t = setTimeout(() => setMapRevealReady(true), 700);
    return () => clearTimeout(t);
  }, [isShowingResult, isCountryVariant]);

  const mapOpacity = useRef(new Animated.Value(0)).current;
  // Result → next-round map exits happen entirely under the loading cover
  // (beginRoundTransition) and are never meant to be seen — but the cover's
  // fade-out is native-driven while these exits animate height/opacity on the
  // JS thread, which the round advance keeps busy. Under that load a 200ms
  // exit can still be mid-flight when the cover lifts, flashing a sliver of
  // the result map sliding out. Snap exits instead of animating them.
  const wasShowingResult = useRef(false);
  useEffect(() => {
    const exitingResult = wasShowingResult.current && !isShowingResult;
    wasShowingResult.current = isShowingResult;
    if (isCountryVariant) {
      // Pure opacity fade-in, mirroring web's `mapFadeReveal` (opacity 0 -> 1)
      // for #miniMapArea.countryGuessrMapReveal. The map is SNAPPED to full size
      // (mapSlideAnim = 1, no slide) and the whole overlay simply fades in —
      // slow & smooth, no dim, no slide. The Leaflet camera glides to the answer
      // underneath the fade.
      mapSlideAnim.setValue(isShowingResult ? 1 : 0);
      if (exitingResult) {
        mapOpacity.stopAnimation();
        mapOpacity.setValue(0);
        return;
      }
      Animated.timing(mapOpacity, {
        toValue: isShowingResult ? 1 : 0,
        // Snappy fade-in (still smooth), quick fade-out.
        duration: isShowingResult ? 550 : 260,
        easing: Easing.inOut(Easing.ease),
        // JS-driven to match the overlay's animated `height` prop on the same
        // node (mixing native + JS drivers on one view is unsupported).
        useNativeDriver: false,
      }).start();
      return;
    }

    // Pin variant. The map WebView is kept FULL-SCREEN at all times (see the map
    // overlay JSX) and merely clipped to a bottom band while guessing — so the
    // result reveal is a pure clip change with NO WebView resize. That's what
    // lets us snap straight to a full-screen map in ONE frame: instant, with no
    // reflow glitch and no flash. Leaflet then flies to the answer underneath.
    // The result→next-round exit happens under the loading cover (see
    // beginRoundTransition) and is snapped, not animated (exitingResult below),
    // so the height collapse can never outlive the cover.
    mapOpacity.setValue(1);
    if (isShowingResult && !showPanoOnResult) {
      // Slide the clip up to full ONLY once the embed says its in-page resize is
      // done (so an un-resized map is never revealed). The embed has pinned the
      // guessing content in place (no re-center jump), so this is a clean slide
      // that just reveals more map above — and since the WebView is already
      // full-size, the height animation does no per-frame re-fit, staying smooth.
      if (mapRevealReady) {
        Animated.timing(mapSlideAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
      }
    } else if (isShowingResult && showPanoOnResult) {
      // "Show Street View" toggle — collapse the map to reveal the answer pano.
      Animated.timing(mapSlideAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    } else if (miniMapShown) {
      Animated.spring(mapSlideAnim, {
        toValue: miniFraction,
        friction: 10,
        tension: 80,
        useNativeDriver: false,
      }).start();
    } else if (exitingResult) {
      // Hidden behind the loading cover — snap (see note above the effect).
      mapSlideAnim.stopAnimation();
      mapSlideAnim.setValue(0);
    } else {
      Animated.timing(mapSlideAnim, {
        toValue: 0,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }
  }, [miniMapShown, isShowingResult, isCountryVariant, showPanoOnResult, mapRevealReady]);

  // Map button row spring.
  // stopAnimation() first so a rapid re-open never stacks on an in-flight
  // collapse tween (which would jitter the spring). The mount-time flash on
  // spam is prevented separately by resetting mapBtnsAnim to 0 in handleOpenMap,
  // before this conditionally-rendered row re-mounts.
  useEffect(() => {
    mapBtnsAnim.stopAnimation();
    if (miniMapShown && !isShowingResult) {
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
  }, [miniMapShown, isShowingResult]);

  // Banner: fade + gentle slide. useNativeDriver: false because the same
  // value drives a layout transform that affects touch targets.
  useEffect(() => {
    if (isShowingResult) {
      bannerSlideAnim.setValue(300);
      Animated.timing(bannerSlideAnim, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    } else {
      // Result → next-round exit is under the loading cover (every GameSurface
      // flow advances via beginRoundTransition) — snap for the same reason as
      // the map exits above: a JS-driven slide-out can outlive the cover.
      bannerSlideAnim.stopAnimation();
      bannerSlideAnim.setValue(300);
    }
  }, [isShowingResult]);

  // FAB pop-in (pin variant only)
  useEffect(() => {
    if (variant !== 'pin') return;
    if (!streetViewLoaded || miniMapShown || isShowingResult) return;
    if (fabHasAnimated.current) return;
    fabHasAnimated.current = true;
    fabScaleAnim.setValue(0);
    Animated.spring(fabScaleAnim, {
      toValue: 1,
      friction: 5,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [streetViewLoaded, miniMapShown, isShowingResult, variant]);

  // ── Derived ────────────────────────────────────────────────────────────
  const mapHeight = mapSlideAnim.interpolate({
    inputRange: [0, 1],
    // CONSTANT range (not swapped on result) so reveal animates mini→full
    // smoothly (mapSlideAnim miniFraction → 1) instead of jumping.
    outputRange: [0, fullMapHeight],
  });

  const showFab =
    variant === 'pin' && !showLoadingBanner && !miniMapShown && !isShowingResult && !hideInputs;
  const showCountryInputs =
    (variant === 'country' || variant === 'continent') &&
    !showLoadingBanner &&
    !isShowingResult &&
    !hideInputs;
  // Reload button: shown while the pano is loaded and the player is actively
  // guessing — mirrors web's reloadBtn conditions (active round, not result).
  const showReload = enableReload && !showLoadingBanner && !isShowingResult && !hideInputs;

  // Fade the country-button dock and the FAB in/out instead of hard-mounting
  // so round transitions do not pop.
  const inputsFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(inputsFade, {
      toValue: showCountryInputs || showFab ? 1 : 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [showCountryInputs, showFab]);

  // For non-pin variants on result, show the actual location pin on the map.
  const actualPosition =
    isShowingResult && location ? { lat: location.lat, lng: location.long } : undefined;

  // For pin variant, also show the player's guess pin on result.
  const computedGuessPosition =
    variant === 'pin' ? guessPosition ?? null : null;

  const scenePointerEvents =
    showLoadingBanner && !hasCompletedInitialReveal.current ? 'none' : 'box-none';

  const handleStreetViewLoad = useCallback(() => setStreetViewLoaded(true), []);
  const handleOpenMap = useCallback(() => {
    haptics.light();
    // Reset the buttons-row anim to hidden BEFORE the row re-mounts, so
    // spamming open/close can't flash a stale mid-collapse opacity.
    // stopAnimation() cancels any in-flight fade so the spring starts clean.
    mapBtnsAnim.stopAnimation();
    mapBtnsAnim.setValue(0);
    setMiniMapShown(true);
  }, []);
  const handleCloseMap = useCallback(() => {
    haptics.light();
    setMiniMapShown(false);
  }, []);

  const handleSubmitPin = useCallback(() => {
    onSubmitPin?.();
    setMiniMapShown(false);
  }, [onSubmitPin]);

  // Imperative handle for advancing to the next round.
  //
  // The opaque loading cover is the single source of smoothness: it fades IN over
  // the current scene, then EVERYTHING messy happens hidden beneath it — the
  // result map collapses, the Street-View slot is swapped, the embed re-renders —
  // and the cover fades back OUT to reveal the next round. The user only ever sees
  // one clean fade, never a flash or leftover frame of the old round.
  //
  // The win over the old flow is purely duration: `commitPreload()` snaps the
  // PRELOADED next pano (warmed during the result screen via `nextLocation`) to
  // the active slot, so when it's 'ready' the pano is already painted and we fade
  // the cover right back out — no waiting on a network load. 'pending' (warm slot
  // still loading) and 'none' (no preload — country/onboarding final round, pool
  // exhaustion) keep the cover up until the pano paints (its onLoad → the reactive
  // fade-out), exactly like the classic flow.
  const transitionInFlight = useRef(false);
  useImperativeHandle(ref, () => ({
    beginRoundTransition: (onCovered) => {
      if (transitionInFlight.current) return; // ignore double-taps of Next
      transitionInFlight.current = true;

      // Fade the cover IN ourselves (isManualFadeIn suppresses the reactive
      // showLoadingBanner fade-in so the two never fight).
      isManualFadeIn.current = true;
      setStreetViewLoaded(false);
      Animated.timing(loadingOpacity, {
        toValue: 1,
        duration: 280,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        // Fully covered — the swap, map collapse and embed re-render are invisible.
        const status = streetViewRef.current?.commitPreload() ?? 'none';
        if (status !== 'none') {
          // The next `location` IS this committed (already-loaded) pano — tell the
          // panoFingerprint effect not to reset streetViewLoaded when it advances.
          committedPreloadFingerprintRef.current = fingerprintOf(nextLocation);
        }
        onCovered(); // advance the round under the cover
        transitionInFlight.current = false;

        if (status === 'ready') {
          // Next pano was warmed during the result screen and is already painted.
          // Flip streetViewLoaded NOW (while still fully covered) so the next
          // round's UI — FAB / country buttons / reload — fades back in BEHIND the
          // cover and is already in place when it lifts (no late snap). The reactive
          // effect ignores this because isManualFadeIn is still true. Then reveal
          // with a short, snappy fade (skipping the grace a fresh pano would need).
          setStreetViewLoaded(true);
          Animated.timing(loadingOpacity, {
            toValue: 0,
            duration: 340,
            delay: 90,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start(() => {
            isManualFadeIn.current = false;
          });
        } else {
          // 'pending'/'none': streetViewLoaded stays false; hand the cover back to
          // the reactive effect, which fades it out (and brings the UI back) once
          // the pano's onLoad flips streetViewLoaded true.
          isManualFadeIn.current = false;
        }
      });
    },
  }));

  return (
    <View style={styles.root}>
      <Animated.View
        style={[StyleSheet.absoluteFillObject, { opacity: sceneOpacity }]}
        pointerEvents={scenePointerEvents}
      >
        {/* Street view */}
        <View style={StyleSheet.absoluteFillObject}>
          {location && canMountStreetView && (
            <StreetViewWebView
              ref={streetViewRef}
              lat={location.lat}
              long={location.long}
              heading={location.heading ?? undefined}
              pitch={location.pitch}
              nmpz={nmpz}
              onLoad={handleStreetViewLoad}
              // Warm the next round's pano in the hidden slot while the result
              // map is up. Mirror the visible props exactly so committing it then
              // advancing `location` matches the source key (no reload).
              preload={
                isShowingResult && nextLocation
                  ? {
                      lat: nextLocation.lat,
                      long: nextLocation.long,
                      heading: nextLocation.heading ?? undefined,
                      pitch: nextLocation.pitch,
                    }
                  : null
              }
            />
          )}
        </View>

        {/* Top-left / center / right slots — provided by parent. The blue
            reload button (web parity) sits to the right of the back button
            while the pano is loaded and the player is actively guessing. */}
        {(topLeftSlot || showReload) && (
          <SafeAreaView edges={['top']} style={styles.topLeft} pointerEvents="box-none">
            <View style={styles.topLeftStack} pointerEvents="box-none">
              {topLeftSlot}
              {showReload && (
                <ReloadButton onPress={() => streetViewRef.current?.reload()} />
              )}
            </View>
          </SafeAreaView>
        )}
        {topCenterSlot && (
          <SafeAreaView edges={['top']} style={styles.topCenter} pointerEvents="box-none">
            {topCenterSlot}
          </SafeAreaView>
        )}

        {/* Map overlay — for pin variant, animates height (slide-up); for
            country/continent, the height is snapped to full and the whole
            overlay fades in (web `mapFadeReveal` parity) — slow & smooth, no
            slide, no dim. */}
        <Animated.View
          style={[
            styles.mapOverlay,
            { height: mapHeight },
            isCountryVariant && { opacity: mapOpacity },
          ]}
          pointerEvents={miniMapShown || isShowingResult ? 'auto' : 'none'}
        >
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              // The WebView's native frame is kept FULL-SCREEN and bottom-anchored
              // at ALL times; the outer clip above reveals only its bottom band
              // while guessing and snaps to full on result. Because the native
              // frame never resizes, the result reveal can't produce the WebView's
              // "content snaps to top:0 then reflows" flicker. The map is drawn into
              // a bottom band INSIDE the page (mapBandFraction) so the guessing fit
              // is identical to the old mini-map, and the reveal is just a CSS
              // expand of an already-full WebView. Full height includes the top
              // inset so the revealed map reaches under the Android status bar.
              height: fullMapHeight,
            }}
          >
            {mapMounted && (
              // All variants render the web Leaflet map via the embed WebView.
              // Country/continent place guesses via buttons → interactive=false.
              <EmbeddedMap
                route="map"
                mapType={mapType}
                lang={language}
                location={location}
                guessPosition={isCountryVariant ? null : computedGuessPosition}
                onGuessPositionChange={
                  isCountryVariant
                    ? undefined
                    : (p) => {
                        // No pin sound here: it plays INSIDE the embed WebView
                        // (shim Web Audio at the tap — the bridge hop to native
                        // audio read as lag). EmbeddedMap's fallback map is the
                        // only native-pin path left.
                        if (!isShowingResult) onGuessPositionChange?.(p);
                      }
                }
                isShowingResult={isShowingResult}
                interactive={!isCountryVariant}
                extent={extent}
                maxDist={maxDist}
                round={round}
                showHint={hintShown}
                countryGuessPosition={isCountryVariant ? countryGuessPosition : null}
                guessPoints={guessPoints}
                hintCircle={hintCircleData}
                mapBandFraction={isCountryVariant ? undefined : miniFraction}
                onRevealReady={handleRevealReady}
              />
            )}
          </View>

        </Animated.View>

        {/* Pin variant: Guess + collapse buttons above the open mini-map. */}
        {variant === 'pin' && miniMapShown && !isShowingResult && (
          <Animated.View
            style={[
              styles.mapButtonsRow,
              {
                bottom: expandedMapHeight + 8,
                paddingHorizontal: Math.max(insets.right, spacing.md),
              },
              {
                opacity: mapBtnsAnim,
                transform: [
                  {
                    translateY: mapBtnsAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [40, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {onHint && (
              <Pressable
                onPress={() => {
                  haptics.medium(); // hint reveal — a notable "aha" beat
                  onHint?.();
                }}
                disabled={hintShown || hintDisabled}
                style={({ pressed }) => [
                  styles.hintBtn,
                  isTablet && { height: sc(48), paddingHorizontal: sc(14), borderRadius: sc(14) },
                  (hintShown || hintDisabled) && styles.hintBtnDisabled,
                  pressed && !(hintShown || hintDisabled) && { opacity: 0.85 },
                ]}
              >
                <Ionicons
                  name="bulb"
                  size={sc(18)}
                  color={hintShown || hintDisabled ? 'rgba(255,255,255,0.4)' : '#FFC107'}
                />
                <Text style={[styles.hintBtnText, { fontSize: sc(fontSizes.md) }]}>{t('hint')}</Text>
              </Pressable>
            )}
            <Pressable
              // Web parity: gameUI.js opts the Guess button out of click_2
              // outside multiplayer (data-no-click-sfx) — on this SP-only
              // surface the reveal whoosh fires instantly on the same press,
              // so it IS the press sound. MP's Guess button ([id].tsx) keeps
              // the click because its reveal lags the press.
              sfx="none"
              onPress={handleSubmitPin}
              disabled={!guessPosition}
              style={({ pressed }) => [
                styles.guessSubmitBtn,
                isTablet && { height: sc(48), borderRadius: sc(14) },
                pressed && guessPosition && { opacity: 0.85 },
              ]}
            >
              <LinearGradient
                colors={guessPosition ? ['#1d1d5b', '#1e3e9c'] : ['#555', '#444']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.guessSubmitBtnGradient}
              >
                <Text
                  style={[
                    styles.guessSubmitBtnText,
                    { fontSize: sc(fontSizes.lg) },
                    !guessPosition && { opacity: 0.5 },
                  ]}
                >
                  {t('guess')}
                </Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              onPress={handleCloseMap}
              style={({ pressed }) => [
                styles.mapCollapseBtn,
                isTablet && { width: sc(60), height: sc(48), borderRadius: sc(14) },
                pressed && { opacity: 0.85 },
              ]}
            >
              <LinearGradient
                colors={[colors.primary, colors.primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.mapCollapseBtnInner}
              >
                <Ionicons name="arrow-down" size={sc(24)} color={colors.white} />
              </LinearGradient>
            </Pressable>
          </Animated.View>
        )}

        {/* Pin variant: floating Guess FAB when map is closed. Fades in/out
            with the rest of the input UI; the spring scale only fires the
            very first time so re-shows after a result feel light. */}
        {showFab && (
          <Animated.View
            style={[
              styles.guessFab,
              {
                opacity: inputsFade,
                transform: [{ scale: fabScaleAnim }],
                bottom: Math.max(insets.bottom, 20) + 20,
                // Match singleplayer's `60` minimum so the FAB clears the
                // WebView's right-edge Street View controls instead of
                // overlapping them.
                right: Math.max(insets.right, 60),
              },
            ]}
          >
            <Pressable
              onPress={handleOpenMap}
              style={({ pressed }) => [pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] }]}
            >
              <LinearGradient
                colors={[colors.primary, colors.primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.guessFabInner,
                  isTablet && {
                    paddingHorizontal: sc(24),
                    paddingVertical: sc(16),
                    gap: sc(10),
                    borderRadius: sc(16),
                  },
                ]}
              >
                <Ionicons name="map" size={sc(28)} color={colors.white} />
                <Text style={[styles.guessFabText, { fontSize: sc(fontSizes.xl) }]}>{t('guess')}</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        )}

        {/* Country / continent variant: button grid. */}
        {showCountryInputs && (
          <Animated.View
            style={[
              styles.countryDock,
              {
                opacity: inputsFade,
                paddingBottom: Math.max(insets.bottom, spacing.md) + 4,
              },
            ]}
            pointerEvents="box-none"
          >
            <CountryButtons
              countries={countryOptions}
              mode={variant === 'continent' ? 'continent' : 'country'}
              shown
              selected={countryPicked}
              correct={correctAnswer}
              onPress={(answer) => onAnswerCountry?.(answer)}
            />
          </Animated.View>
        )}

        {/* End banner. For pin variant we slide it up; for country / continent
            we just fade it in (no slide). The wrapper carries the same
            opaque dark green as the inner banner content so the banner and
            the bottom safe-area inset read as one continuous block — no
            seam, no streetview bleed. */}
        {isShowingResult && endBannerContent && (
          <Animated.View
            style={[
              styles.endBanner,
              isCountryVariant && styles.endBannerCountryBg,
              {
                transform: isCountryVariant ? [] : [{ translateY: bannerSlideAnim }],
                opacity: isCountryVariant
                  ? bannerSlideAnim.interpolate({
                      inputRange: [0, 300],
                      outputRange: [1, 0],
                    })
                  : 1,
                paddingLeft: insets.left,
                paddingRight: insets.right,
                paddingBottom: Math.max(insets.bottom, spacing.md),
              },
            ]}
          >
            {endBannerContent}
          </Animated.View>
        )}
      </Animated.View>

      {/* Top-right slot is rendered ABOVE the scene fade so the login/join
          party toolbar is tappable even during the initial reveal. */}
      {topRightSlot && (
        <SafeAreaView edges={['top']} style={styles.topRight} pointerEvents="box-none">
          {topRightSlot}
        </SafeAreaView>
      )}

      {/* One shared loading overlay — see GameLoadingOverlay.tsx. */}
      <GameLoadingOverlay
        opacity={loadingOpacity}
        interactive={showLoadingBanner}
        message={loadingMessage}
        error={loadingError}
        // The overlay renders onRetry whenever provided (spinner OR error mode);
        // this surface only wants it on the error screen — plain loads keep the
        // bare spinner (the corner back button is the mid-load escape here).
        onRetry={loadingError ? onLoadingRetry : undefined}
        retryLabel={loadingRetryLabel}
        onBack={onLoadingBack}
      />
    </View>
  );
}

export default forwardRef<GameSurfaceHandle, GameSurfaceProps>(GameSurface);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  topLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    zIndex: 102,
  },
  topLeftStack: {
    // Horizontal row so the reload button sits to the RIGHT of the back button
    // (matches web's navbar). alignSelf keeps the row hugging its buttons so the
    // empty strip beside them never swallows pano touches.
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
  },
  topCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: spacing.sm,
    zIndex: 101,
  },
  topRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    zIndex: 2100, // above loading overlay (zIndex 2000)
    elevation: 60,
  },
  mapOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: 'hidden',
  },
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
  hintBtn: {
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 2,
    borderColor: 'rgba(255,193,7,0.6)',
  },
  hintBtnDisabled: {
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  hintBtnText: {
    color: colors.white,
    fontSize: fontSizes.md,
    fontFamily: 'Lexend-SemiBold',
  },
  guessSubmitBtnGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
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
  guessFab: {
    position: 'absolute',
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
  countryDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1500,
  },
  endBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1001,
  },
  endBannerCountryBg: {
    // Country / continent variant only. Same opaque dark green as the inner
    // CountryEndBanner so the wrapper's safe-area padding and the banner
    // body read as one block.
    backgroundColor: '#0c1f12',
  },
});
