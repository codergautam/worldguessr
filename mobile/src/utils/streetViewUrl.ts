// Mirror of web's components/utils/openInStreetView.js streetViewUrl() — the
// documented Google Maps URLs API endpoint (user ruling July 28: the legacy
// maps?q=&layer=c&cbll format was unreliable). One builder for every mobile
// "open this spot in Street View" link.
//
// Passing BOTH pano and viewpoint is deliberate: the pano id takes precedence
// and Google FALLS BACK to the viewpoint when the id no longer resolves, so a
// stale panoId self-heals instead of opening a dead panorama. Never reinstate
// the old "coords first, drop the panoId" ordering — that was a workaround for
// the legacy endpoint.
export default function streetViewUrl({
  lat,
  lng,
  panoId,
  heading,
}: {
  lat?: number | null;
  lng?: number | null;
  panoId?: string | null;
  heading?: number | null;
}): string | null {
  const hasCoords = typeof lat === 'number' && typeof lng === 'number';
  if (!hasCoords && !panoId) return null;
  let url = 'https://www.google.com/maps/@?api=1&map_action=pano';
  if (hasCoords) url += `&viewpoint=${lat},${lng}`;
  if (typeof heading === 'number' && isFinite(heading)) url += `&heading=${heading}`;
  if (panoId) url += `&pano=${encodeURIComponent(panoId)}`;
  return url;
}
