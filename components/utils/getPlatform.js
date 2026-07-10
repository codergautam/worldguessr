import { inIframe } from "./inIframe";

export function getPlatform() {
  try {
    if (process.env.NEXT_PUBLIC_GAMEDISTRIBUTION === "true") {
      return "gamedistribution";
    } else if (process.env.NEXT_PUBLIC_SCHOOLGUESSR === "true") {
      return "schoolguessr";
    } else if (process.env.NEXT_PUBLIC_COOLMATH === "true") {
      return "coolmath";
    } else if (process.env.NEXT_PUBLIC_POKI === "true") {
      // Build-time flag beats the iframe fallback below so the Poki audience
      // is tagged deterministically (their sandbox origins vary).
      return "poki";
    } else if (typeof window !== "undefined" && window.CrazyGames) {
      return "crazygames";
    } else if (typeof window === "undefined") {
      return "unknown";
    } else if (inIframe()) {
      // Embedded: classify by the parent (ancestor) origin BEFORE falling back
      // to our own hostname, otherwise CMG (which iframes worldguessr.com) would
      // be mislabeled as "worldguessr".
      try {
        const ancestorOrigin = window?.location?.ancestorOrigins?.[0] ?? document.referrer;
        const url = new URL(ancestorOrigin);
        if (url.hostname.includes("coolmathgames.com")) {
          return "coolmath";
        }
        return url.hostname.slice(0, 20);
      } catch (e) {
        return "unknown_iframe";
      }
    } else if (
      window.location.hostname === "worldguessr.com" ||
      window.location.hostname === "www.worldguessr.com"
    ) {
      return "worldguessr";
    } else if (window.location && window.location.hostname) {
      return window.location.hostname.slice(0, 20);
    } else {
      return "unknown";
    }
  } catch (e) {
    return "error";
  }
}

export default getPlatform;
