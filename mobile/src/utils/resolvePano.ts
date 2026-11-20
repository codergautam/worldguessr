// Keyless lat/lng -> pano id lookup for the in-house Street View renderer.
//
// The original endpoint, GeoPhotoService.SingleImageSearch (JSONP GET), was
// turned down by Google: as of Nov 9 2026 every call answered "is
// decommissioned and turned down", so resolution failed on every No Move round
// and the wrapper fell back to the frozen Google embed. Players saw No Move
// behave exactly like NMPZ. This is the gRPC-web call the Maps JS client makes
// today. Same field layout as the old pb string, so the pano id still sits at
// json[1][1][1]; a miss is [[5,"generic","Search returned no images."]].
// Two-stage radius mirrors the web resolver's 50m-then-1000m net
// (customStreetView.js resolvePanoId).
const RPC_URL =
  'https://maps.googleapis.com/$rpc/google.internal.maps.mapsjs.v1.MapsJsInternalService/SingleImageSearch';

export function singleImageSearchRequest(lat: number, lng: number, radius: number) {
  const body = JSON.stringify([
    ['apiv3', null, null, null, 'US', null, null, null, null, null, [[0]]],
    [[null, null, lat, lng], radius],
    [null, ['en', 'US'], null, null, null, null, null, null, [2], null, [[[2, true, 2]]]],
    [[1, 2, 3, 4, 8, 6]],
  ]);
  return {
    url: RPC_URL,
    init: { method: 'POST', headers: { 'Content-Type': 'application/json+protobuf' }, body },
  };
}

export function parsePanoId(text: string): string | null {
  try {
    const id = JSON.parse(text)?.[1]?.[1]?.[1];
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

export async function resolvePanoNative(lat: number, long: number): Promise<string | null> {
  for (const radius of [50, 1000]) {
    try {
      const { url, init } = singleImageSearchRequest(lat, long, radius);
      const res = await withTimeout(fetch(url, init), 4000);
      const id = parsePanoId(await res.text());
      if (id) return id;
    } catch {
      // fall through to the wider radius / null
    }
  }
  return null;
}
