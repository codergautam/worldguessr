import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { EMBED_HTML } from '../../generated/embedHtml';
import { playSfx, toGain } from '../../services/sound';
import { useSettingsStore } from '../../store/settingsStore';
import LeafletMap from './LeafletMap';

/**
 * Renders the web app's real Leaflet map — the actual components/Map.js and
 * components/ResultsMap.js, compiled into a self-contained HTML bundle shipped
 * INSIDE the app (mobile/src/generated/embedHtml.ts, built by embed/build.mjs).
 * No server, works offline (map tiles aside). This reuses the web map verbatim so
 * mobile matches web exactly and avoids react-native-maps (which crashes on the
 * New Architecture).
 *
 * Bridge (protocol in @shared/embed/protocol): inbound we call window.__embedApply
 * via injectJavaScript; outbound the page posts ready/guess/km/openMaps. `mode`
 * ('map' | 'results') tells the bundle which map to show.
 */
interface LatLng {
  lat: number;
  lng: number;
}

interface Props {
  /** Which map the bundle should render: live in-game map, or all-rounds results. */
  route?: 'map' | 'results';
  /** Extra container style (e.g. StyleSheet.absoluteFillObject for the results screen). */
  style?: StyleProp<ViewStyle>;

  // ── results map (route='results') ─────────────────────────────────────────
  /** finalHistory: per-round {lat,long,guessLat,guessLong,points,panoId,players}. */
  rounds?: unknown[];
  /** Focus a round (number) or fit all (null). */
  activeRound?: number | null;
  isDuel?: boolean;
  /**
   * Team games: playerId -> 'a' | 'b'. Teammate pins render blue, enemies
   * green, each team's closest guesser enlarged (mirrors web ResultsMap).
   */
  teams?: Record<string, string> | null;
  /**
   * The viewer's own player id. Load-bearing for team pin color: the embed
   * resolves "my team" as teams[myId], so an empty/wrong id paints EVERY other
   * pin (teammates included) enemy-green. Must match the id-space of `teams`
   * keys (live session id / history accountId).
   */
  myId?: string | null;
  /** Highlighted player id from the Final Scores list; filters results pins. */
  selectedPlayer?: string | null;

  // ── live map (route='map') ──────────────────────────────────────────────
  /** The answer/panorama location ({lat,long}); drives reveal + hint. */
  location?: { lat: number; long: number } | null;
  guessPosition?: LatLng | null;
  onGuessPositionChange?: (p: LatLng) => void;
  isShowingResult?: boolean;
  mapType?: 'm' | 's' | 'p' | 'y';
  extent?: number[] | null;
  /** Max distance (km) for the map mode — scales the hint circle radius. */
  maxDist?: number;
  /** Current round number — seeds the hint circle offset (matches web). */
  round?: number;
  showHint?: boolean;
  multiplayerState?: unknown;
  countryGuessPosition?: LatLng | null;
  /** false = map taps ignored (country/continent mode). Default true. */
  interactive?: boolean;
  /**
   * Fraction (0–1) of the screen the visible map band occupies while guessing. The
   * host keeps the WebView's native frame full-screen at all times (so the result
   * reveal never resizes the WebView → no reflow flicker); the page draws the map
   * into this bottom band while guessing and expands it to full on answer reveal.
   * Omit/undefined to always render full-screen (web/iframe behavior).
   */
  mapBandFraction?: number;
  onKm?: (km: string) => void;
  onOpenMaps?: (info: { lat: number; lng: number; panoId?: string }) => void;
  /** Fired the instant the answer-reveal resize is done and the map is full-size. */
  onRevealReady?: () => void;
  lang?: string;

  // ── fallback (inline LeafletMap) ──────────────────────────────────────────
  /** Points scored — only used to color the fallback line. */
  guessPoints?: number;
  /** Precomputed hint circle — only used by the fallback LeafletMap. */
  hintCircle?: { center: LatLng; radiusMeters: number } | null;
}

const APPLY_FN = '__embedApply';
const READY_TIMEOUT_MS = 10000;

