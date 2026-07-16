import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

/**
 * Leaflet map in a WebView — replaces react-native-maps (which crashes on the
 * New Architecture's legacy interop). Mirrors the web app's map: Google tiles
 * (`mt{s}.google.com/vt/lyrs=m … scale=2`, preferCanvas), tap-to-drop-pin,
 * guess/actual markers, the result line, and the hint circle. State is pushed
 * into the page via injectJavaScript; taps come back via postMessage.
 */
interface LatLng {
  lat: number;
  lng: number;
}

interface Props {
  guessPosition: LatLng | null;
  onGuessPositionChange?: (p: LatLng) => void;
  /** Set when the answer is revealed (drives markers + camera fit). */
  actualPosition?: { lat: number; lng: number } | null;
  isShowingResult?: boolean;
  /** Points scored — colors the guess→actual line. */
  guessPoints?: number;
  hintCircle?: { center: LatLng; radiusMeters: number } | null;
}

function lineColorForPoints(points?: number): string {
  if (points == null) return '#ffffff';
  if (points >= 3000) return '#4CAF50';
  if (points >= 1500) return '#FFC107';
  return '#F44336';
}

// Static HTML — Leaflet + Google tiles. Camera reacts to state *transitions*
// (reveal → fit bounds; hint appears → pan to it) tracked in `prev`.
const HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; background: #aadaff; }
  .lm-pin { width: 18px; height: 18px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg);
            border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.5); }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  function send(o){ if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  function pinIcon(color){
    return L.divIcon({ className: '', iconSize: [18,18], iconAnchor: [9,18],
      html: '<div class="lm-pin" style="background:'+color+'"></div>' });
  }
  // Live vector reprojection during frame-driven zooms (same fix as the web's
  // lib/leafletLiveVectors.js): stock Leaflet CSS-scales the canvas from its
  // last redraw baseline during flyTo and only reprojects at zoomend, so the
  // result line renders huge/blurry/off its pins for the whole reveal flight.
  // Reproject + redraw every frame instead. CSS-animated zooms
  // (_animatingZoom: pinch / double-tap) keep the stock transform path.
  (function(){
    var orig = L.Renderer.prototype._onZoom;
    L.Renderer.prototype._onZoom = function(){
      if (!this._map || !this._container) return;
      if (this._map._animatingZoom) { orig.call(this); return; }
      for (var id in this._layers) this._layers[id]._project();
      if (this._ctx && this._bounds) {
        // canvas fast path: skip Canvas._update's per-frame width/height
        // reassignment (a full backing-store realloc) when size is unchanged
        var oldSize = this._bounds.getSize();
        L.Renderer.prototype._update.call(this);
        var b = this._bounds, size = b.getSize();
        if (size.x === oldSize.x && size.y === oldSize.y) {
          var m = L.Browser.retina ? 2 : 1;
          L.DomUtil.setPosition(this._container, b.min);
          this._ctx.setTransform(m, 0, 0, m, 0, 0);
          this._ctx.clearRect(0, 0, size.x, size.y);
          this._ctx.translate(-b.min.x, -b.min.y);
          this.fire('update');
          return;
        }
      }
      this._update();
    };
  })();
  // Keep smooth animated zoom (default) — disabling it caused WKWebView repaint
  // flashes + anchor jumps. The real bug: while a zoom animation is in flight
  // (map._animatingZoom), Leaflet blocks the NEXT interaction — a fast second zoom
  // (pinch via TouchZoom._onTouchStart, double-tap/scroll via _tryAnimatedZoom),
  // and also the first pan stroke / tap. Fix: finish the in-flight zoom the instant
  // ANY new gesture starts (capture phase, before Leaflet's own handlers) so
  // nothing — zoom, pan, or tap — is swallowed.
  var map = L.map('map', { preferCanvas: true, zoomControl: false, attributionControl: false,
    worldCopyJump: true, tap: true }).setView([20, 0], 2);
  function finishZoom(){ if (map._animatingZoom) { try { map._onZoomTransitionEnd(); } catch (e) {} } }
  var mc = map.getContainer();
  mc.addEventListener('touchstart', finishZoom, true);
  mc.addEventListener('mousedown', finishZoom, true);
  mc.addEventListener('wheel', finishZoom, true);
  L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=en&scale=2',
    { subdomains: ['0','1','2','3'], maxZoom: 20 }).addTo(map);

  var guessM = null, actualM = null, line = null, hintC = null, prev = {};
  function setGuessMarker(p){
    if (!p) { if (guessM){ map.removeLayer(guessM); guessM = null; } return; }
    if (!guessM) guessM = L.marker([p.lat,p.lng], { icon: pinIcon('#1e3e9c') }).addTo(map);
    else guessM.setLatLng([p.lat,p.lng]);
  }
  map.on('click', function(e){
    if (window.__result) return;
    setGuessMarker({ lat: e.latlng.lat, lng: e.latlng.lng });
    send({ type: 'guess', lat: e.latlng.lat, lng: e.latlng.lng });
  });

  window.applyState = function(s){
    window.__result = !!s.result;
    setGuessMarker(s.guess || null);

    if (s.actual) {
      if (!actualM) actualM = L.marker([s.actual.lat,s.actual.lng], { icon: pinIcon('#e23b3b') }).addTo(map);
      else actualM.setLatLng([s.actual.lat,s.actual.lng]);
    } else if (actualM) { map.removeLayer(actualM); actualM = null; }

    if (s.actual && s.guess) {
      var pts = [[s.guess.lat,s.guess.lng],[s.actual.lat,s.actual.lng]];
      if (!line) line = L.polyline(pts, { color: s.lineColor || '#fff', weight: 3, dashArray: '6,8' }).addTo(map);
      else { line.setLatLngs(pts); line.setStyle({ color: s.lineColor || '#fff' }); }
    } else if (line) { map.removeLayer(line); line = null; }

    if (s.hint) {
      if (!hintC) hintC = L.circle([s.hint.lat,s.hint.lng], { radius: s.hint.r, color: '#FFC107',
        weight: 2, fillColor: '#FFC107', fillOpacity: 0.18 }).addTo(map);
      else { hintC.setLatLng([s.hint.lat,s.hint.lng]); hintC.setRadius(s.hint.r); }
    } else if (hintC) { map.removeLayer(hintC); hintC = null; }

    // Camera — only on transitions, so we never fight the user's panning.
    var justRevealed = s.result && !prev.result && s.actual;
    var hintAppeared = s.hint && !prev.hint;
    if (justRevealed) {
      if (s.guess) map.flyToBounds([[s.guess.lat,s.guess.lng],[s.actual.lat,s.actual.lng]],
        { padding: [60,80], maxZoom: 8, duration: 1.0 });
      else map.flyTo([s.actual.lat,s.actual.lng], 5, { duration: 1.0 });
    } else if (hintAppeared && !s.result) {
      map.flyToBounds(hintC.getBounds(), { padding: [40,40], duration: 0.6 });
    }
    prev = { result: !!s.result, hint: !!s.hint };
  };

  send({ type: 'ready' });
