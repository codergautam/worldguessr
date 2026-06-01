import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import Head from "next/head";
import { INBOUND, OUTBOUND, APPLY_FN } from "@/shared/embed/protocol";

// Chrome-less page that renders the real all-rounds results Leaflet map
// (components/ResultsMap.js) for the mobile app's WebView, so mobile reuses the
// exact web results map. Driven entirely by postMessage / injectJavaScript.
// ResultsMap touches window (Leaflet) → client-only, exactly like map.js:10.
const ResultsMap = dynamic(() => import("@/components/ResultsMap"), { ssr: false });

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

export default function EmbedResults() {
  // Serializable results props from the host.
  const [state, setState] = useState({
    rounds: [],
    activeRound: null,
    myId: null,
    isDuel: false,
    isCountryGuesser: false,
  });
  const [lang, setLang] = useState("en");

  // Bootstrap language (drives tile hl=) from the query string.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const l = q.get("lang");
    if (l && LANGS.includes(l)) {
      setLang(l);
      try {
        window.localStorage.setItem("lang", l);
        window.dispatchEvent(new CustomEvent("langChange", { detail: l }));
      } catch (e) {}
    }
  }, []);

  const applyInbound = useCallback((msg) => {
    if (!msg || (msg.type !== INBOUND.INIT && msg.type !== INBOUND.UPDATE_PROPS)) return;
    const props = msg.props || {};
    setState((prev) => ({ ...prev, ...props }));
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

  // Hand external maps links to the host (mobile opens them in the OS).
  const handleOpenMaps = useCallback(({ lat, lng, panoId }) => {
    postOut({ type: OUTBOUND.OPEN_MAPS, lat, lng, panoId });
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
        <ResultsMap
          rounds={state.rounds}
          activeRound={state.activeRound}
          myId={state.myId}
          isDuel={state.isDuel}
          isCountryGuesser={state.isCountryGuesser}
          lang={lang}
          onOpenMaps={handleOpenMaps}
        />
      </div>
    </>
  );
}
