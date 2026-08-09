import L from 'leaflet';
// esbuild inlines these as data URLs (loader: { '.png': 'dataurl' }) so the pin
// images ship inside the bundle — no fetch('/dest.png'), no server needed.
import destUrl from '@/public/dest.png';
import srcUrl from '@/public/src.png';
import src2Url from '@/public/src2.png';
import goldPinUrl from '@/public/pins/gold.png';

// Drop-in replacement for @/lib/markerIcons in the standalone embed. Mirrors the
// real getPinIcons() icon set exactly (sizes/anchors), but with inlined URLs.
//
// ⚠ HAND-MAINTAINED MIRROR. Every key lib/markerIcons.js exposes must exist
// here too: this file IS the icon set inside the WebView, and a missing key
// hands Leaflet `undefined`, which it silently replaces with its own default
// blue marker. There is no error, on either side.
let _icons = null;

/* Shop marker skins. Same deal as the stock pins: a real PNG, inlined by the
   same dataurl loader. Keep the geometry, the sku table and the size tiers
   identical to lib/markerIcons.js. */
const SKIN_URLS = {
  goldPin: goldPinUrl,
};

export const MARKER_SKIN_ICONS = {
  marker_gold_pin: 'goldPin',
};

export function markerSkinIconKey(sku, tier = '') {
  const base = sku ? MARKER_SKIN_ICONS[sku] : null;
  return base ? `${base}${tier}` : null;
}

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
    // "Big" tier (srcBig / src2Big in lib/markerIcons.js): the round's best
    // guesser per team renders enlarged. ResultsMap passes these UNGUARDED —
    // omitting them broke the best guesser's pin down to Leaflet's default.
    srcBig: mk(srcUrl, [36, 59], [18, 59], [1, -34]),
    src2Big: mk(src2Url, [36, 59], [18, 59], [1, -34]),
  };
  Object.entries(SKIN_URLS).forEach(([key, url]) => {
    _icons[key] = mk(url, [30, 49], [15, 49], [1, -34]);
    _icons[`${key}Small`] = mk(url, [25, 41], [12, 41], [1, -34]);
    _icons[`${key}Big`] = mk(url, [36, 59], [18, 59], [1, -34]);
  });
  return _icons;
}
