import { NO_EXTERNAL_LINKS } from "./externalLinks";

// One implementation for every "open this spot in Street View" button. There
// were two near-identical copies (roundOverScreen, ResultsMap); one re-derived
// the portal list inline, the other had no portal check at all and so silently
// did nothing on CrazyGames/Poki.

// CrazyGames sets its flag at runtime; the rest are build-time.
const embeddedPortal = () =>
  NO_EXTERNAL_LINKS ||
  process.env.NEXT_PUBLIC_COOLMATH === "true" ||
  process.env.NEXT_PUBLIC_POKI === "true" ||
  (typeof window !== "undefined" && !!window.inCrazyGames);

// Google Maps URLs API — the documented endpoint (user ruling July 28: the
// legacy maps?q=&layer=c&cbll format was unreliable). Exported: click-driven
// surfaces go through openInStreetView below; href surfaces (daily round
// badges) embed the URL directly.
//
// Passing BOTH pano and viewpoint is deliberate, and it retires the old
// "lat/lng first, map-file panoIds are stale" ordering rule: with this
// endpoint the pano id takes precedence and Google FALLS BACK to the
// viewpoint when the id no longer resolves, so a stale panoId self-heals
// instead of opening a dead panorama.
export function streetViewUrl({ lat, lng, panoId, heading } = {}) {
  const hasCoords = typeof lat === "number" && typeof lng === "number";
  if (!hasCoords && !panoId) return null;
  let url = "https://www.google.com/maps/@?api=1&map_action=pano";
  if (hasCoords) url += `&viewpoint=${lat},${lng}`;
  if (typeof heading === "number" && isFinite(heading)) url += `&heading=${heading}`;
  if (panoId) url += `&pano=${encodeURIComponent(panoId)}`;
  return url;
}

function copy(url) {
  const legacy = () => {
    try {
      const el = document.createElement("textarea");
      el.value = url;
      el.setAttribute("readonly", "");
      el.style.cssText = "position:fixed;top:-1000px";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      return true;
    } catch (e) {
      return false;
    }
  };
  return navigator?.clipboard?.writeText
    ? navigator.clipboard.writeText(url).then(() => true).catch(legacy)
    : Promise.resolve(legacy());
}

/** @returns Promise<"opened" | "copied" | "failed"> */
export default function openInStreetView({ lat, lng, panoId, heading } = {}) {
  const url = streetViewUrl({ lat, lng, panoId, heading });
  if (!url || typeof window === "undefined") return Promise.resolve("failed");

  if (!embeddedPortal()) {
    let win = null;
    // noopener: otherwise the opened tab can navigate this one via window.opener.
    try { win = window.open(url, "_blank", "noopener,noreferrer"); } catch (e) {}
    if (win) return Promise.resolve("opened");
    // null = popup blocker, or GameDistribution's guard replacing window.open
    // with a no-op. Fall through to the clipboard rather than doing nothing.
  }
  return copy(url).then((ok) => (ok ? "copied" : "failed"));
}