</script>
</body>
</html>`;

export default function LeafletMap({
  guessPosition,
  onGuessPositionChange,
  actualPosition,
  isShowingResult,
  guessPoints,
  hintCircle,
}: Props) {
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);

  const buildState = useCallback(() => {
    return {
      result: !!isShowingResult,
      guess: guessPosition ? { lat: guessPosition.lat, lng: guessPosition.lng } : null,
      actual: isShowingResult && actualPosition ? { lat: actualPosition.lat, lng: actualPosition.lng } : null,
      lineColor: lineColorForPoints(guessPoints),
      hint: hintCircle ? { lat: hintCircle.center.lat, lng: hintCircle.center.lng, r: hintCircle.radiusMeters } : null,
    };
  }, [guessPosition, actualPosition, isShowingResult, guessPoints, hintCircle]);

  const push = useCallback(() => {
    if (!readyRef.current || !webRef.current) return;
    webRef.current.injectJavaScript(`window.applyState(${JSON.stringify(buildState())}); true;`);
  }, [buildState]);

  useEffect(() => {
    push();
  }, [push]);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      let msg: any;
      try {
        msg = JSON.parse(e.nativeEvent.data);
      } catch {
        return;
      }
      if (msg.type === 'ready') {
        readyRef.current = true;
        push();
      } else if (msg.type === 'guess' && typeof msg.lat === 'number' && typeof msg.lng === 'number') {
        onGuessPositionChange?.({ lat: msg.lat, lng: msg.lng });
      }
    },
    [push, onGuessPositionChange],
  );

  return (
    <View style={styles.container}>
      <WebView
        key={'lm-' + HTML.length}
        ref={webRef}
        source={{ html: HTML }}
        originWhitelist={['*']}
        onMessage={onMessage}
        style={styles.webview}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        androidLayerType="hardware"
        // iOS WKWebView is hardware-accelerated; keep gestures inside the map.
        {...(Platform.OS === 'ios' ? { allowsInlineMediaPlayback: true } : {})}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#aadaff' },
  webview: { flex: 1, backgroundColor: '#aadaff' },
});
