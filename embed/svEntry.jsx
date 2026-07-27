// Street View WebView entry: mounts the REAL in-house WebGL renderer
// (components/streetview/customStreetView.js — the exact component web's No
// Move / NMPZ modes use) inside the mobile app's WebView. Same READY /
// INIT / UPDATE_PROPS bridge as the Leaflet map embed (entry.jsx).
//
// Contract differences from the map embed:
// - The host must supply `panoId` WITH the coords (it resolves lat/lng → pano
//   natively; the in-page resolver is shimmed out — embed/shims/googleMapsLoader.js).
// - OUTBOUND.SV_LOADED replaces the WebView's onLoadEnd as the loading-cover
//   signal: the document loads in milliseconds while tiles are still streaming,
//   so document-load would lift the cover onto a black canvas every round.
//   CustomStreetView's onLoad (base tiles painted / failure / 8s failsafe)
//   is the only truthful "pano is visible" signal.
// - Reload rides the component's own window.reloadLoc contract via
//   injectJavaScript — no protocol message needed.
import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CustomStreetView from '@/components/streetview/customStreetView';
import { INBOUND, OUTBOUND, APPLY_FN } from '@/shared/embed/protocol';

// Transcribed from styles/globals.scss (.sv-compass block + the streetview
// rules the component's classes reference) — the web stylesheet isn't bundled
// here. Deviations from web, both deliberate:
// - no :hover rules (touch surface);
// - the compass lifts 88px off the bottom edge: the RN host draws its own
//   guess/map controls over the WebView's bottom-right corner.
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
html, body, #root { height: 100%; margin: 0; padding: 0; background: #1a1a2e; overflow: hidden; }
#streetview { transition: opacity 0.2s ease-out; background-color: #1a1a2e; }
#streetview.hidden { opacity: 0; pointer-events: none; }
canvas.streetview { cursor: pointer; }
.nmpz { pointer-events: none; }
.sv-compass {
  position: fixed;
  right: 7px;
  bottom: calc(88px + env(safe-area-inset-bottom));
  z-index: 101;
  width: 48px;
  height: 48px;
  box-sizing: border-box;
  background: #000;
  border-radius: 50%;
  box-shadow: 0 1px 4px -1px rgba(0, 0, 0, 0.3);
  user-select: none;
  opacity: 1;
  transition: opacity 0.2s ease-out;
  pointer-events: none;
}
.sv-compass__face, .sv-compass__rotate { pointer-events: auto; touch-action: none; }
.sv-compass--hidden { opacity: 0; }
/* TRAP (web parity): pointer-events:none on the container does NOT disable
   children that declare auto — every hidden/inert state must repeat the none
   ON THE CHILDREN or invisible live buttons eat taps during round loads. */
.sv-compass--hidden .sv-compass__face,
.sv-compass--hidden .sv-compass__rotate,
.sv-compass--frozen .sv-compass__face,
.sv-compass--frozen .sv-compass__rotate { pointer-events: none; }
.sv-compass__face {
  position: absolute; inset: 7px; padding: 0; margin: 0; border: 0;
  background: none; -webkit-appearance: none; appearance: none; cursor: pointer;
}
.sv-compass__face svg { display: block; width: 100%; height: 100%; overflow: visible; }
.sv-compass__rotate {
  position: absolute; top: 50%; transform: translateY(-50%);
  z-index: 1; /* above the face button's overlapping box */
  width: 13px; height: 22px; padding: 0; margin: 0; border: 0;
  background: none; -webkit-appearance: none; appearance: none; cursor: pointer;
  opacity: 0.85; transition: opacity 120ms ease;
}
.sv-compass__rotate svg { display: block; width: 100%; height: 100%; }
.sv-compass__rotate:active { opacity: 1; transform: translateY(-50%) scale(0.88); }
.sv-compass__rotate--ccw { left: 1px; }
.sv-compass__rotate--cw { right: 1px; }
`;
  document.head.appendChild(style);
}

function postOut(msg) {
  try {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  } catch (e) {}
  try {
    if (window.parent && window.parent !== window) window.parent.postMessage(msg, '*');
  } catch (e) {}
}

function App() {
  // Props arrive from the host; until coords + panoId land, CustomStreetView
  // renders null (hasCoords false) and the host's cover stays up.
  const [state, setState] = useState({});

  const applyInbound = useCallback((msg) => {
    if (!msg || (msg.type !== INBOUND.INIT && msg.type !== INBOUND.UPDATE_PROPS)) return;
    setState((prev) => ({ ...prev, ...(msg.props || {}) }));
  }, []);

  useEffect(() => {
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

  return (
    <CustomStreetView
      lat={state.lat}
      long={state.long}
      heading={state.heading}
      panoId={state.panoId ?? null}
      npz={!!state.npz}
      showAnswer={!!state.showAnswer}
      hidden={false}
      refreshKey={state.refreshKey ?? 0}
      prefetchPano={state.prefetchPano ?? null}
      onPrefetched={(panoId) => postOut({ type: OUTBOUND.SV_PREFETCHED, panoId })}
      onLoad={() => postOut({ type: OUTBOUND.SV_LOADED })}
    />
  );
}

createRoot(document.getElementById('root')).render(<App />);
