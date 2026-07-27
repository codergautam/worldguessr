/**
 * Host for the in-house WebGL Street View renderer — the EXACT component web's
 * No Move / NMPZ modes run (components/streetview/customStreetView.js), bundled
 * self-contained by embed/build.mjs into SV_EMBED_HTML and mounted here in a
 * WebView. Movement is structurally impossible in the renderer (no navigation
 * links exist), so `nm` needs no pointer-events freeze: pan/zoom stay live,
 * exactly like web. `npz` freezes input in-component and lifts on showAnswer.
 *
 * Pano resolution happens HERE, natively (keyless GeoPhotoService lookup — no
 * CORS in RN fetch, no Maps API key, free): the page's own resolver is shimmed
 * out of the bundle, and coords are withheld from the page until the pano id is
 * known, because map-file panoId strings go stale (July 15 audit: prod resolves
 * by lat/lng only) and the component's `panoId` prop takes FRESH ids only.
 *
 * Loading contract: onLoad fires from the page's SV_LOADED message — the
 * renderer's own "base tiles painted / failed / 8s failsafe" signal. There is
 * deliberately NO onLoadEnd handler on the WebView: the document loads in
 * milliseconds while the canvas is still black, and lifting the cover there
 * would flash a black screen every round. Do not add one.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { SV_EMBED_HTML } from '../../generated/svEmbedHtml';
import { INBOUND, OUTBOUND, APPLY_FN } from '@shared/embed/protocol';
import { colors } from '../../shared';
import type { StreetViewHandle } from './StreetViewWebView';

// Document origin for the WebView. Tile fetches use crossOrigin="anonymous";
// a data-/about-origin document sends Origin: null, the classic silent-CORS
// failure. googleapis serves ACAO:* so any real origin works — hold it
// constant with the origin the iframe renderer already ships with.
const WRAPPER_BASE_URL = 'https://www.google.com/';

// Keyless pano lookup — the endpoint the Maps JS client itself uses (JSONP
// shaped, so the payload arrives as `/**/cb && cb(<json>)`). Verified against
// ground truth July 26 (the compass north audit). Two-stage radius mirrors the
// web resolver's 50m-then-1000m net (customStreetView.js resolvePanoId).
const searchUrl = (lat: number, lng: number, radius: number) =>
  `https://maps.googleapis.com/maps/api/js/GeoPhotoService.SingleImageSearch` +
  `?pb=!1m5!1sapiv3!5h2!11m2!1m1!1b0!2m4!1m2!3d${lat}!4d${lng}!2d${radius}` +
  `!3m10!2m2!1sen!2sUS!9m1!1e2!11m4!1m3!1e2!2b1!3e2!4m10!1e1!1e2!1e3!1e4!1e8!1e6!5m1!1e2!6m1!1e2&callback=cb`;

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

async function resolvePanoNative(lat: number, long: number): Promise<string | null> {
  for (const radius of [50, 1000]) {
    try {
      const res = await withTimeout(fetch(searchUrl(lat, long, radius)), 4000);
      const text = await res.text();
      const json = JSON.parse(text.slice(text.indexOf('(') + 1, text.lastIndexOf(')')));
      const id = json?.[1]?.[1]?.[1];
      if (typeof id === 'string' && id) return id;
    } catch {
      // fall through to the wider radius / null
    }
  }
  return null;
}

interface CustomStreetViewWebViewProps {
  lat: number;
  long: number;
  heading?: number | null;
  npz?: boolean;
  /** Lifts the npz freeze on the answer reveal (web iframe/renderer contract). */
  showAnswer?: boolean;
  onLoad?: () => void;
  showInitialLoader?: boolean;
  /**
   * NEXT round's coords, set while the result screen covers the pano (same
   * contract as the iframe renderer's preload). Two warm-ups run off it:
   * the pano id resolves natively into the cache (so the round advance skips
   * the resolve round trip), and the page prefetches that pano's base tiles
   * into the HTTP cache. Without this the WebGL path started every round from
   * zero and visibly lagged the iframe's warm-slot flow.
   */
  preload?: { lat: number; long: number } | null;
  /**
   * Fired when the WebGL path cannot serve this round (pano resolution failed
   * or the page never handshook). The wrapper in StreetViewWebView.tsx flips
   * to the iframe renderer so the round still plays.
   */
  onUnavailable?: () => void;
}

