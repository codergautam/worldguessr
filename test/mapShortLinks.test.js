import { describe, it, expect, vi, afterEach } from 'vitest';
import { expandShortMapsLinks } from '../api/map/action.js';

// NOTE: resolveShortMapsLink caches successes module-wide, so every test
// uses its own unique fake code — a reused code would hit the cache and
// never reach the stubbed fetch.

const FULL = 'https://www.google.com/maps/@44.8986742,7.1277414,3a,90y,90t/data=!1sENpKWO_kLulbyp5-aUlp_g';

function fakeResponse({ status = 302, location = null }) {
  return {
    status,
    headers: { get: (name) => (name.toLowerCase() === 'location' ? location : null) },
  };
}

function stubFetch(responder) {
  const spy = vi.fn(async (url) => responder(url));
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('expandShortMapsLinks', () => {
  it('resolves a link once and fans it out to duplicate entries', async () => {
    const url = 'https://maps.app.goo.gl/dedupe0001';
    const spy = stubFetch(() => fakeResponse({ location: FULL }));
    const r = await expandShortMapsLinks([url, url, 'not a link']);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(r.data[0]).toBe(FULL);
    expect(r.data[1]).toBe(FULL);
    expect(r.data[2]).toBe('not a link');
    expect(r.failed).toEqual([]);
    expect(r.throttled).toBe(false);
  });

  it('serves repeat submissions from the cache without contacting Google', async () => {
    const url = 'https://maps.app.goo.gl/cached0001';
    const spy = stubFetch(() => fakeResponse({ location: FULL }));
    await expandShortMapsLinks([url]);
    const r2 = await expandShortMapsLinks([url]);
    expect(spy).toHaveBeenCalledTimes(1); // second pass = cache hit
    expect(r2.data[0]).toBe(FULL);
  });

  it('expands JSON-quoted entries, tolerating leading whitespace', async () => {
    const url = 'https://maps.app.goo.gl/quoted0001';
    stubFetch(() => fakeResponse({ location: FULL }));
    const r = await expandShortMapsLinks([`  ${JSON.stringify(url)}`]);
    expect(r.data[0]).toBe(FULL);
  });

  it('flags a 429 as throttling, not a dead link', async () => {
    const url = 'https://maps.app.goo.gl/limit00001';
    stubFetch(() => fakeResponse({ status: 429 }));
    const r = await expandShortMapsLinks([url]);
    expect(r.throttled).toBe(true);
    expect(r.failed).toEqual([url]);
    expect(r.data[0]).toBeNull();
  });

  it('flags the /sorry interstitial as throttling', async () => {
    const url = 'https://maps.app.goo.gl/sorry00001';
    stubFetch(() => fakeResponse({ location: 'https://www.google.com/sorry/index?continue=x' }));
    const r = await expandShortMapsLinks([url]);
    expect(r.throttled).toBe(true);
    expect(r.failed).toEqual([url]);
  });

  it('reports a dead link as failed without a throttle flag', async () => {
    const url = 'https://maps.app.goo.gl/dead000001';
    stubFetch(() => fakeResponse({ status: 404 }));
    const r = await expandShortMapsLinks([url]);
    expect(r.throttled).toBe(false);
    expect(r.failed).toEqual([url]);
  });

  it('unwraps the EU consent interstitial via ?continue=', async () => {
    const url = 'https://maps.app.goo.gl/consent001';
    const consent = `https://consent.google.com/ml?continue=${encodeURIComponent(FULL)}`;
    stubFetch(() => fakeResponse({ location: consent }));
    const r = await expandShortMapsLinks([url]);
    expect(r.data[0]).toBe(FULL);
    expect(r.failed).toEqual([]);
  });

  it('refuses a resolution that leaves Google-owned /maps/', async () => {
    const url = 'https://maps.app.goo.gl/hijack0001';
    stubFetch(() => fakeResponse({ location: 'https://evil.com/maps/@1,2' }));
    const r = await expandShortMapsLinks([url]);
    expect(r.failed).toEqual([url]);
    expect(r.data[0]).toBeNull();
  });

  it('passes non-array data through untouched', async () => {
    const spy = stubFetch(() => fakeResponse({ location: FULL }));
    const r = await expandShortMapsLinks('{"weird": "shape"}');
    expect(r.data).toBe('{"weird": "shape"}');
    expect(spy).not.toHaveBeenCalled();
  });
});
