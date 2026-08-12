import { asset } from '@/lib/basePath';

// Module-level icon cache — created once, reused everywhere.
// Leaflet (window.L) may not exist at import time, so we lazily
// initialise on first call and return the cached objects thereafter.

let _icons = null;
let _blobUrls = null; // { dest: 'blob:...' | '/dest-v2.png', ... }
let _preloadPromise = null;

/**
 * Shop sku → base icon key. The size tiers are the key plus a suffix, exactly
 * like the stock pins (`skyPin` / `skyPinSmall` / `skyPinBig`), so a skinned
 * pin still enlarges when it is the guess that counted.
 *
 * MIRRORED in embed/shims/markerIcons.js — keep both tables identical.
 */
export const MARKER_SKIN_ICONS = {
  marker_neon_orange_pin: 'neonOrangePin',
  marker_neon_pink_pin: 'neonPinkPin',
  marker_sky_pin: 'skyPin',
  marker_emerald_pin: 'emeraldPin',
  marker_rainbow_pin: 'rainbowPin',
};

/** Icon keys the skin table above hands out, i.e. the keys that need tiers. */
const SKIN_KEYS = Object.values(MARKER_SKIN_ICONS);

/* ===========================================================================
 * ONE CANVAS SPEC FOR EVERY PIN IMAGE — art box + glow headroom.
 *
 * The pin ART is authored at 87x131, but the PNG canvas is 150x163. The extra
 * transparent field sits above and beside the art, with NONE on the bottom. That
 * asymmetry is the whole contract: the needle tip touches the bottom edge at
 * the horizontal centre, so the icon anchor is simply the image's
 * bottom-centre. Sky, Emerald and Rainbow fit their authored effects inside
 * that field without changing the pin's apparent map size.
 *
 * The three tier sizes below are what the ART renders at, unchanged from the
 * edge-to-edge era; the icon box is scaled up around the art from these
 * constants. Change the canvas constants only in lockstep with re-exporting every PNG
 * (public/dest-v2|src-v2|src2-v2.png, public/pins/*, mobile/assets/pins/*) — the
 * numbers here describe the files, they do not command them.
 *
 * The stock pins are named `-v2` because their ORIGINAL urls (/src.png,
 * /src2.png, /dest.png) served the edge-to-edge 87x131 files from 2024 until
 * Aug 2026. Browser and CDN caches everywhere still hold those bytes, and a
 * stale 87x131 copy stretched into this canvas's icon box reads visibly fat.
 * Those urls are burned; the rename is the cache-bust. If the canvas
 * proportions ever change again, bump every renamed file to `-v3` — never
 * reuse a filename whose cached copies have different proportions.
 *
 * MIRRORED in embed/shims/markerIcons.js — keep both copies identical.
 * ======================================================================== */
const ART_W = 87, ART_H = 131;
const IMG_W = 150, IMG_H = 163;

/** Icon options rendering the ART at artW x artH, anchored at the needle tip
 *  (= image bottom-centre). popupAnchor is relative to the anchor, so it is
 *  the same on every tier, as it always was. */
function tierOpts(artW, artH) {
  const w = (IMG_W * artW) / ART_W;
  const h = (IMG_H * artH) / ART_H;
  return { iconSize: [w, h], iconAnchor: [w / 2, h], popupAnchor: [1, -34] };
}

// Exported for components/shop/markerPins.js, which derives the shop's
// preview-thumbnail path (/pins/previews/<basename>) from each map asset's
// path — one table, two readers, no third copy of the filenames.
export const PIN_PATHS = [
  { key: 'dest', path: '/dest-v2.png' },
  { key: 'src', path: '/src-v2.png' },
  { key: 'src2', path: '/src2-v2.png' },
  /* Purchasable marker skins (shop `type: 'marker'`) are ORDINARY PIN IMAGES.
   * They are authored on the stock pins' exact canvas (the 150x163 spec above:
   * 87x131 art + glow headroom) and live on this same list, so they get the
   * same preload, the same blob cache and the same teardrop geometry — there
   * is nothing special about a skin.
   *
   * ⚠ ANY NEW SKIN MUST BE ADDED TO embed/shims/markerIcons.js TOO. That shim
   * is the whole icon set the mobile WebView sees; a key that exists only here
   * resolves to `undefined` there and Leaflet silently swaps in its own default
   * blue marker. There is no error, on either side. */
  { key: 'neonOrangePin', path: '/pins/neonorange.png' },
  { key: 'neonPinkPin', path: '/pins/neonpink.png' },
  { key: 'skyPin', path: '/pins/sky.png' },
  { key: 'emeraldPin', path: '/pins/emerald.png' },
  { key: 'rainbowPin', path: '/pins/rainbow.png' },
];

