/**
 * Google `vt` tile `scale` packs more pixels into each 256 CSS-pixel slot.
 * Keep the existing 2x supersampling on ordinary displays. On >2.5x phones,
 * ask Google for the ACTUAL DPR (the endpoint supports fractional scales such
 * as 2.625 and returns exactly 256 * scale pixels). Requesting scale=4 on a 3x
 * screen forced WebView to resample every 1024px tile to 768 physical pixels,
 * increasing decode cost and making independently sampled edges more visible.
 */
export function googleTileScale() {
  if (typeof window === 'undefined') return 2;
  const dpr = window.devicePixelRatio || 1;
  if (dpr <= 2.5) return 2;
  return Math.min(4, Math.round(dpr * 1000) / 1000);
}
