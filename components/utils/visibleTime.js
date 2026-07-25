import sendEvent from "./sendEvent";

// Own-analytics session clock: counts seconds the tab is actually VISIBLE and
// flushes one site_time event per hide. Keys on visibilitychange, not focus —
// unlike GA4's engagement clock, clicking into the SV iframe does not pause
// it — and it is mode-blind: menus, singleplayer, multiplayer, daily and
// onboarding all count the same. SUM(seconds) per session = true session
// length.
let started = false;

export default function trackVisibleTime() {
  if (started || typeof document === "undefined") return;
  started = true;

  let visibleSince = document.visibilityState === "visible" ? Date.now() : null;
  let accumMs = 0;

  const flush = () => {
    if (visibleSince !== null) {
      // Clamp each visible stretch to 1h (same sanity cap as play_time):
      // system clock jumps produced single flushes worth WEEKS of seconds —
      // one such row was 67% of an experiment arm's total site_time.
      accumMs += Math.min(Math.max(Date.now() - visibleSince, 0), 3600000);
      visibleSince = null;
    }
    const seconds = Math.round(accumMs / 1000);
    if (seconds > 0) {
      sendEvent("site_time", { seconds });
      accumMs = 0;
    }
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flush();
    } else if (visibleSince === null) {
      visibleSince = Date.now();
    }
  });
  window.addEventListener("pagehide", flush);
}
