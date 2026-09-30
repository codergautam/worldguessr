const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const panoCache = new Map();

export async function resolveGooglePano(lat, lng, knownPanoId) {
  if (typeof knownPanoId === 'string' && knownPanoId.length) {
    return { panoId: knownPanoId, lat, lng };
  }

  const cacheKey = `${lat},${lng}`;
  const cached = panoCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error('Google Maps server key unavailable');
  const query = new URLSearchParams({ location: `${lat},${lng}`, source: 'outdoor', key });
  const response = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?${query}`);
  if (!response.ok) throw new Error('Google Maps metadata request failed');
  const data = await response.json();
  if (data.status !== 'OK' || typeof data.pano_id !== 'string' || !data.location) {
    throw new Error('Street View panorama unavailable');
  }

  const value = { panoId: data.pano_id, lat: data.location.lat, lng: data.location.lng };
  panoCache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  if (panoCache.size > 10000) {
    for (const [key, entry] of panoCache) {
      if (entry.expiresAt <= Date.now()) panoCache.delete(key);
    }
    while (panoCache.size > 10000) panoCache.delete(panoCache.keys().next().value);
  }
  return value;
}
