import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { View, ActivityIndicator, StyleSheet, Animated, Easing } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../../shared';

/** Result of committing a warm preload (see `StreetViewHandle.commitPreload`). */
export type CommitPreloadResult =
  /** The next pano was already loaded and is now the visible/active slot — the
   *  caller can advance the round IMMEDIATELY with no loading cover. */
  | 'ready'
  /** A next pano was warming and is now the active slot but hasn't finished
   *  loading — the caller should advance the round now AND show a cover until
   *  `onLoad` fires (the slot's load-end). */
  | 'pending'
  /** Nothing was preloaded — the caller should run its own loading-cover path. */
  | 'none';

/** Imperative API: lets any HUD reload the current pano (web parity: the blue reload button). */
export interface StreetViewHandle {
  /** Re-loads the current panorama in place via a smooth crossfade (no black flash). */
  reload: () => void;
  /**
   * Promote the pano warmed via the `preload` prop to the visible/active slot.
   * Because the swap happens behind the caller's result map, there's nothing to
   * crossfade visually — the warm slot is SNAPPED in synchronously so the caller
   * can advance the round on the same frame (no dead pause). See the result type.
   */
  commitPreload: () => CommitPreloadResult;
}

/** Bare coordinates for a pano to warm in the hidden slot (see the `preload` prop). */
export interface PreloadTarget {
  lat: number;
  long: number;
  heading?: number | null;
  pitch?: number;
}

interface StreetViewWebViewProps {
  lat: number;
  long: number;
  onLoad?: () => void;
  language?: string;
  fov?: number;
  heading?: number | null;
  pitch?: number;
  smoothTransitions?: boolean;
  transitionDuration?: number;
  cropRightPx?: number;
  showInitialLoader?: boolean;
  interactive?: boolean;
  nmpz?: boolean;
  /**
   * Warm the NEXT pano in the hidden slot at opacity 0 without disturbing the
   * visible one. Call `commitPreload()` (imperative handle) to crossfade to it.
   * Pass null to warm nothing. Built with the same render params as the visible
   * pano so committing it then advancing `lat/long` to it does NOT trigger a reload.
   */
  preload?: PreloadTarget | null;
}

type SlotKey = 'primary' | 'secondary';

interface WebViewSourceState {
  key: string;
  html: string;
}

// Google Maps API key - same as web version
const GOOGLE_MAPS_API_KEY = 'AIzaSyA_t5gb2Mn37dZjhsaJ4F-OPp1PWDxqZyI';

// The wrapper document is loaded with a google.com base URL so the street view
// iframe below is SAME-origin with its parent. WebKit halves rendering updates /
// requestAnimationFrame for CROSS-origin iframes until they receive a real click
// (ThrottlingReason::NonInteractedCrossOriginFrame) — with the default about:blank
// wrapper origin, every fresh round panned at ~30fps on iOS until tapped.
// Loading the embed URL top-level instead is not an option: the Embed API refuses
// to run outside an iframe ("must be used in an iframe" error page).
const WRAPPER_BASE_URL = 'https://www.google.com/';

