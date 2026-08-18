import { describe, it, expect } from 'vitest';
import parseMapData, { extractMapDetails, matchShortMapsLink, isResolvedMapsUrl } from '../components/utils/parseMapData.js';

// A REAL redirect target, captured live from
// https://maps.app.goo.gl/gPaD97yywtoKNY5Q8 (302 Location header). This is
// exactly the string api/map/action.js hands to the parser after expansion.
const RESOLVED_URL = 'https://www.google.com/maps/@44.8986742,7.1277414,3a,90y,90t/data=!3m7!1e1!3m5!1sENpKWO_kLulbyp5-aUlp_g!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3DENpKWO_kLulbyp5-aUlp_g%26yaw%3D0!7i13312!8i6656?entry=tts&g_ep=EgoyMDI2MDgxMi4wIPu8ASoASAFQAw%3D%3D';

const SHORT = 'https://maps.app.goo.gl/gPaD97yywtoKNY5Q8';

describe('extractMapDetails on a resolved short-link target', () => {
  it('reads coordinates and panoId from the redirect destination', () => {
    const d = extractMapDetails(RESOLVED_URL);
    expect(d).not.toBeNull();
    expect(d.lat).toBeCloseTo(44.8986742, 6);
    expect(d.lng).toBeCloseTo(7.1277414, 6);
    expect(d.panoId).toBe('ENpKWO_kLulbyp5-aUlp_g');
  });
});

describe('matchShortMapsLink', () => {
  it('accepts the app share form, with and without query params', () => {
    expect(matchShortMapsLink(SHORT)).toBe(SHORT);
    expect(matchShortMapsLink(`${SHORT}?g_st=ic`)).toBe(`${SHORT}?g_st=ic`);
  });

  it('accepts the legacy goo.gl/maps form and trims whitespace', () => {
    expect(matchShortMapsLink('https://goo.gl/maps/QqXhLcp1QAvZy4t76')).toBe('https://goo.gl/maps/QqXhLcp1QAvZy4t76');
    expect(matchShortMapsLink(`  ${SHORT}\n`)).toBe(SHORT);
  });

  // The server sends an HTTP request to whatever this matches. Every case
  // below is an SSRF attempt and MUST return null.
  it('rejects lookalike hosts and smuggled URLs', () => {
    expect(matchShortMapsLink('http://maps.app.goo.gl/x')).toBeNull(); // http
    expect(matchShortMapsLink('https://evil.com/maps.app.goo.gl/x')).toBeNull();
    expect(matchShortMapsLink('https://maps.app.goo.gl.evil.com/x')).toBeNull();
    expect(matchShortMapsLink('https://maps-app.goo.gl/x')).toBeNull();
    expect(matchShortMapsLink('https://goo.gl/notmaps/x')).toBeNull();
    expect(matchShortMapsLink(`see ${SHORT} here`)).toBeNull(); // embedded in text
    expect(matchShortMapsLink('https://maps.app.goo.gl/x/../../evil')).toBeNull();
    expect(matchShortMapsLink(RESOLVED_URL)).toBeNull(); // full URLs are not short links
  });
});

describe('isResolvedMapsUrl', () => {
  it('accepts Google-owned /maps/ destinations', () => {
    expect(isResolvedMapsUrl(RESOLVED_URL)).toBe(true);
    expect(isResolvedMapsUrl('https://google.com/maps/@1,2')).toBe(true);
    expect(isResolvedMapsUrl('https://maps.google.com/maps/@1,2')).toBe(true);
    expect(isResolvedMapsUrl('https://www.google.co.uk/maps/@1,2')).toBe(true);
  });

  it('rejects non-Google hosts and host-smuggling tricks', () => {
    expect(isResolvedMapsUrl('https://evil-google.com/maps/@1,2')).toBe(false);
    expect(isResolvedMapsUrl('https://google.com.evil.com/maps/@1,2')).toBe(false);
    expect(isResolvedMapsUrl('https://google.com@evil.com/maps/@1,2')).toBe(false);
    expect(isResolvedMapsUrl('https://google.com:8080/maps/@1,2')).toBe(false);
    expect(isResolvedMapsUrl('https://google.com/notmaps/@1,2')).toBe(false);
    expect(isResolvedMapsUrl(SHORT)).toBe(false);
  });
});

describe('parseMapData short-link pass-through', () => {
  it('preserves raw and JSON-quoted short links, parses everything else as before', () => {
    const out = parseMapData([
      RESOLVED_URL,          // full URL -> extracted object
      SHORT,                 // raw short link -> preserved string
      JSON.stringify(SHORT), // file-upload re-stringified form -> preserved string
      'complete junk',       // -> dropped
      JSON.stringify({ lat: 10, lng: 20 }), // JSON entry -> object
    ]);
    expect(out).toHaveLength(4);
    expect(out[0]).toMatchObject({ panoId: 'ENpKWO_kLulbyp5-aUlp_g' });
    expect(out[1]).toBe(SHORT);
    expect(out[2]).toBe(SHORT);
    expect(out[3]).toMatchObject({ lat: 10, lng: 20 });
  });

  it('still returns null when nothing is valid', () => {
    expect(parseMapData(['junk', 'more junk'])).toBeNull();
  });
});
