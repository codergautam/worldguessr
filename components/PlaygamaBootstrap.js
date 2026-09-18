import { useEffect, useState } from "react";
import { loadPlaygamaBridge, subscribePlaygamaReady } from "./utils/playgamaBridge";
import { initializePlaygamaStorage, attachPlaygamaStorage, flushPlaygamaStorage, EXPLICIT_LANGUAGE_KEY } from "./utils/playgamaStorage";
import usePlaygamaPause from "./usePlaygamaPause";
import { useTranslation, supportedLangs } from "./useTranslations";
import { refreshVolumesFromStorage } from "./utils/audio";
import gameStorage from "./utils/localStorage";

// Docs (API → required steps): platform.language is the source language,
// read once after initialization. Owner ruling 2026-09-18: a language the
// player chose in the settings menu (saved through Bridge storage as "lang"
// plus the explicit-choice marker) wins over it on later launches; the
// platform language applies otherwise.
export function resolvePlaygamaLanguage(language, savedChoice = null) {
  const supported = supportedLangs();
  if (supported.includes(savedChoice)) return savedChoice;
  const code = String(language || "en").toLowerCase().split(/[-_]/)[0];
  return supported.includes(code) ? code : "en";
}

function resolveBootLanguage(platformLanguage) {
  const explicit = gameStorage.getItem(EXPLICIT_LANGUAGE_KEY) === "1" ? gameStorage.getItem("lang") : null;
  return resolvePlaygamaLanguage(platformLanguage, explicit);
}

function publishLanguage(language) {
  if (window.language === language) return;
  window.language = language;
  window.dispatchEvent(new CustomEvent("langChange", { detail: language }));
}

// Mounted only by the 6x app shell. Keep the game unmounted until the SDK
// has initialized (docs: wait for initialize() before any bridge.* call) and
// the save has been read once: mounting early would write default
// preferences over a save. Neither step can fail the gate: an unavailable
// SDK or save degrades to memory-only play (moderation rejects "technical
// messages, errors, crashes, freezing"), never to an error screen.
export default function PlaygamaBootstrap({ children }) {
  const [ready, setReady] = useState(false);
  const paused = usePlaygamaPause();
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    (async () => {
      const bridge = await loadPlaygamaBridge();
      if (!bridge) console.warn("[Playgama] SDK unavailable; playing without platform services");
      await initializePlaygamaStorage(bridge);
      if (cancelled) return;
      refreshVolumesFromStorage();
      publishLanguage(resolveBootLanguage(bridge?.platform?.language));
      setReady(true);
      if (bridge) return;
      // A transient load failure is retried by headContent once the game
      // mounts. When that succeeds, attach the save (cloud base, this
      // session's changes overlaid) and apply the platform language.
      unsubscribe = subscribePlaygamaReady((lateBridge) => {
        attachPlaygamaStorage(lateBridge).then((attached) => {
          if (cancelled || !attached) return;
          refreshVolumesFromStorage();
          publishLanguage(resolveBootLanguage(lateBridge?.platform?.language));
        }).catch(() => {});
      });
    })().catch((error) => {
      console.warn("[Playgama] game startup failed; mounting anyway", error);
      if (cancelled) return;
      if (!window.language) window.language = "en";
      setReady(true);
    });
    return () => { cancelled = true; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const flush = () => { flushPlaygamaStorage().catch(() => {}); };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    window.addEventListener("online", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("online", flush);
    };
  }, [ready]);

  // Language-neutral first frame: the platform language is not known until
  // the SDK initializes, so the loader carries no text.
  if (!ready) return (
    <div style={{ ...coverStyle, zIndex: 0 }} role="status" aria-busy="true">
      <style>{"@keyframes pg-boot-spin{to{transform:rotate(360deg)}}"}</style>
      <div style={spinnerStyle} />
    </div>
  );

  // Isolate the game stacking context: the pause cover must sit UNDER the
  // SDK's own ad/dialog overlays, which it appends outside the React tree.
  return <div style={{ position: "relative", isolation: "isolate", zIndex: 0 }}>
    {/* inert preserves the panorama and game mounts while blocking focus,
        pointer and keyboard input underneath the platform/ad pause. */}
    <div inert={paused || undefined} style={{ display: "contents" }}>{children}</div>
    {paused && <div style={coverStyle} role="status">{t("gamePaused")}</div>}
  </div>;
}

// Above every in-game fixed control (the duel reload button in home.js sits
// at 1000000); input is already blocked by `inert`, this keeps the cover on
// top visually.
const coverStyle = {
  position: "fixed", inset: 0, zIndex: 1000001, background: "rgba(12, 19, 32, 0.96)",
  color: "#fff", display: "flex", flexDirection: "column", alignItems: "center",
  justifyContent: "center", gap: "12px", fontFamily: "sans-serif",
};

const spinnerStyle = {
  width: "48px", height: "48px", borderRadius: "50%",
  border: "4px solid rgba(255, 255, 255, 0.25)", borderTopColor: "#fff",
  animation: "pg-boot-spin 0.9s linear infinite",
};
