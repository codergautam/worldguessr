import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parsePanoId,
  resolvePanoNative,
  singleImageSearchRequest,
} from '../mobile/src/utils/resolvePano.ts';

// Real responses from the live RPC endpoint, Nov 9 2026 (hit trimmed).
const HIT =
  '[[0],[[1],[2,"zpXm1qNHGh9bdDRcDHorEw"],[2,2,[6656,13312],[[[[208,416]]],[512,512]],null,null,null,null,null,"zpXm1qNHGh9bdDRcDHorEw"],[],[[[["© 2026 Google"]]]]]]';
const MISS = '[[5,"generic","Search returned no images."]]';
// What the retired JSONP endpoint answers now; must never parse as a pano.
const DEAD =
  '/**/cb && cb( [[5,"generic","GeoPhotoService.SingleImageSearch is decommissioned and turned down."]] )';

const respond = (text) => Promise.resolve({ text: () => Promise.resolve(text) });

describe('mobile pano resolver', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the pano id out of a hit and nothing out of a miss', () => {
    expect(parsePanoId(HIT)).toBe('zpXm1qNHGh9bdDRcDHorEw');
    expect(parsePanoId(MISS)).toBeNull();
    expect(parsePanoId(DEAD)).toBeNull();
    expect(parsePanoId('')).toBeNull();
  });

  it('posts a json+protobuf body carrying the coords and radius to the RPC endpoint', () => {
    const { url, init } = singleImageSearchRequest(48.85837, 2.294481, 50);
    expect(url).toBe(
      'https://maps.googleapis.com/$rpc/google.internal.maps.mapsjs.v1.MapsJsInternalService/SingleImageSearch',
    );
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json+protobuf');
    const body = JSON.parse(init.body);
    expect(body[1]).toEqual([[null, null, 48.85837, 2.294481], 50]);
  });

  it('widens from 50m to 1000m before giving up', async () => {
    const fetchMock = vi.fn().mockImplementationOnce(() => respond(MISS)).mockImplementationOnce(() => respond(HIT));
    vi.stubGlobal('fetch', fetchMock);
    await expect(resolvePanoNative(1, 2)).resolves.toBe('zpXm1qNHGh9bdDRcDHorEw');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)[1][1]).toBe(50);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)[1][1]).toBe(1000);
  });

  it('returns null when both radii miss or the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respond(MISS)));
    await expect(resolvePanoNative(30, -40)).resolves.toBeNull();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await expect(resolvePanoNative(30, -40)).resolves.toBeNull();
  });
});
