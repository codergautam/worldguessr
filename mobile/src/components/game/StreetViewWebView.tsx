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

/** Imperative API: lets any HUD reload the current pano (web parity: the blue reload button). */
export interface StreetViewHandle {
  /** Re-loads the current panorama in place via a smooth crossfade (no black flash). */
  reload: () => void;
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
}

type SlotKey = 'primary' | 'secondary';

interface WebViewSourceState {
  key: string;
  html: string;
}

// Google Maps API key - same as web version
const GOOGLE_MAPS_API_KEY = 'AIzaSyA_t5gb2Mn37dZjhsaJ4F-OPp1PWDxqZyI';

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
        iframe {
          width: calc(100vw + ${cropRightPx}px);
          height: calc(100vh + 300px);
          border: none;
          transform: translateY(-285px);
          pointer-events: ${nmpz ? 'none' : 'auto'};
        }
      </style>
    </head>
    <body>
      <iframe
        src="${streetViewUrl}"
        referrerpolicy="no-referrer-when-downgrade"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
        loading="eager"
      ></iframe>
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

  useImperativeHandle(ref, () => ({
    reload: () => setReloadNonce((n) => n + 1),
  }), []);

  const activeSlotRef = useRef<SlotKey>('primary');
  // State mirror of activeSlotRef purely so pointerEvents re-renders when the
  // visible slot changes. With smoothTransitions the active slot alternates
  // primary↔secondary each round; only the visible slot may be interactive, and
  // the hidden one (which overlaps on top) MUST be pointerEvents:'none' or it
  // eats touches. Previously secondary was hardcoded 'none', so after an odd
  // number of crossfades the visible slot was secondary → StreetView went dead.
  const [interactiveSlot, setInteractiveSlot] = useState<SlotKey>('primary');
  const pendingSlotRef = useRef<SlotKey | null>(null);
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

  const handleLoadEnd = useCallback((slot: SlotKey) => {
    const pendingSlot = pendingSlotRef.current;
    const activeSlot = activeSlotRef.current;

    // `pendingSlotRef` is only ever set when we entered the crossfade branch
    // (it's null for in-place swaps), so a pending slot already implies a
    // crossfade is in flight — no need to also gate on `smoothTransitions`.
    // This is what lets reload crossfades work in non-smooth modes too.
    if (pendingSlot === slot && slot !== activeSlot) {
      const incomingOpacity = slot === 'primary' ? primaryOpacity : secondaryOpacity;
      const outgoingOpacity = activeSlot === 'primary' ? primaryOpacity : secondaryOpacity;

      // Hand interactivity to the incoming pano as it fades in. Without this the
      // crossfade only updated activeSlotRef (a ref) at completion, so pointerEvents
      // stayed on the old/hidden slot and the visible pano was dead after every
      // round transition.
      setInteractiveSlot(slot);

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
        activeSlotRef.current = slot;
        pendingSlotRef.current = null;
        setHasLoadedOnce(true);
        setIsInitialLoading(false);
        onLoad?.();
      });
      return;
    }

    if (slot === activeSlot || !smoothTransitions) {
      setSlotVisible(slot);
      setHasLoadedOnce(true);
      setIsInitialLoading(false);
      onLoad?.();
    }
  }, [smoothTransitions, primaryOpacity, secondaryOpacity, transitionDuration, setSlotVisible, onLoad]);

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
      {(sources.primary || sources.secondary) && (
        <>
          {sources.primary && (
            <Animated.View
              pointerEvents={interactiveSlot === 'primary' ? 'auto' : 'none'}
              style={[styles.webviewLayer, { opacity: primaryOpacity }]}
            >
              <WebView
                source={{ html: sources.primary.html }}
                style={styles.webview}
                onLoadEnd={() => handleLoadEnd('primary')}
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
          )}
          {sources.secondary && (
            <Animated.View
              pointerEvents={interactiveSlot === 'secondary' ? 'auto' : 'none'}
              style={[styles.webviewLayer, { opacity: secondaryOpacity }]}
            >
              <WebView
                source={{ html: sources.secondary.html }}
                style={styles.webview}
                onLoadEnd={() => handleLoadEnd('secondary')}
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
          )}
        </>
      )}
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
