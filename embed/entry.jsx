import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import L from 'leaflet';
import leafletCss from 'leaflet/dist/leaflet.css';
import Map from '@/components/Map';
import ResultsMap from '@/components/ResultsMap';
import { INBOUND, OUTBOUND, APPLY_FN } from '@/shared/embed/protocol';

// Leaflet's UMD build sets window.L on import; make sure it's there for Map.js.
if (typeof window !== 'undefined' && !window.L) window.L = L;

// Inject Leaflet's CSS (bundled as text) + a full-bleed dark base.
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent =
    leafletCss +
    'html,body,#root{height:100%;margin:0;padding:0;background:#aadaff;overflow:hidden;}' +
    // Leaflet's default container background is light gray (#ddd). Both the live
    // in-game map and the results map use the light "map-water" blue (#aadaff,
    // matching the WEB results map's .leaflet-container from globals.scss) so the
    // band around the world tiles — and the letterbox briefly revealed above the
    // mini-map as it springs open — reads as water rather than a dark/gray void.
    '.leaflet-container{background:#aadaff !important;}' +
    // Match the app's main font (Lexend) on all Leaflet UI — tooltips, popups,
    // controls, attribution — instead of the browser default sans-serif. The font
    // itself is loaded via the Google Fonts <link> injected in embed/build.mjs.
    ".leaflet-container,.leaflet-container .leaflet-tooltip,.leaflet-container .leaflet-popup-content,.leaflet-control{font-family:'Lexend',sans-serif;}" +
    // Hide the Leaflet attribution badge (the "Leaflet | Google" link in the
    // bottom-right). It's a tappable link that navigates the WebView away with no
    // way back. The web app hides it via globals.scss, but that stylesheet isn't
    // bundled here, so replicate the rule for both embedded maps (Map + ResultsMap).
    '.leaflet-control-attribution{display:none !important;}' +
    // Mobile-only: hide the Leaflet zoom (+/-) control in the top-left. Touch users
    // pinch-to-zoom, so the buttons are redundant and clutter the full-screen map.
    // Scoped to this embed bundle (mobile WebView), so the web version is unaffected.
    '.leaflet-control-zoom{display:none !important;}' +
    // Mobile-only: hide the Google logo (the .mapAttr image rendered by Map.js in
    // the bottom-left). Same reasoning — only the mobile embed gets this rule.
    '.mapAttr{display:none !important;}';
  document.head.appendChild(style);
}

const LANGS = ['en', 'es', 'fr', 'de', 'ru'];

// Reach whichever host is present: RN WebView and/or an iframe parent.
function postOut(msg) {
  try {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  } catch (e) {}
  try {
    if (window.parent && window.parent !== window) window.parent.postMessage(msg, '*');
  } catch (e) {}
}

