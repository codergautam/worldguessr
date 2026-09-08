import getPlatform from "./getPlatform";

export default function sendEvent(name, params={}) {
  // No analytics stub on the 6x (Playgama) build, by requirement: a silent
  // no-op there, not a console line per event.
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  try {
    window.gtag("event", name, { platform: getPlatform(), ...params });
  } catch (e) {
    console.log("error sending gtag event", e);
  }
}
