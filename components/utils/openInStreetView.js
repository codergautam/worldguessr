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
  process.env.NEXT_PUBLIC_6X === "true" ||
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
    // Synthetic anchor click, NOT window.open. Two bugs lived in the old
    // window.open(url, "_blank", "noopener,noreferrer") call:
    //  1. With `noopener` in the features string window.open returns null BY
    //     SPEC even when the tab opened, so the "popup blocked" fallback ran
    //     on every successful open — the link opened AND got copied, with the
    //     "copied to clipboard" toast on top.
    //  2. window.open creates the new context on about:blank first, then
    //     navigates it. On phones the navigation is taken over by the Google
    //     Maps app (intent / universal link), stranding that about:blank tab
    //     in the browser. A real link click lets the browser hand off to the
    //     app the same way a tapped <a> does — no orphan tab.
    // Gesture-driven anchor clicks aren't popup-blocked, so there is no
    // blocked case to detect; portals never reach this branch.
    try {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
      return Promise.resolve("opened");
    } catch (e) {
      // DOM refused (shouldn't happen) — fall through to the clipboard
      // rather than doing nothing.
    }
  }
  return copy(url).then((ok) => (ok ? "copied" : "failed"));
}
