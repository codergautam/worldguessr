import { MARKER_SKIN_ICONS, getPinIcons, preloadPinImages } from '@/lib/markerIcons';

/* ===========================================================================
 *  Marker-skin preview images.
 *
 *  The skin pins are PNGs under public/pins, listed in lib/markerIcons.js and
 *  handed out only as Leaflet icon objects. There is ALREADY one hand-mirrored
 *  copy of that table (embed/shims/markerIcons.js, for the mobile WebView
 *  bundle) and a third copy of the paths here would be a third thing to keep in
 *  sync. So the shop reads the real icons instead of re-deriving the URLs.
 *
 *  TWO ORDERING RULES, BOTH LOAD-BEARING:
 *
 *   1. preloadPinImages() FIRST, ALWAYS. getPinIcons() memoises its icon set
 *      for the life of the page, and if the blob preload has not resolved it
 *      synthesises DIRECT asset URLs for the four PNG pins instead. Calling
 *      getPinIcons() cold from the shop would therefore lock the whole game
 *      map onto un-blobbed pins for the rest of the session. preloadPinImages
 *      is idempotent (it returns its own promise), so awaiting it here just
 *      warms a cache the map needs anyway.
 *
 *   2. Leaflet has to exist. getPinIcons() builds L.icon instances and returns
 *      null without window.L, and leaflet only arrives with the map chunk —
 *      which is not loaded on the home screen where the shop lives. The
 *      dynamic import below is fired ONLY when the Markers tab is opened, so
 *      it never touches the pre-interaction window, and leaflet is a chunk the
 *      player downloads the moment they start a game regardless.
 *
 *  Resolves to {} on any failure; the cards then render without a pin rather
 *  than breaking the tab.
 * ======================================================================== */

/**
 * Reserved key for the STOCK guess pin — what the map draws when no marker skin
 * is equipped, and therefore what the Pins section's Default card previews.
 *
 * It rides in the same sku -> url map so the Default card costs no second
 * leaflet import and no second preload: `src` is the icon components/Map.js
 * falls back to (`pinKeyFor(..., 'src')`), so this is literally the pin the
 * player gets back. The `__` prefix cannot collide with a catalogue sku (every
 * marker sku is `marker_*`).
 */
export const STOCK_PIN_KEY = '__stock';

let pending = null;

/** @returns {Promise<Record<string, string>>} sku -> image URL */
export function loadMarkerSkinUrls() {
  if (pending) return pending;

  pending = (async () => {
    await preloadPinImages().catch(() => {});
    if (typeof window !== 'undefined' && !window.L) {
      // Leaflet's UMD assigns window.L unconditionally on evaluation.
      await import('leaflet');
    }
    const icons = getPinIcons();
    const urls = {};
    Object.entries(MARKER_SKIN_ICONS).forEach(([sku, key]) => {
      const url = icons?.[key]?.options?.iconUrl;
      if (url) urls[sku] = url;
    });
    // The stock pin, for the Default card. Same icon set, same blob URL the map
    // itself will use — no extra fetch and no third copy of the asset path.
    const stock = icons?.src?.options?.iconUrl;
    if (stock) urls[STOCK_PIN_KEY] = stock;
    return urls;
  })().catch(() => ({}));

  return pending;
}
