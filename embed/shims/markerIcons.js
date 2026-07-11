import L from 'leaflet';
// esbuild inlines these as data URLs (loader: { '.png': 'dataurl' }) so the pin
// images ship inside the bundle — no fetch('/dest.png'), no server needed.
import destUrl from '@/public/dest.png';
import srcUrl from '@/public/src.png';
import src2Url from '@/public/src2.png';
import polandballUrl from '@/public/polandball.png';

// Drop-in replacement for @/lib/markerIcons in the standalone embed. Mirrors the
// real getPinIcons() icon set exactly (sizes/anchors), but with inlined URLs.
let _icons = null;

export function preloadPinImages() {
  return Promise.resolve();
}

export function getPinIcons() {
  if (_icons) return _icons;
  const LL = (typeof window !== 'undefined' && window.L) || L;
  if (!LL) return null;
  const mk = (iconUrl, iconSize, iconAnchor, popupAnchor) =>
    LL.icon({ iconUrl, iconSize, iconAnchor, popupAnchor });
  _icons = {
    dest: mk(destUrl, [30, 49], [15, 49], [1, -34]),
    destSmall: mk(destUrl, [25, 41], [12, 41], [1, -34]),
    src: mk(srcUrl, [30, 49], [15, 49], [1, -34]),
    srcSmall: mk(srcUrl, [25, 41], [12, 41], [1, -34]),
    src2: mk(src2Url, [30, 49], [15, 49], [1, -34]),
    src2Small: mk(src2Url, [25, 41], [12, 41], [1, -34]),
    // "Big" tier (lib/markerIcons.js:93/111): the round's best guesser per
    // team renders enlarged. ResultsMap passes these UNGUARDED — omitting
    // them broke the best guesser's pin down to Leaflet's default marker.
    srcBig: mk(srcUrl, [36, 59], [18, 59], [1, -34]),
    src2Big: mk(src2Url, [36, 59], [18, 59], [1, -34]),
    polandball: mk(polandballUrl, [50, 82], [25, 41], [1, 5]),
  };
  return _icons;
}