function CustomStreetViewWebView(
  {
    lat,
    long,
    heading,
    npz = false,
    showAnswer = false,
    onLoad,
    showInitialLoader = true,
    preload = null,
    onUnavailable,
  }: CustomStreetViewWebViewProps,
  ref: React.Ref<StreetViewHandle>,
) {
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  // Everything the page needs to render the current round, sent whole on every
  // push — the page shallow-merges, so full snapshots keep revival trivial.
  const propsRef = useRef<Record<string, unknown>>({});
  const onLoadRef = useRef(onLoad);
  const onUnavailableRef = useRef(onUnavailable);
  onLoadRef.current = onLoad;
  onUnavailableRef.current = onUnavailable;
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  // Remount generation — the only way to revive a WebView whose content/render
  // process the OS reclaimed. The fresh page re-handshakes via READY.
  const [gen, setGen] = useState(0);
  const resolveSeqRef = useRef(0);
  // Warm-slot bookkeeping, mirroring the iframe renderer's preloadReadyRef:
  // the pano id we asked the page to warm, and whether the page confirmed its
  // base tiles are on the GPU (SV_PREFETCHED). That confirmation is what lets
  // commitPreload answer 'ready' — the instant, Moving-mode round transition.
  const prefetchIdRef = useRef<string | null>(null);
  const prefetchReadyRef = useRef(false);
  // Coord → pano-id promise cache. Preload resolves the next round into it
  // during the result screen; the round advance then finds its id already
  // settled instead of paying the lookup on the critical path. Promises (not
  // values) so an in-flight lookup is never duplicated.
  const resolveCacheRef = useRef(new Map<string, Promise<string | null>>());
  const resolveCached = useCallback((la: number, lo: number) => {
    const cache = resolveCacheRef.current;
    const key = `${la},${lo}`;
    let p = cache.get(key);
    if (!p) {
      p = resolvePanoNative(la, lo);
      cache.set(key, p);
      // A failed lookup must not poison the round if it's retried via reload.
      p.then((id) => { if (!id) cache.delete(key); }, () => cache.delete(key));
      if (cache.size > 8) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
    }
    return p;
  }, []);

  const push = useCallback(() => {
    if (!readyRef.current || !webRef.current) return;
    if (propsRef.current.panoId === undefined) return; // coords not resolved yet
    const msg = JSON.stringify({ type: INBOUND.UPDATE_PROPS, props: propsRef.current });
    webRef.current.injectJavaScript(`window.${APPLY_FN} && window.${APPLY_FN}(${msg}); true;`);
  }, []);

  // Resolve lat/lng → fresh pano id, then hand the page the whole round. The
  // page holds its loader (and the host cover waits on SV_LOADED) until then.
  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(long)) return;
    const seq = ++resolveSeqRef.current;
    (async () => {
      const panoId = await resolveCached(lat, long);
      if (seq !== resolveSeqRef.current) return; // a newer round superseded us
      if (!panoId) {
        onUnavailableRef.current?.();
        return;
      }
      propsRef.current = { ...propsRef.current, lat, long, heading: heading ?? null, panoId };
      push();
    })();
  }, [lat, long, heading, push, resolveCached]);

  // Preload: resolve the NEXT round's pano while the result screen is up and
  // hand its id to the page, whose prefetchPano effect warms the base tiles.
  useEffect(() => {
    const la = preload?.lat, lo = preload?.long;
    if (la === undefined || lo === undefined || !Number.isFinite(la) || !Number.isFinite(lo)) return;
    let stale = false;
    resolveCached(la, lo).then((id) => {
      if (stale || !id) return;
      prefetchIdRef.current = id;
      prefetchReadyRef.current = false; // fresh target — wait for its SV_PREFETCHED
      propsRef.current = { ...propsRef.current, prefetchPano: id };
      push();
    });
    return () => { stale = true; };
  }, [preload?.lat, preload?.long, push, resolveCached]);

  // Mode flags ride the same snapshot; no resolution needed.
  useEffect(() => {
    propsRef.current = { ...propsRef.current, npz, showAnswer };
    push();
  }, [npz, showAnswer, push]);

  // Failsafe for a page that never handshakes (WebView boot wedged, bundle
  // eval death): the page's own 8s failsafe can't run if the page isn't alive,
  // and the round must not sit behind an eternal cover.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!readyRef.current) onUnavailableRef.current?.();
    }, 12000);
    return () => clearTimeout(t);
  }, [gen]);

  useImperativeHandle(ref, () => ({
    // Same window.reloadLoc contract the web reload button uses.
    reload: () => {
      webRef.current?.injectJavaScript('window.reloadLoc && window.reloadLoc(); true;');
    },
    // 'ready' iff the page confirmed the warm pano's base tiles are on the
    // GPU: the caller then takes the same instant swap-under-the-cover path
    // Moving mode uses (the actual swap is the coords push that follows the
    // round advance — one frame, hidden under the cover fade). Anything less
    // is 'none': the caller's classic wait-for-onLoad cover flow.
    commitPreload: () => {
      if (!prefetchReadyRef.current) return 'none' as const;
      prefetchIdRef.current = null;
      prefetchReadyRef.current = false;
      return 'ready' as const;
    },
  }), []);

  const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    let msg: { type?: string; panoId?: string } = {};
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === OUTBOUND.READY) {
      readyRef.current = true;
      push();
      return;
    }
    if (msg.type === OUTBOUND.SV_PREFETCHED) {
      if (msg.panoId && msg.panoId === prefetchIdRef.current) prefetchReadyRef.current = true;
      return;
    }
    if (msg.type === OUTBOUND.SV_LOADED) {
      setHasLoadedOnce(true);
      onLoadRef.current?.();
    }
  }, [push]);

  const revive = useCallback(() => {
    readyRef.current = false;
    prefetchReadyRef.current = false; // the fresh page's GPU is empty
    setGen((g) => g + 1);
  }, []);

  return (
    <View style={styles.container}>
      {showInitialLoader && !hasLoadedOnce && (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
      <WebView
        key={gen}
        ref={webRef}
        source={{ html: SV_EMBED_HTML, baseUrl: WRAPPER_BASE_URL }}
        style={styles.webview}
        onMessage={handleMessage}
        onContentProcessDidTerminate={revive}
        onRenderProcessGone={revive}
        javaScriptEnabled
        domStorageEnabled
        androidLayerType="hardware"
        scrollEnabled={false}
        bounces={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo={false}
        originWhitelist={['*']}
        webviewDebuggingEnabled={__DEV__}
      />
    </View>
  );
}

export default forwardRef<StreetViewHandle, CustomStreetViewWebViewProps>(CustomStreetViewWebView);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  webview: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    zIndex: 10,
  },
});