// Live in-game map: owns pinPoint locally (so Map.js's tap→pin→line stays
// internal) and reports guesses/distance out.
function MapEmbed({ state }) {
  const [pinPoint, setPinPoint] = useState(null);
  const pinSeeded = useRef(false);
  const interactiveRef = useRef(true);

  useEffect(() => {
    if ('interactive' in state) interactiveRef.current = state.interactive !== false;
    if ('pinPoint' in state) {
      if (state.pinPoint == null) {
        setPinPoint(null);
        pinSeeded.current = false;
      } else if (!pinSeeded.current) {
        setPinPoint(state.pinPoint);
        pinSeeded.current = true;
      }
    }
  }, [state]);

  // The guess→answer line is a canvas vector that re-projects while the host grows
  // the map to full screen — that mid-resize redraw looks glitchy. Hide the vector
  // pane (lines + any circle) the instant the answer shows, then fade it back in
  // once the map is full-screen. Markers + tiles are in other panes, so they're
  // untouched. (Only the mobile embed runs this; web renders Map.js directly.)
  useLayoutEffect(() => {
    const pane = document.querySelector('.leaflet-overlay-pane');
    if (!pane) return undefined;
    if (!state.answerShown) {
      pane.style.transition = 'none';
      pane.style.opacity = '1';
      return undefined;
    }
    pane.style.transition = 'none';
    pane.style.opacity = '0';
    const t = setTimeout(() => {
      pane.style.transition = 'opacity 0.4s ease';
      pane.style.opacity = '1';
    }, 650);
    return () => clearTimeout(t);
  }, [state.answerShown]);

  const handleSetPinPoint = useCallback((ll) => {
    if (interactiveRef.current === false) return;
    setPinPoint(ll || null);
    if (ll && typeof ll.lat === 'number' && typeof ll.lng === 'number') {
      postOut({ type: OUTBOUND.GUESS, lat: ll.lat, lng: ll.lng });
    }
  }, []);

  const handleSetKm = useCallback((km) => postOut({ type: OUTBOUND.KM, km }), []);
  const handleRevealReady = useCallback(() => postOut({ type: OUTBOUND.REVEAL_READY }), []);

  // The mobile host keeps this WebView's native frame full-screen at all times and
  // clips it to a bottom band while guessing — so the result reveal never resizes
  // the native WebView (which is what produced the "map snaps to top:0 then reflows"
  // flicker). To match, we render the Leaflet map into that same bottom band while
  // guessing (so the fit is byte-for-byte the old mini-map) and expand it to full
  // on the answer reveal. Bottom-anchored so it grows upward in place. No band
  // (web / iframe) → always full-screen, unchanged behavior.
  const band = typeof state.mapBandFraction === 'number' ? state.mapBandFraction : null;
  const showFull = !!state.answerShown || band == null || band <= 0 || band >= 1;
  const wrapStyle = showFull
    ? { position: 'fixed', inset: 0 }
    : { position: 'fixed', left: 0, right: 0, bottom: 0, height: band * 100 + '%' };

  return (
    <div style={wrapStyle}>
      <Map
        shown={state.shown}
        options={state.options}
        lang={state.lang}
        answerShown={state.answerShown}
        location={state.location}
        gameOptions={state.gameOptions}
        showHint={state.showHint}
        round={state.round}
        multiplayerState={state.multiplayerState}
        countryGuessPin={state.countryGuessPin}
        stopCameraAnimations={state.stopCameraAnimations}
        resetKey={state.resetKey}
        cameraCancelKey={state.cameraCancelKey}
        bandFraction={band}
        session={state.session}
        ws={null}
        pinPoint={pinPoint}
        setPinPoint={handleSetPinPoint}
        setKm={handleSetKm}
        onRevealReady={handleRevealReady}
      />
    </div>
  );
}

// All-rounds results map.
function ResultsEmbed({ state }) {
  const onOpenMaps = useCallback(
    (info) => postOut({ type: OUTBOUND.OPEN_MAPS, ...info }),
    [],
  );
  return (
    <div className="embed-results" style={{ position: 'fixed', inset: 0 }}>
      <ResultsMap
        rounds={state.rounds || []}
        activeRound={state.activeRound ?? null}
        myId={state.myId ?? null}
        selectedPlayer={state.selectedPlayer ?? null}
        isDuel={!!state.isDuel}
        teams={state.teams ?? null}
        isCountryGuesser={!!state.isCountryGuesser}
        lang={state.lang || 'en'}
        mapType={state.mapType || 'm'}
        onOpenMaps={onOpenMaps}
      />
    </div>
  );
}

function App() {
  const [state, setState] = useState({ mode: 'map' });

  const applyInbound = useCallback((msg) => {
    if (!msg || (msg.type !== INBOUND.INIT && msg.type !== INBOUND.UPDATE_PROPS)) return;
    const props = msg.props || {};
    if (props.lang && LANGS.includes(props.lang)) {
      try {
        window.localStorage.setItem('lang', props.lang);
        window.dispatchEvent(new CustomEvent('langChange', { detail: props.lang }));
      } catch (e) {}
    }
    setState((prev) => ({ ...prev, ...props }));
  }, []);

  useEffect(() => {
    // Primary inbound channel for the RN host (injectJavaScript); iframe parents
    // use 'message'. Emit ready only once both are wired.
    window[APPLY_FN] = (m) => {
      try {
        applyInbound(typeof m === 'string' ? JSON.parse(m) : m);
      } catch (e) {}
    };
    const onMessage = (e) => {
      if (e && e.data && typeof e.data === 'object') applyInbound(e.data);
    };
    window.addEventListener('message', onMessage);
    postOut({ type: OUTBOUND.READY });
    return () => {
      window.removeEventListener('message', onMessage);
      try {
        delete window[APPLY_FN];
      } catch (e) {}
    };
  }, [applyInbound]);

  return state.mode === 'results' ? <ResultsEmbed state={state} /> : <MapEmbed state={state} />;
}

createRoot(document.getElementById('root')).render(<App />);