function buildStreetViewHtml(
  lat: number,
  long: number,
  language: string,
  fov: number,
  heading: number | null | undefined,
  pitch: number,
  cropRightPx: number,
  nmpz: boolean,
  reloadNonce: number,
) {
  const headingParam = heading !== null && heading !== undefined ? `&heading=${heading}` : '';
  const pitchParam = pitch !== null && pitch !== undefined ? `&pitch=${pitch}` : '';
  const streetViewUrl = `https://www.google.com/maps/embed/v1/streetview?location=${lat},${long}&key=${GOOGLE_MAPS_API_KEY}&fov=${fov}${headingParam}${pitchParam}&language=${language}`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <!-- reload:${reloadNonce} -->
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100%; overflow: hidden; background: #1a1a2e; }
        /* position:fixed (NOT in-flow + translateY): the WRAPPER_BASE_URL origin
           spoof makes the iframe same-origin, so WebKit's scroll-focused-element-
           into-view now propagates from the embed to THIS document. The embed
           focuses its movement arrows on tap; in-flow, the oversized iframe left
           ~300px of scrollable overflow and each arrow press scrolled the wrapper
           down into it (pano snapped up, dark-blue band below). Fixed boxes add
           zero scrollable overflow, so that scroll clamps to 0. */
        iframe {
          position: fixed;
          top: -285px;
          left: 0;
          width: calc(100vw + ${cropRightPx}px);
          height: calc(100vh + 300px);
          border: none;
          pointer-events: ${nmpz ? 'none' : 'auto'};
        }
      </style>
    </head>
    <body>
      <!-- Sensor features are EXPLICITLY denied ('none'), not just omitted: their
           default allowlist is 'self', and the WRAPPER_BASE_URL origin spoof makes
           this iframe same-origin, so omission alone would still grant them and
           the embed would gyro-pan the pano when the phone moves. -->
      <iframe
        src="${streetViewUrl}"
        referrerpolicy="no-referrer-when-downgrade"
        allow="accelerometer 'none'; gyroscope 'none'; magnetometer 'none'; autoplay; clipboard-write; encrypted-media; picture-in-picture"
        loading="eager"
      ></iframe>
      <script>
        // Backstop for the focus-scroll described above the iframe rule: if any
        // future geometry change reintroduces scrollable overflow, snap back
        // instead of leaving the pano shifted.
        addEventListener('scroll', function () { scrollTo(0, 0); }, { passive: true });
      </script>
    </body>
    </html>
  `;
}

function StreetViewWebView({
  lat,
  long,
  onLoad,
  language = 'en',
  fov = 100,
  heading,
  pitch = 0,
  smoothTransitions = false,
  transitionDuration = 350,
  cropRightPx = 0,
  showInitialLoader = true,
  nmpz = false,
  preload = null,
}: StreetViewWebViewProps, ref: React.Ref<StreetViewHandle>) {
  const [sources, setSources] = useState<Record<SlotKey, WebViewSourceState | null>>({
    primary: null,
    secondary: null,
  });
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Bumping this re-loads the current pano (same coords) — the imperative
  // `reload()` below. It feeds the location fingerprint so a bump always counts
  // as a change, and is baked into the HTML so the WebView source actually
  // differs. A reload always takes the crossfade path (see the effect) so it's
  // flash-free regardless of `smoothTransitions`.
  const [reloadNonce, setReloadNonce] = useState(0);
  const prevReloadNonceRef = useRef(0);

  const activeSlotRef = useRef<SlotKey>('primary');
  // State mirror of activeSlotRef purely so pointerEvents re-renders when the
  // visible slot changes. With smoothTransitions the active slot alternates
  // primary↔secondary each round; only the visible slot may be interactive, and
  // the hidden one (which overlaps on top) MUST be pointerEvents:'none' or it
  // eats touches. Previously secondary was hardcoded 'none', so after an odd
  // number of crossfades the visible slot was secondary → StreetView went dead.
  const [interactiveSlot, setInteractiveSlot] = useState<SlotKey>('primary');
  // WebView process-death recovery (iOS onContentProcessDidTerminate / Android
  // onRenderProcessGone — the OS reclaims WebView processes under memory
  // pressure, and this screen keeps several alive). A dead WebView never fires
  // another load event, so a slot that dies mid-load wedges the crossfade
  // machine — and because rounds alternate slots off activeSlotRef (which only
  // advances on a COMPLETED crossfade), every later round re-targets the same
  // dead slot: Street View stays behind an eternal loading cover for the rest
  // of the game. Bumping the slot's generation remounts the native WebView
  // with its current source, so the load re-runs, onLoadEnd re-fires, and the
  // machine self-heals.
  const [slotGen, setSlotGen] = useState<Record<SlotKey, number>>({ primary: 0, secondary: 0 });
  const reviveSlot = useCallback((slot: SlotKey) => {
    setSlotGen((g) => ({ ...g, [slot]: g[slot] + 1 }));
  }, []);
  const pendingSlotRef = useRef<SlotKey | null>(null);
  // Warm-preload bookkeeping. `preloadSlotRef` holds whichever slot is loading
  // the NEXT pano at opacity 0; `preloadReadyRef` flips once its WebView fires
  // onLoadEnd. commitPreload() consumes them synchronously.
  const preloadSlotRef = useRef<SlotKey | null>(null);
  const preloadKeyRef = useRef<string | null>(null);
  const preloadReadyRef = useRef(false);
  const sourcesRef = useRef<Record<SlotKey, WebViewSourceState | null>>({
    primary: null,
    secondary: null,
  });
  const primaryOpacity = useRef(new Animated.Value(1)).current;
  const secondaryOpacity = useRef(new Animated.Value(0)).current;

  const setSlotVisible = useCallback((slot: SlotKey) => {
    primaryOpacity.setValue(slot === 'primary' ? 1 : 0);
    secondaryOpacity.setValue(slot === 'secondary' ? 1 : 0);
    activeSlotRef.current = slot;
    setInteractiveSlot(slot);
  }, [primaryOpacity, secondaryOpacity]);

  // Crossfade the active slot → `toSlot`, handing over interactivity as it fades
  // in. Shared by the auto-crossfade (lat/long change / reload) and the
  // preload commit so both paths stay in lock-step. `onDone` runs after `onLoad`.
  const startCrossfade = useCallback((toSlot: SlotKey, onDone?: () => void) => {
    const fromSlot = activeSlotRef.current;
    if (toSlot === fromSlot) {
      onDone?.();
      return;
    }
    const incomingOpacity = toSlot === 'primary' ? primaryOpacity : secondaryOpacity;
    const outgoingOpacity = fromSlot === 'primary' ? primaryOpacity : secondaryOpacity;
    setInteractiveSlot(toSlot);
    Animated.parallel([
      Animated.timing(incomingOpacity, {
        toValue: 1,
        duration: transitionDuration,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(outgoingOpacity, {
        toValue: 0,
        duration: transitionDuration,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => {
      activeSlotRef.current = toSlot;
      pendingSlotRef.current = null;
      setHasLoadedOnce(true);
      setIsInitialLoading(false);
      onLoad?.();
      onDone?.();
    });
  }, [primaryOpacity, secondaryOpacity, transitionDuration, onLoad]);

  useImperativeHandle(ref, () => ({
    reload: () => setReloadNonce((n) => n + 1),
    commitPreload: () => {
      const slot = preloadSlotRef.current;
      if (!slot || !sourcesRef.current[slot]) return 'none';
      const ready = preloadReadyRef.current;
      preloadSlotRef.current = null;
      preloadKeyRef.current = null;
      preloadReadyRef.current = false;
      pendingSlotRef.current = null;
      // Snap the warm slot to active/visible synchronously. The caller does this
      // UNDER an opaque cover, so there's nothing to crossfade — and the sync
      // activeSlotRef update means the parent's `location` advance matches this
      // slot's source key, so the main effect early-returns (no reload).
      setSlotVisible(slot);
      if (ready) {
        // Already painted — the caller fades its cover straight out.
        setHasLoadedOnce(true);
        setIsInitialLoading(false);
        return 'ready';
      }
      // Still loading: it's the active slot now. Its onLoadEnd hits the active-slot
      // branch below → fires onLoad → caller drops the cover once it paints.
      return 'pending';
    },
  }), [setSlotVisible]);

  useEffect(() => {
    sourcesRef.current = sources;
  }, [sources]);

  const isValidCoordinate = Number.isFinite(lat) && Number.isFinite(long);

  useEffect(() => {
    if (!isValidCoordinate) return;

    // A reload (nonce bump at the same coords) must always crossfade — the old
    // pano stays visible until the fresh one paints — even in modes that don't
    // otherwise opt into smooth transitions (e.g. GameSurface singleplayer).
    const isReload = reloadNonce !== prevReloadNonceRef.current;
    prevReloadNonceRef.current = reloadNonce;
    const useCrossfade = smoothTransitions || isReload;

    const locationKey = `${lat}-${long}-${language}-${fov}-${heading ?? ''}-${pitch}-${cropRightPx}-${nmpz}-${reloadNonce}`;
    const nextSource = {
      key: locationKey,
      html: buildStreetViewHtml(lat, long, language, fov, heading, pitch, cropRightPx, nmpz, reloadNonce),
    };

    const activeSlot = activeSlotRef.current;
    const activeSource = sourcesRef.current[activeSlot];

    if (!activeSource) {
      pendingSlotRef.current = null;
      setIsInitialLoading(true);
      setSources({ primary: nextSource, secondary: null });
      setSlotVisible('primary');
      return;
    }

    if (activeSource.key === nextSource.key) return;

    if (!useCrossfade) {
      pendingSlotRef.current = null;
      setIsInitialLoading(true);
      setSources((prev) => ({
        ...prev,
        [activeSlot]: nextSource,
      }));
      return;
    }

    const nextSlot: SlotKey = activeSlot === 'primary' ? 'secondary' : 'primary';
    pendingSlotRef.current = nextSlot;
    if (nextSlot === 'primary') {
      primaryOpacity.setValue(0);
    } else {
      secondaryOpacity.setValue(0);
    }
    setSources((prev) => ({
      ...prev,
      [nextSlot]: nextSource,
    }));
  }, [lat, long, language, fov, heading, pitch, cropRightPx, nmpz, reloadNonce, isValidCoordinate, setSlotVisible, smoothTransitions, primaryOpacity, secondaryOpacity]);

  // ── Warm preload ─────────────────────────────────────────────────────────
  // Load the NEXT pano into the inactive slot at opacity 0 WITHOUT crossfading,
  // so the current pano stays visible/interactive (the result map sits on top
  // during the between-rounds reveal). `commitPreload()` promotes it later.
  // Depends on primitive fields, not the `preload` object identity, so a fresh
  // object literal each render doesn't re-warm the slot.
  const preloadLat = preload?.lat;
  const preloadLong = preload?.long;
  const preloadHeading = preload?.heading;
  const preloadPitch = preload?.pitch;
  useEffect(() => {
    if (
      preloadLat === undefined ||
      preloadLong === undefined ||
      !Number.isFinite(preloadLat) ||
      !Number.isFinite(preloadLong)
    ) {
      return; // nothing requested — never disturb the visible slot
    }
    // Normalize EXACTLY like the visible source key (pitch defaults to 0) so that,
    // after commit + `lat/long` advancing to this pano, the main effect computes
    // the same key and early-returns instead of reloading from scratch.
    const normPitch = preloadPitch ?? 0;
    const preloadKey = `${preloadLat}-${preloadLong}-${language}-${fov}-${preloadHeading ?? ''}-${normPitch}-${cropRightPx}-${nmpz}-${reloadNonce}`;

    const activeSlot = activeSlotRef.current;
    const activeSource = sourcesRef.current[activeSlot];
    if (activeSource?.key === preloadKey) return; // already the visible pano
    if (preloadSlotRef.current && preloadKeyRef.current === preloadKey) return; // already warming

    const slot: SlotKey = activeSlot === 'primary' ? 'secondary' : 'primary';
    preloadSlotRef.current = slot;
    preloadKeyRef.current = preloadKey;
    preloadReadyRef.current = false;
    (slot === 'primary' ? primaryOpacity : secondaryOpacity).setValue(0);
    setSources((prev) => ({
      ...prev,
      [slot]: {
        key: preloadKey,
        html: buildStreetViewHtml(preloadLat, preloadLong, language, fov, preloadHeading, normPitch, cropRightPx, nmpz, reloadNonce),
      },
    }));
  }, [preloadLat, preloadLong, preloadHeading, preloadPitch, language, fov, cropRightPx, nmpz, reloadNonce, primaryOpacity, secondaryOpacity]);

  const handleLoadEnd = useCallback((slot: SlotKey) => {
    // A warm-preload slot finished loading while still warm (not yet committed).
    // Mark it ready and keep it HIDDEN — do not fire onLoad or make it visible.
    // (Once committed, preloadSlotRef is cleared and the slot is active, so this
    // guard no longer matches and the active-slot branch below fires onLoad.)
    if (
      slot === preloadSlotRef.current &&
      slot !== activeSlotRef.current &&
      slot !== pendingSlotRef.current
    ) {
      preloadReadyRef.current = true;
      return;
    }

    const pendingSlot = pendingSlotRef.current;
    const activeSlot = activeSlotRef.current;

    // `pendingSlotRef` is only ever set when we entered the crossfade branch
    // (it's null for in-place swaps), so a pending slot already implies a
    // crossfade is in flight — no need to also gate on `smoothTransitions`.
    // This is what lets reload crossfades work in non-smooth modes too.
    if (pendingSlot === slot && slot !== activeSlot) {
      startCrossfade(slot);
      return;
    }

    if (slot === activeSlot || !smoothTransitions) {
      setSlotVisible(slot);
      setHasLoadedOnce(true);
      setIsInitialLoading(false);
      onLoad?.();
    }
  }, [smoothTransitions, setSlotVisible, onLoad, startCrossfade]);

  // Don't render if no valid coordinates
  if (!isValidCoordinate) {
    return (
      <View style={[styles.container, styles.loader]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {showInitialLoader && !hasLoadedOnce && isInitialLoading && (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
      {(['primary', 'secondary'] as const).map((slot) => {
        const source = sources[slot];
        if (!source) return null;
        return (
          <Animated.View
            key={slot}
            pointerEvents={interactiveSlot === slot ? 'auto' : 'none'}
            style={[
              styles.webviewLayer,
              { opacity: slot === 'primary' ? primaryOpacity : secondaryOpacity },
            ]}
          >
            <WebView
              // Generation bump = remount: the only way to revive a WebView
              // whose content/render process died (see reviveSlot above).
              key={`${slot}:${slotGen[slot]}`}
              source={{ html: source.html, baseUrl: WRAPPER_BASE_URL }}
              style={styles.webview}
              onLoadEnd={() => handleLoadEnd(slot)}
              onContentProcessDidTerminate={() => reviveSlot(slot)}
              onRenderProcessGone={() => reviveSlot(slot)}
              javaScriptEnabled
              domStorageEnabled
              allowsInlineMediaPlayback
              scrollEnabled={false}
              bounces={false}
              mediaPlaybackRequiresUserAction={false}
              allowsFullscreenVideo={false}
              originWhitelist={['*']}
            />
          </Animated.View>
        );
      })}
    </View>
  );
}

export default forwardRef<StreetViewHandle, StreetViewWebViewProps>(StreetViewWebView);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e', // Dark background to prevent white flash during loading
  },
  webview: {
    flex: 1,
  },
  webviewLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    zIndex: 10,
  },
});
