import { asset } from '@/lib/basePath';

// Module-level icon cache — created once, reused everywhere.
// Leaflet (window.L) may not exist at import time, so we lazily
// initialise on first call and return the cached objects thereafter.

let _icons = null;
let _blobUrls = null; // { '/src.png': 'blob:...', ... }
let _preloadPromise = null;

/**
 * Fetch each pin image once as a blob and create object URLs.
 * Object URLs point to in-memory data and NEVER trigger network requests
 * no matter how many <img> elements use them.
 * Returns a promise that resolves to a map of original-url → blob-url.
 */
export function preloadPinImages() {
  if (_preloadPromise) return _preloadPromise;

  const paths = [
    { key: 'dest', path: '/dest.png' },
    { key: 'src', path: '/src.png' },
    { key: 'src2', path: '/src2.png' },
    { key: 'polandball', path: '/polandball.png' },
  ];

  _preloadPromise = Promise.all(
    paths.map(({ key, path }) =>
      fetch(asset(path))
        .then((r) => r.blob())
        .then((blob) => ({ key, blobUrl: URL.createObjectURL(blob) }))
    )
  ).then((results) => {
    _blobUrls = {};
    results.forEach(({ key, blobUrl }) => {
      _blobUrls[key] = blobUrl;
    });
    return _blobUrls;
  });

  return _preloadPromise;
}

/**
 * Returns the shared Leaflet icon instances, or null if not ready yet.
 * Call preloadPinImages() first (from home.js) so blob URLs are available.
 * Requires window.L to be available.
 */
export function getPinIcons() {
  if (_icons) return _icons;

  const L = window.L;
  if (!L || !_blobUrls) return null;

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
