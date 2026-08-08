import { asset } from '@/lib/basePath';

// Module-level icon cache — created once, reused everywhere.
// Leaflet (window.L) may not exist at import time, so we lazily
// initialise on first call and return the cached objects thereafter.

let _icons = null;
let _blobUrls = null; // { dest: 'blob:...' | '/dest.png', ... }
let _preloadPromise = null;

/**
 * Shop sku → base icon key. The size tiers are the key plus a suffix, exactly
 * like the stock pins (`goldPin` / `goldPinSmall` / `goldPinBig`), so a skinned
 * pin still enlarges when it is the guess that counted.
 *
 * MIRRORED in embed/shims/markerIcons.js — keep both tables identical.
 */
export const MARKER_SKIN_ICONS = {
  marker_gold_pin: 'goldPin',
};

/** Icon keys the skin table above hands out, i.e. the keys that need tiers. */
const SKIN_KEYS = Object.values(MARKER_SKIN_ICONS);

const PIN_PATHS = [
  { key: 'dest', path: '/dest.png' },
  { key: 'src', path: '/src.png' },
  { key: 'src2', path: '/src2.png' },
  { key: 'polandball', path: '/polandball.png' },
  /* Purchasable marker skins (shop `type: 'marker'`) are ORDINARY PIN IMAGES.
   * They are authored at the stock pins' exact pixel size (87x131) and live on
   * this same list, so they get the same preload, the same blob cache and the
   * same 30x49 teardrop geometry — there is nothing special about a skin.
   *
   * ⚠ ANY NEW SKIN MUST BE ADDED TO embed/shims/markerIcons.js TOO. That shim
   * is the whole icon set the mobile WebView sees; a key that exists only here
   * resolves to `undefined` there and Leaflet silently swaps in its own default
   * blue marker. There is no error, on either side. */
  { key: 'goldPin', path: '/pins/gold.png' },
];

/**
 * Icon key for an equipped marker sku at a size tier, or null when the sku is
 * absent/unknown (so callers fall straight through to their normal pin).
 * @param {string|null} sku    cosmetics.equipped.markerSkin
 * @param {''|'Small'|'Big'} tier
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
    dest: L.icon({
      iconUrl: _blobUrls.dest,
      iconSize: [30, 49],
      iconAnchor: [15, 49],
      popupAnchor: [1, -34],
    }),
    destSmall: L.icon({
      iconUrl: _blobUrls.dest,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
    }),
    src: L.icon({
      iconUrl: _blobUrls.src,
      iconSize: [30, 49],
      iconAnchor: [15, 49],
      popupAnchor: [1, -34],
    }),
    // "Big" tier: the round's best (closest) guesser per team renders enlarged
    // so the carrying guess pops out of the pin cluster at a glance.
    srcBig: L.icon({
      iconUrl: _blobUrls.src,
      iconSize: [36, 59],
      iconAnchor: [18, 59],
      popupAnchor: [1, -34],
    }),
    srcSmall: L.icon({
      iconUrl: _blobUrls.src,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
    }),
    src2: L.icon({
      iconUrl: _blobUrls.src2,
      iconSize: [30, 49],
      iconAnchor: [15, 49],
      popupAnchor: [1, -34],
    }),
    src2Big: L.icon({
      iconUrl: _blobUrls.src2,
      iconSize: [36, 59],
      iconAnchor: [18, 59],
      popupAnchor: [1, -34],
    }),
    src2Small: L.icon({
      iconUrl: _blobUrls.src2,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
    }),
    polandball: L.icon({
      iconUrl: _blobUrls.polandball,
      iconSize: [50, 82],
      iconAnchor: [25, 41],
      popupAnchor: [1, 5],
    }),
  };

  // Shop marker skins, all three size tiers, same geometry as the stock pins.
  SKIN_KEYS.forEach((key) => {
    const url = _blobUrls[key];
    _icons[key] = L.icon({ iconUrl: url, iconSize: [30, 49], iconAnchor: [15, 49], popupAnchor: [1, -34] });
    _icons[`${key}Small`] = L.icon({ iconUrl: url, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] });
    _icons[`${key}Big`] = L.icon({ iconUrl: url, iconSize: [36, 59], iconAnchor: [18, 59], popupAnchor: [1, -34] });
  });

  return _icons;
}
