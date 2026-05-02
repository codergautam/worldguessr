import { inIframe } from "./inIframe";

export function getPlatform() {
  try {
    if (process.env.NEXT_PUBLIC_GAMEDISTRIBUTION === "true") {
      return "gamedistribution";
    } else if (process.env.NEXT_PUBLIC_COOLMATH === "true") {
      return "coolmath";
    } else if (typeof window !== "undefined" && window.CrazyGames) {
      return "crazygames";
    } else if (
      typeof window !== "undefined" &&
      (window.location.hostname === "worldguessr.com" ||
        window.location.hostname === "www.worldguessr.com")
    ) {
      return "worldguessr";
    } else {
      if (inIframe()) {
        try {
          const ancestorOrigin = window?.location?.ancestorOrigins?.[0] ?? document.referrer;
          const url = new URL(ancestorOrigin);
          return url.hostname.slice(0, 20);
        } catch (e) {
          return "unknown_iframe";
        }
      } else {
        if (typeof window !== "undefined" && window.location && window.location.hostname) {
          return window.location.hostname.slice(0, 20);
        }
        return "unknown";
      }
    }
  } catch (e) {
    return "error";
  }
}

export default getPlatform;
