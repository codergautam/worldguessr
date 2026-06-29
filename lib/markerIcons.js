import { asset } from '@/lib/basePath';

// Module-level icon cache — created once, reused everywhere.
// Leaflet (window.L) may not exist at import time, so we lazily
// initialise on first call and return the cached objects thereafter.

let _icons = null;
let _blobUrls = null; // { dest: 'blob:...' | '/dest.png', ... }
let _preloadPromise = null;

const PIN_PATHS = [
  { key: 'dest', path: '/dest.png' },
  { key: 'src', path: '/src.png' },
  { key: 'src2', path: '/src2.png' },
  { key: 'polandball', path: '/polandball.png' },
];

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

  return _icons;
}
