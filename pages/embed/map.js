import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import Head from "next/head";
import { INBOUND, OUTBOUND, APPLY_FN } from "@/shared/embed/protocol";

// Chrome-less page that renders the real in-game Leaflet map (components/Map.js)
// for the mobile app's WebView. Driven entirely by postMessage / injectJavaScript
// so mobile reuses the exact web map. Map touches window (Leaflet) → client-only,
// exactly like gameUI.js:28.
const Map = dynamic(() => import("@/components/Map"), { ssr: false });

const LANGS = ["en", "es", "fr", "de", "ru"];

// Send a message to whichever host is present: RN WebView and/or iframe parent.
function postOut(msg) {
  if (typeof window === "undefined") return;
  try {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  } catch (e) {}
  try {
    if (window.parent && window.parent !== window) window.parent.postMessage(msg, "*");
  } catch (e) {}
}

export default function EmbedMap() {
  // Serializable Map props from the host. pinPoint is owned LOCALLY so Map.js's
  // tap → pin → line flow stays internal and only {lat,lng} crosses the bridge.
  const [mapProps, setMapProps] = useState({});
  const [pinPoint, setPinPoint] = useState(null);
  const pinSeededRef = useRef(false);
  // Country/continent mode places guesses via buttons, not map taps; the host
  // sets interactive=false so a tap doesn't drop a pin.
  const interactiveRef = useRef(true);

  // Bootstrap language (drives tile hl=) + initial map type from the query string.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const lang = q.get("lang");
    if (lang && LANGS.includes(lang)) {
      try {
        window.localStorage.setItem("lang", lang);
        window.dispatchEvent(new CustomEvent("langChange", { detail: lang }));
      } catch (e) {}
    }
    const mapType = q.get("mapType");
    if (mapType) setMapProps((p) => ({ ...p, options: { ...(p.options || {}), mapType } }));
  }, []);

  const applyInbound = useCallback((msg) => {
    if (!msg || (msg.type !== INBOUND.INIT && msg.type !== INBOUND.UPDATE_PROPS)) return;
    const props = msg.props || {};
    if ("pinPoint" in props) {
      // Host clears the pin (null) on a new round; otherwise seed once and then
      // let taps own it (avoids an echo loop when the host mirrors our guess back).
      if (props.pinPoint == null) {
        setPinPoint(null);
        pinSeededRef.current = false;
      } else if (!pinSeededRef.current) {
        setPinPoint(props.pinPoint);
        pinSeededRef.current = true;
      }
    }
    if ("interactive" in props) interactiveRef.current = props.interactive !== false;
    // pinPoint + interactive are handled here, not forwarded to Map.js.
    const { pinPoint: _omitPin, interactive: _omitInteractive, ...rest } = props;
    if (Object.keys(rest).length) setMapProps((prev) => ({ ...prev, ...rest }));
  }, []);

  // Inbound channels: RN injectJavaScript('window.__embedApply(...)') is primary
  // (reliable); iframe 'message' events are also supported. Emit `ready` only
  // after both are wired so the host's readyRef gate never sends into the void.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window[APPLY_FN] = (m) => {
      try {
        applyInbound(typeof m === "string" ? JSON.parse(m) : m);
      } catch (e) {}
    };
    const onMessage = (e) => {
      if (e && e.data && typeof e.data === "object") applyInbound(e.data);
    };
    window.addEventListener("message", onMessage);
    postOut({ type: OUTBOUND.READY });
    return () => {
      window.removeEventListener("message", onMessage);
      try {
        delete window[APPLY_FN];
      } catch (e) {}
    };
  }, [applyInbound]);

  // Map.js calls setPinPoint(L.latLng) on tap; mirror to local state + report out.
  const handleSetPinPoint = useCallback((latlng) => {
    if (interactiveRef.current === false) return; // country/continent: ignore taps
    setPinPoint(latlng || null);
    if (latlng && typeof latlng.lat === "number" && typeof latlng.lng === "number") {
      postOut({ type: OUTBOUND.GUESS, lat: latlng.lat, lng: latlng.lng });
    }
  }, []);

  const handleSetKm = useCallback((km) => {
    postOut({ type: OUTBOUND.KM, km });
  }, []);

  return (
    <>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        <style>{`html,body,#__next{height:100%;margin:0;padding:0;background:#08120d;overflow:hidden;}`}</style>
      </Head>
      <div style={{ position: "fixed", inset: 0 }}>
        <Map
          {...mapProps}
          ws={null}
          pinPoint={pinPoint}
          setPinPoint={handleSetPinPoint}
          setKm={handleSetKm}
        />
      </div>
    </>
  );
}
