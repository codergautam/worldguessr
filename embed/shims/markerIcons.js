import L from 'leaflet';
// esbuild inlines these as data URLs (loader: { '.png': 'dataurl' }) so the pin
// images ship inside the bundle — no fetch('/dest.png'), no server needed.
import destUrl from '@/public/dest.png';
import srcUrl from '@/public/src.png';
import src2Url from '@/public/src2.png';
import goldPinUrl from '@/public/pins/gold.png';
import neonOrangePinUrl from '@/public/pins/neonorange.png';
import neonPinkPinUrl from '@/public/pins/neonpink.png';
import rainbowPinUrl from '@/public/pins/rainbow.png';

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
  neonOrangePin: neonOrangePinUrl,
  neonPinkPin: neonPinkPinUrl,
  rainbowPin: rainbowPinUrl,
};

export const MARKER_SKIN_ICONS = {
  marker_gold_pin: 'goldPin',
  marker_neon_orange_pin: 'neonOrangePin',
  marker_neon_pink_pin: 'neonPinkPin',
  marker_rainbow_pin: 'rainbowPin',
};

export function markerSkinIconKey(sku, tier = '') {
  const base = sku ? MARKER_SKIN_ICONS[sku] : null;
  return base ? `${base}${tier}` : null;
}

/* ONE CANVAS SPEC FOR EVERY PIN IMAGE — mirror of lib/markerIcons.js, see the
 * full comment there. Art 87x131 inside a 151x163 canvas: 32px transparent
 * glow headroom on top and both sides, none on the bottom, so the needle tip
 * is the image's bottom-centre and the anchor stays exactly there. */
const ART_W = 87, ART_H = 131, GLOW_PAD = 32;
const IMG_W = ART_W + GLOW_PAD * 2;  // 151
const IMG_H = ART_H + GLOW_PAD;      // 163

function tierOpts(artW, artH) {
  const w = (IMG_W * artW) / ART_W;
  const h = (IMG_H * artH) / ART_H;
  return { iconSize: [w, h], iconAnchor: [w / 2, h], popupAnchor: [1, -34] };
}

export function preloadPinImages() {
  return Promise.resolve();
}

export function getPinIcons() {
  if (_icons) return _icons;
  const LL = (typeof window !== 'undefined' && window.L) || L;
  if (!LL) return null;
  const mk = (iconUrl, artW, artH) => LL.icon({ iconUrl, ...tierOpts(artW, artH) });
  _icons = {
    dest: mk(destUrl, 30, 49),
    destSmall: mk(destUrl, 25, 41),
    // "Mid" tier: the singleplayer reveal — between the cluster Small and stock.
    destMid: mk(destUrl, 28, 46),
    src: mk(srcUrl, 30, 49),
    srcSmall: mk(srcUrl, 25, 41),
    srcMid: mk(srcUrl, 28, 46),
    src2: mk(src2Url, 30, 49),
    src2Small: mk(src2Url, 25, 41),
    // "Big" tier (srcBig / src2Big in lib/markerIcons.js): the round's best
    // guesser per team renders enlarged. ResultsMap passes these UNGUARDED —
    // omitting them broke the best guesser's pin down to Leaflet's default.
    srcBig: mk(srcUrl, 36, 59),
    src2Big: mk(src2Url, 36, 59),
  };
  Object.entries(SKIN_URLS).forEach(([key, url]) => {
    _icons[key] = mk(url, 30, 49);
    _icons[`${key}Small`] = mk(url, 25, 41);
    _icons[`${key}Mid`] = mk(url, 28, 46);
    _icons[`${key}Big`] = mk(url, 36, 59);
  });
  return _icons;
}