/**
 * Icon key for an equipped marker sku at a size tier, or null when the sku is
 * absent/unknown (so callers fall straight through to their normal pin).
 * @param {string|null} sku    cosmetics.equipped.markerSkin
 * @param {''|'Small'|'Mid'|'Big'} tier
 */
export function markerSkinIconKey(sku, tier = '') {
  const base = sku ? MARKER_SKIN_ICONS[sku] : null;
  return base ? `${base}${tier}` : null;
}

/**
 * Fetch each pin image once as a blob and create object URLs.
 * Object URLs point to in-memory data and NEVER trigger network requests
 * no matter how many <img> elements use them.
 *
 * If a fetch fails (offline, ad blocker, flaky network), fall back to the
 * direct asset URL for that pin — Leaflet still works, we just lose the
 * "no re-network" optimisation for that one image. Critically, this prevents
 * `_blobUrls` from staying null forever, which would otherwise leave
 * `getPinIcons()` returning null and crash downstream Leaflet markers.
 */
export function preloadPinImages() {
  if (_preloadPromise) return _preloadPromise;

  _preloadPromise = Promise.all(
    PIN_PATHS.map(({ key, path }) => {
      const directUrl = asset(path);
      return fetch(directUrl)
        .then((r) => {
          if (!r.ok) throw new Error(`pin ${key} HTTP ${r.status}`);
          return r.blob();
        })
        .then((blob) => ({ key, url: URL.createObjectURL(blob) }))
        .catch(() => ({ key, url: directUrl })); // fallback: direct URL
    })
  ).then((results) => {
    _blobUrls = {};
    results.forEach(({ key, url }) => {
      _blobUrls[key] = url;
    });
    return _blobUrls;
  });

  return _preloadPromise;
}

/**
 * Returns the shared Leaflet icon instances, or null only if Leaflet itself
 * isn't loaded yet. Falls back to direct asset URLs if the blob preload was
 * never run or failed — never returns a partially-formed icon set, so
 * downstream callers can rely on every key existing.
 */
export function getPinIcons() {
  if (_icons) return _icons;

  const L = window.L;
  if (!L) return null;

  // Synthesise direct-URL fallbacks if preload never ran or failed for some keys.
  if (!_blobUrls) _blobUrls = {};
  PIN_PATHS.forEach(({ key, path }) => {
    if (!_blobUrls[key]) _blobUrls[key] = asset(path);
  });

  _icons = {
    dest: L.icon({ iconUrl: _blobUrls.dest, ...tierOpts(30, 49) }),
    destSmall: L.icon({ iconUrl: _blobUrls.dest, ...tierOpts(25, 41) }),
    // "Mid" tier: the singleplayer reveal. Only two markers on the map there,
    // so pins read a notch larger than the multiplayer cluster's Small — but
    // the stock 30x49 overpowers the corner minimap.
    destMid: L.icon({ iconUrl: _blobUrls.dest, ...tierOpts(28, 46) }),
    src: L.icon({ iconUrl: _blobUrls.src, ...tierOpts(30, 49) }),
    // "Big" tier: the round's best (closest) guesser per team renders enlarged
    // so the carrying guess pops out of the pin cluster at a glance.
    srcBig: L.icon({ iconUrl: _blobUrls.src, ...tierOpts(36, 59) }),
    srcSmall: L.icon({ iconUrl: _blobUrls.src, ...tierOpts(25, 41) }),
    srcMid: L.icon({ iconUrl: _blobUrls.src, ...tierOpts(28, 46) }),
    src2: L.icon({ iconUrl: _blobUrls.src2, ...tierOpts(30, 49) }),
    src2Big: L.icon({ iconUrl: _blobUrls.src2, ...tierOpts(36, 59) }),
    src2Small: L.icon({ iconUrl: _blobUrls.src2, ...tierOpts(25, 41) }),
  };

  // Shop marker skins, all four size tiers, same geometry as the stock pins.
  SKIN_KEYS.forEach((key) => {
    const url = _blobUrls[key];
    _icons[key] = L.icon({ iconUrl: url, ...tierOpts(30, 49) });
    _icons[`${key}Small`] = L.icon({ iconUrl: url, ...tierOpts(25, 41) });
    _icons[`${key}Mid`] = L.icon({ iconUrl: url, ...tierOpts(28, 46) });
    _icons[`${key}Big`] = L.icon({ iconUrl: url, ...tierOpts(36, 59) });
  });

  return _icons;
}
