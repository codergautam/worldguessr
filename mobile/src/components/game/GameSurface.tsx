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
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../shared';
import { borderRadius, fontSizes, spacing } from '../../styles/theme';
import StreetViewWebView from './StreetViewWebView';
import GuessMap from './GuessMap';
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
  /** Map bounding box; `null` falls back to a world view (matches web). */
  extent?: Extent;
  /** Used by GuessMap to color the guess→actual line in pin mode. */
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
  /** Mirrors web CountryBtns compact mode. Regular play uses compact; onboarding does not. */
  compactCountryButtons?: boolean;
  /**
   * Suppresses the FAB / map / country buttons. Useful when a parent overlay
   * (e.g. onboarding's WelcomeOverlay) is up and we don't want input UI
   * peeking through the dim backdrop.
   */
  hideInputs?: boolean;
}

const EXPANDED_MAP_HEIGHT_RATIO = 0.5;
const EXPANDED_MAP_LANDSCAPE_HEIGHT_RATIO = 0.6;

function GameSurface(
  {
    location,
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
    compactCountryButtons = true,
    hideInputs = false,
  }: GameSurfaceProps,
  ref: React.Ref<GameSurfaceHandle>,
) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const expandedMapHeight =
    height * (width > height ? EXPANDED_MAP_LANDSCAPE_HEIGHT_RATIO : EXPANDED_MAP_HEIGHT_RATIO);

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
  const panoFingerprint = location
    ? `${location.lat}|${location.long}|${location.heading ?? ''}|${location.pitch ?? ''}`
    : 'empty';
  const lastFingerprint = useRef(panoFingerprint);
  useEffect(() => {
    if (lastFingerprint.current === panoFingerprint) return;
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

  // Loading banner crossfade — direct port of game/[id].tsx:230-263
  useEffect(() => {
    if (fadeOutTimer.current) {
      clearTimeout(fadeOutTimer.current);
      fadeOutTimer.current = null;
    }
    if (showLoadingBanner) {
      if (!isManualFadeIn.current) {
        Animated.timing(loadingOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    } else {
      isManualFadeIn.current = false;
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
  const mapOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (isCountryVariant) {
      mapSlideAnim.setValue(isShowingResult ? 1 : 0);
      Animated.timing(mapOpacity, {
        toValue: isShowingResult ? 1 : 0,
        duration: isShowingResult ? 1200 : 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }

    // Pin variant — keep the polished slide-up.
    mapOpacity.setValue(1);
    if (isShowingResult) {
      Animated.timing(mapSlideAnim, {
        toValue: 1,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    } else if (miniMapShown) {
      Animated.spring(mapSlideAnim, {
        toValue: 1,
        friction: 10,
        tension: 80,
        useNativeDriver: false,
      }).start();
    } else {
      Animated.timing(mapSlideAnim, {
        toValue: 0,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }
  }, [miniMapShown, isShowingResult, isCountryVariant]);

  // Map button row spring
  useEffect(() => {
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
      Animated.timing(bannerSlideAnim, {
        toValue: 300,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }).start();
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
    outputRange: [0, isShowingResult ? height : expandedMapHeight],
  });

  const showFab =
    variant === 'pin' && !showLoadingBanner && !miniMapShown && !isShowingResult && !hideInputs;
  const showCountryInputs =
    (variant === 'country' || variant === 'continent') &&
    !showLoadingBanner &&
    !isShowingResult &&
    !hideInputs;

  // Fade the country-button dock and the FAB in/out instead of hard-mounting
  // — the user wants fades wherever possible.
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
  const handleOpenMap = useCallback(() => setMiniMapShown(true), []);
  const handleCloseMap = useCallback(() => setMiniMapShown(false), []);

  const handleSubmitPin = useCallback(() => {
    onSubmitPin?.();
    setMiniMapShown(false);
  }, [onSubmitPin]);

  // Imperative handle — direct port of game/[id].tsx:614-673 handleNextRound.
  // The trick is to fade the loading banner all the way IN over the current
  // scene BEFORE swapping state, so the previous round's panorama is never
  // visible during the transition. The new panorama loads behind the
  // opaque banner, then onLoad → streetViewLoaded → banner fades out.
  useImperativeHandle(ref, () => ({
    beginRoundTransition: (onCovered) => {
      isManualFadeIn.current = true;
      setStreetViewLoaded(false);
      Animated.timing(loadingOpacity, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        onCovered();
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
              lat={location.lat}
              long={location.long}
              heading={location.heading ?? undefined}
              pitch={location.pitch}
              onLoad={handleStreetViewLoad}
            />
          )}
        </View>

        {/* Top-left / center / right slots — provided by parent. */}
        {topLeftSlot && (
          <SafeAreaView edges={['top']} style={styles.topLeft} pointerEvents="box-none">
            {topLeftSlot}
          </SafeAreaView>
        )}
        {topCenterSlot && (
          <SafeAreaView edges={['top']} style={styles.topCenter} pointerEvents="box-none">
            {topCenterSlot}
          </SafeAreaView>
        )}

        {/* Map overlay — for pin variant, animates height (slide-up); for
            country/continent, height is snapped and we fade in by
            crossfading a dark scrim on top of the map. */}
        <Animated.View
          style={[styles.mapOverlay, { height: mapHeight }]}
          pointerEvents={miniMapShown || isShowingResult ? 'auto' : 'none'}
        >
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: isShowingResult ? height : expandedMapHeight,
            }}
          >
            {mapMounted && (
              <GuessMap
                guessPosition={computedGuessPosition}
                countryGuessPosition={countryGuessPosition}
                actualPosition={actualPosition}
                onMapPress={(lat, lng) => {
                  if (isShowingResult) return;
                  if (variant === 'pin') onGuessPositionChange?.({ lat, lng });
                }}
                isExpanded
                extent={extent}
                guessPoints={guessPoints}
                instantReveal={isCountryVariant}
              />
            )}
          </View>

          {isCountryVariant && (
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFillObject,
                {
                  backgroundColor: '#08120d',
                  // Cap the dim at 0.55 so the map is visible through the
                  // scrim from frame 1.
                  opacity: mapOpacity.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.55, 0],
                  }),
                },
              ]}
            />
          )}
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
            <Pressable
              onPress={handleSubmitPin}
              disabled={!guessPosition}
              style={({ pressed }) => [
                styles.guessSubmitBtn,
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
                    !guessPosition && { opacity: 0.5 },
                  ]}
                >
                  Guess
                </Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              onPress={handleCloseMap}
              style={({ pressed }) => [styles.mapCollapseBtn, pressed && { opacity: 0.85 }]}
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
                style={styles.guessFabInner}
              >
                <Ionicons name="map" size={28} color={colors.white} />
                <Text style={styles.guessFabText}>Guess</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        )}

        {/* Country / continent variant: button grid. Fades in/out with
            inputsFade so the dock doesn't pop on round transitions. */}
        {showCountryInputs && (
          <Animated.View
            style={[
              styles.countryDock,
              {
                opacity: inputsFade,
                paddingBottom: compactCountryButtons ? Math.max(insets.bottom, spacing.md) + 4 : 0,
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
              compact={compactCountryButtons}
              bottomInset={compactCountryButtons ? 0 : Math.max(insets.bottom, spacing.md)}
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
        onRetry={onLoadingRetry}
        retryLabel={loadingRetryLabel}
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
