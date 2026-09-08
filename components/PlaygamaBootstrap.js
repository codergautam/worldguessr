import { useEffect, useState } from "react";
import { loadPlaygamaBridge } from "./utils/playgamaBridge";
import { initializePlaygamaStorage, flushPlaygamaStorage } from "./utils/playgamaStorage";
import usePlaygamaPause from "./usePlaygamaPause";
import { useTranslation } from "./useTranslations";
import { refreshVolumesFromStorage } from "./utils/audio";

const supportedLanguages = ["en", "es", "fr", "de", "ru"];

export function resolvePlaygamaLanguage(language) {
  const code = String(language || "en").toLowerCase().split(/[-_]/)[0];
  return supportedLanguages.includes(code) ? code : "en";
}

// Mounted only by the 6x app shell. Keep the game unmounted until SDK saves
// are readable: mounting early would write default preferences over a save.
export default function PlaygamaBootstrap({ children }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const paused = usePlaygamaPause();
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    // A slow request can still succeed after this notice. Retry joins an
    // in-flight initialize rather than loading a second platform SDK.
    const timer = setTimeout(() => { if (!cancelled) setFailed(true); }, 30000);
    setFailed(false);
    (async () => {
      const bridge = await loadPlaygamaBridge();
      if (!bridge) throw new Error("Platform connection failed");
      const language = resolvePlaygamaLanguage(bridge.platform.language);
      await initializePlaygamaStorage(bridge);
      if (cancelled) return;
      refreshVolumesFromStorage();
      window.language = language;
      window.dispatchEvent(new CustomEvent("langChange", { detail: language }));
      setReady(true);
    })().catch((error) => {
      console.warn("[Playgama] game startup failed", error);
      if (!cancelled) setFailed(true);
    }).finally(() => clearTimeout(timer));
    return () => { cancelled = true; clearTimeout(timer); };
  }, [attempt]);

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

  if (!ready) return (
    <div style={{ ...coverStyle, zIndex: 0 }} role={failed ? "alert" : "status"}>
      <p>{failed ? t("platformConnectionFailed") : `${t("loading")}…`}</p>
      {failed && <button onClick={() => setAttempt((value) => value + 1)}>{t("retry")}</button>}
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

const coverStyle = {
  position: "fixed", inset: 0, zIndex: 20000, background: "rgba(12, 19, 32, 0.96)",
  color: "#fff", display: "flex", flexDirection: "column", alignItems: "center",
  justifyContent: "center", gap: "12px", fontFamily: "sans-serif",
};
