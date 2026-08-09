import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it, expect } from 'vitest';
import { SHOP_CATALOG } from '../shared/shop/catalog.js';
import { PREPAINT_SITE_BG_SCRIPT, accentForSku } from '../lib/siteBackground.js';

// The accent is the palette the HOME SCREEN recolours itself to when a player
// equips a background (styles/globals.scss, .home__content/.hudCorner). It is
// pure data with no runtime that can complain, and it is edited by hand one
// city at a time, so the things that can go wrong with it are all typos. This
// file pins the three that would actually be visible.

const BACKGROUNDS = SHOP_CATALOG.filter((item) => item.type === 'background');
const HEX = /^#[0-9a-f]{6}$/i;

// Rec. 709 luma. Exact coefficients do not matter here — any sane weighting
// answers the only question being asked, which is "does this row get lighter".
function luma(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe('background catalogue', () => {
  it('ships the ten cities the shelf is priced around', () => {
    expect(BACKGROUNDS).toHaveLength(10);
  });

  it('sells every background on both storefronts', () => {
    // Backgrounds were web-only until the app could load a remote WebP. A row
    // that silently loses 'mobile' takes itself off half the shelf without
    // failing anything, which is why it is asserted rather than assumed.
    for (const bg of BACKGROUNDS) {
      expect(bg.platforms, bg.sku).toEqual(['web', 'mobile']);
    }
  });

  it('points every sku at a file that actually exists under public/', () => {
    // A path that 404s renders as NO background at all — the player pays and
    // sees the default. The catalogue owns these strings outright, so this is
    // the only place the claim can be checked.
    for (const bg of BACKGROUNDS) {
      const onDisk = fileURLToPath(new URL(`../public${bg.path}`, import.meta.url));
      expect(existsSync(onDisk), `${bg.sku} -> ${bg.path}`).toBe(true);
    }
  });

  it('gives every background three well-formed tones', () => {
    for (const bg of BACKGROUNDS) {
      expect(bg.accent, bg.sku).toBeTruthy();
      for (const tone of ['deep', 'wash', 'surface']) {
        expect(bg.accent[tone], `${bg.sku}.${tone}`).toMatch(HEX);
      }
    }
  });

  it('orders every palette deep -> wash -> surface, darkest first', () => {
    // THE ONE WAY TO GET THIS VISIBLY WRONG. `deep` draws the 1.4px rims,
    // `surface` fills the button faces. Invert them on a row and that city
    // renders a menu whose borders glow brighter than the buttons they
    // enclose, which reads as a rendering bug rather than a colour choice.
    for (const bg of BACKGROUNDS) {
      const { deep, wash, surface } = bg.accent;
      expect(luma(deep), `${bg.sku}: deep must be darker than wash`).toBeLessThan(luma(wash));
      expect(luma(wash), `${bg.sku}: wash must be darker than surface`).toBeLessThan(luma(surface));
    }
  });
});

describe('accentForSku', () => {
  it('resolves a real background to channel triplets plus the deep hex', () => {
    // New York is the row the whole feature was built for: a dark purple
    // photograph is what made the green menu read as broken.
    expect(accentForSku('bg_newyork')).toEqual({
      wash: [0x25, 0x1a, 0x4d],
      surface: [0x3b, 0x2a, 0x6e],
      deep: '#170f2e',
    });
  });

  it('resolves every catalogued background', () => {
    for (const bg of BACKGROUNDS) {
      const accent = accentForSku(bg.sku);
      expect(accent, bg.sku).not.toBeNull();
      expect(accent.wash, bg.sku).toHaveLength(3);
      expect(accent.surface, bg.sku).toHaveLength(3);
    }
  });

  it('has not drifted from the hand-maintained mobile mirror', () => {
    // mobile/src/shared/cosmetics.ts restates this table because the app needs
    // it on the home screen's FIRST frame, before any shop call. Its own header
    // says the glow rows have drifted before, and a drifted background is worse
    // than a drifted glow: it is the app painting a different city from the one
    // the buyer paid for on web.
    //
    // Read as TEXT rather than imported, because vitest excludes mobile/** and
    // this repo has no TypeScript transform. That is enough — the failure being
    // guarded is a value that was changed in one file and not the other.
    const mirror = readFileSync(
      fileURLToPath(new URL('../mobile/src/shared/cosmetics.ts', import.meta.url)),
      'utf8',
    );
    for (const bg of BACKGROUNDS) {
      for (const value of [bg.sku, bg.path, bg.accent.deep, bg.accent.wash, bg.accent.surface]) {
        expect(mirror, `${bg.sku}: mirror is missing ${value}`).toContain(value);
      }
    }
  });

  it('returns null for nothing, for junk, and for a sku of another type', () => {
    // The equipped slot is server data that a client renders without asking
    // twice, so a revoked sku, a glow in the background slot, or a tampered
    // payload all have to land on "no accent" rather than on a throw.
    expect(accentForSku(null)).toBeNull();
    expect(accentForSku(undefined)).toBeNull();
    expect(accentForSku('')).toBeNull();
    expect(accentForSku('bg_atlantis')).toBeNull();
    expect(accentForSku('glow_ice')).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * The pre-paint script is a hand-minified string interpolated into <head>, so
 * nothing else in the toolchain ever looks at it: a syntax error there is a
 * throw in front of every visitor's first paint, and a regex that stops
 * matching is an owner silently losing their colours. It runs happily under a
 * stubbed document, so it gets tested like code because it is code.
 * ------------------------------------------------------------------------ */
function runPrepaint(bg, accent) {
  const props = {};
  const preloads = [];
  globalThis.document = {
    // The script bails on the first line for anyone with no JS-visible cookie,
    // which is how a first-time visitor never touches localStorage at all.
    cookie: '_ga=1',
    documentElement: { style: { setProperty: (k, v) => { props[k] = v; } } },
    createElement: () => ({}),
    head: { appendChild: (link) => preloads.push(link) },
  };
  globalThis.localStorage = {
    getItem: (k) => (k === 'wg_site_bg' ? bg : k === 'wg_bg_accent' ? accent : null),
  };
  new Function(PREPAINT_SITE_BG_SCRIPT)();
  return { props, preloads };
}

describe('PREPAINT_SITE_BG_SCRIPT', () => {
  afterEach(() => {
    delete globalThis.document;
    delete globalThis.localStorage;
  });

  it('is syntactically valid JavaScript', () => {
    expect(() => new Function(PREPAINT_SITE_BG_SCRIPT)).not.toThrow();
  });

  it('paints the remembered city and its palette before first paint', () => {
    const { props, preloads } = runPrepaint(
      '/backgrounds/bg-newyork.webp',
      '37,26,77|59,42,110|#170f2e',
    );
    expect(props['--site-bg']).toBe('url("/backgrounds/bg-newyork.webp")');
    expect(props['--accWashR']).toBe('37');
    expect(props['--accWashG']).toBe('26');
    expect(props['--accWashB']).toBe('77');
    expect(props['--accSurfR']).toBe('59');
    expect(props['--accSurfG']).toBe('42');
    expect(props['--accSurfB']).toBe('110');
    expect(props['--accDeep']).toBe('#170f2e');
    // The matching high-priority preload, so the image is fetched at the same
    // priority the baked default gets rather than discovered late by the CSS.
    expect(preloads).toHaveLength(1);
  });

  it('refuses a poisoned accent outright and keeps the photograph', () => {
    // These values are interpolated into CSS custom properties. A localStorage
    // entry carrying quotes or parens could otherwise close the declaration and
    // inject its own — so the format is pinned, and anything else is dropped
    // whole rather than partially applied.
    const { props } = runPrepaint('/backgrounds/bg-rio.webp', '1,2,3|4,5,6|#fff"); evil()');
    expect(Object.keys(props).filter((k) => k.startsWith('--acc'))).toHaveLength(0);
    expect(props['--site-bg']).toBe('url("/backgrounds/bg-rio.webp")');
  });

  it('refuses a poisoned path, which also skips the accent', () => {
    const { props, preloads } = runPrepaint('javascript:alert(1)', '37,26,77|59,42,110|#170f2e');
    expect(props).toEqual({});
    expect(preloads).toHaveLength(0);
  });

  it('leaves the menu green when a background has no accent yet', () => {
    const { props } = runPrepaint('/backgrounds/bg-agra.webp', null);
    expect(props['--site-bg']).toBe('url("/backgrounds/bg-agra.webp")');
    expect(props['--accDeep']).toBeUndefined();
  });

  it('costs a visitor with no cookie nothing at all', () => {
    globalThis.document = { cookie: '' };
    globalThis.localStorage = {
      getItem: () => { throw new Error('storage must not be touched'); },
    };
    expect(() => new Function(PREPAINT_SITE_BG_SCRIPT)()).not.toThrow();
  });
});