export default function EmbeddedMap({
  route = 'map',
  style,
  rounds,
  activeRound,
  isDuel,
  teams,
  myId,
  selectedPlayer,
  location,
  guessPosition,
  onGuessPositionChange,
  isShowingResult,
  mapType = 'm',
  extent = null,
  maxDist,
  round,
  showHint,
  multiplayerState,
  countryGuessPosition,
  interactive = true,
  mapBandFraction,
  onKm,
  onOpenMaps,
  onRevealReady,
  lang = 'en',
  guessPoints,
  hintCircle,
}: Props) {
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');

  // The pin click plays INSIDE the WebView (embed shim, Web Audio at the tap —
  // the postMessage bridge made the native pin audibly laggy). The shim holds
  // no volume of its own: the app's effective gain rides every updateProps, so
  // slider changes apply live and muted stays zero-cost in-page too.
  const sfxVolume = useSettingsStore((s) => s.sfxVolume);

  // On the results screen this WebView cold-starts on every fresh route mount —
  // a dark spinner then an abrupt map pop ("loading for a bit"). Fade the map in
  // once it signals ready so it emerges smoothly instead. Scoped to results so
  // the frame-tuned in-game reveal (route 'map') is untouched (starts at 1).
  const mapOpacity = useRef(new Animated.Value(route === 'results' ? 0 : 1)).current;
  useEffect(() => {
    if (route === 'results' && status === 'ready') {
      Animated.timing(mapOpacity, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [route, status, mapOpacity]);

  // Mobile game state → the serializable prop subset the bundled embed expects.
  const buildProps = useCallback(() => {
    if (route === 'results') {
      // myId is load-bearing for TEAM pin color (embed reads teams[myId] to
      // find "my team", then paints teammates blue / enemies green). The plain
      // pin set doesn't need it (opponents already exclude me; my own guess
      // comes from each round's guessLat/guessLong), so '' is a safe fallback
      // for non-team results.
      return {
        mode: 'results',
        lang,
        mapType,
        rounds: rounds ?? [],
        activeRound: activeRound ?? null,
        myId: myId ?? '',
        isDuel: !!isDuel,
        teams: teams ?? null,
        selectedPlayer: selectedPlayer ?? null,
      };
    }
    return {
      mode: 'map',
      lang,
      shown: true,
      // Perceptual gain (toGain) applied HOST-side so the shim needs no
      // volume model of its own.
      sfxGain: toGain(sfxVolume),
      options: { mapType },
      pinPoint: guessPosition ? { lat: guessPosition.lat, lng: guessPosition.lng } : null,
      answerShown: !!isShowingResult,
      location: location ? { lat: location.lat, long: location.long } : null,
      gameOptions: { extent: extent ?? null, maxDist: maxDist ?? 20000 },
      showHint: !!showHint,
      round: round ?? 0,
      multiplayerState: multiplayerState ?? null,
      countryGuessPin: countryGuessPosition
        ? { lat: countryGuessPosition.lat, lng: countryGuessPosition.lng }
        : null,
      interactive,
      mapBandFraction: typeof mapBandFraction === 'number' ? mapBandFraction : null,
      // Re-fit the camera when the round changes (ExtentFitter watches resetKey).
      resetKey: round ?? 0,
      cameraCancelKey: 0,
      stopCameraAnimations: false,
    };
  }, [
    route,
    lang,
    sfxVolume,
    mapType,
    guessPosition,
    isShowingResult,
    location,
    extent,
    maxDist,
    showHint,
    round,
    multiplayerState,
    countryGuessPosition,
    interactive,
    mapBandFraction,
    rounds,
    activeRound,
    isDuel,
    teams,
    myId,
    selectedPlayer,
  ]);

  const lastSentRef = useRef('');
  const push = useCallback(() => {
    if (!readyRef.current || !webRef.current) return;
    const msg = JSON.stringify({ type: 'updateProps', props: buildProps() });
    // Skip redundant injects — multiplayerState is often a fresh object with
    // identical content each render.
    if (msg === lastSentRef.current) return;
    lastSentRef.current = msg;
    webRef.current.injectJavaScript(`window.${APPLY_FN} && window.${APPLY_FN}(${msg}); true;`);
  }, [buildProps]);

  useEffect(() => {
    push();
  }, [push]);

  // Safety net: fall back to the inline map if the bundle never signals ready.
  useEffect(() => {
    if (status !== 'loading') return;
    const t = setTimeout(() => {
      if (!readyRef.current) setStatus('failed');
    }, READY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [status]);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      let msg: any;
      try {
        msg = JSON.parse(e.nativeEvent.data);
      } catch {
        return;
      }
      switch (msg?.type) {
        case 'ready':
          readyRef.current = true;
          setStatus('ready');
          push();
          break;
        case 'guess':
          if (typeof msg.lat === 'number' && typeof msg.lng === 'number') {
            onGuessPositionChange?.({ lat: msg.lat, lng: msg.lng });
          }
          break;
        case 'km':
          if (typeof msg.km === 'string') onKm?.(msg.km);
          break;
        case 'openMaps':
          if (typeof msg.lat === 'number' && typeof msg.lng === 'number') {
            if (onOpenMaps) onOpenMaps({ lat: msg.lat, lng: msg.lng, panoId: msg.panoId });
            else Linking.openURL(`https://www.google.com/maps?q=${msg.lat},${msg.lng}`);
          }
          break;
        case 'revealReady':
          onRevealReady?.();
          break;
      }
    },
    [push, onGuessPositionChange, onKm, onOpenMaps, onRevealReady],
  );

  // Fallback: inline self-contained Leaflet map (pin mode) if the bundle fails to
  // run for any reason. Only meaningful for the live map.
  if (status === 'failed' && route === 'map') {
    return (
      <LeafletMap
        guessPosition={guessPosition ?? null}
        onGuessPositionChange={(p) => {
          // The embed shim normally owns the pin click; this fallback map has
          // no shim, so sound it natively (bridge latency beats silence).
          playSfx('pin');
          onGuessPositionChange?.(p);
        }}
        actualPosition={isShowingResult && location ? { lat: location.lat, lng: location.long } : null}
        isShowingResult={isShowingResult}
        guessPoints={guessPoints}
        hintCircle={hintCircle ?? null}
      />
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Animated.View style={[styles.webview, { opacity: mapOpacity }]}>
        <WebView
          ref={webRef}
          source={{ html: EMBED_HTML }}
          originWhitelist={['*']}
          onMessage={onMessage}
          onError={() => setStatus('failed')}
          style={styles.webview}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          androidLayerType="hardware"
          // Lets the shim's AudioContext unlock at load instead of on the
          // first tap, so even the FIRST pin click is on the zero-latency
          // path. The page has no other media; nothing else can autoplay.
          mediaPlaybackRequiresUserAction={false}
          {...(Platform.OS === 'ios' ? { allowsInlineMediaPlayback: true } : {})}
        />
      </Animated.View>
      {status === 'loading' && (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator size="large" color="#7cc4a0" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Light "map-water" blue behind the WebView so no dark frame shows before the
  // page paints (or above the mini-map band as it springs open). Matches the
  // embed page background (#aadaff) — see embed/entry.jsx.
  container: { flex: 1, backgroundColor: '#aadaff' },
  webview: { flex: 1, backgroundColor: '#aadaff' },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#aadaff',
  },
});
