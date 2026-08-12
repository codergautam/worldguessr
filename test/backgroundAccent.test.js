import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it, expect } from 'vitest';
import { SHOP_CATALOG } from '../shared/shop/catalog.js';
import {
  PREPAINT_SITE_BG_SCRIPT,
  ACCENT_VAR_NAMES,
  accentForSku,
  accentStyleVars,
} from '../lib/siteBackground.js';

// The accent is the palette every MENU recolours itself to when a player equips
// a background (styles/globals.scss). It is pure data with no runtime that can
// complain, and it is edited by hand one city at a time, so the things that can
// go wrong with it are all typos. This file pins the ones that would actually
// be visible — plus, at the bottom, the two structural rules the whole design
// rests on: the tint is opt-in per selector, and it never reaches :root.

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

describe('accentStyleVars', () => {
  it('writes exactly the properties applySiteAccent clears', () => {
    // The two writers are a <html> style and a React style prop, and they had
    // better name the same seven things: whatever accentStyleVars sets is what
    // applySiteAccent's removeProperty loop has to be able to take away again.
    // A name added to one and not the other is a property nothing ever clears.
    const vars = accentStyleVars(accentForSku('bg_newyork'));
    expect(Object.keys(vars).sort()).toEqual([...ACCENT_VAR_NAMES].sort());
  });

  it('carries the palette through unchanged, as strings', () => {
    expect(accentStyleVars(accentForSku('bg_newyork'))).toEqual({
      '--accWashR': '37', '--accWashG': '26', '--accWashB': '77',
      '--accSurfR': '59', '--accSurfG': '42', '--accSurfB': '110',
      '--accDeep': '#170f2e',
    });
  });

  it('returns null for no accent, so a caller can spread-or-omit', () => {
    // A public profile whose subject has nothing equipped must render with NO
    // properties set, not with seven empty ones — the scope's green fallbacks
    // only apply to a property that was never declared.
    expect(accentStyleVars(null)).toBeNull();
    expect(accentStyleVars(accentForSku('bg_atlantis'))).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * THE OPT-IN, AS A TEST.
 *
 * The whole design is one rule: --acc* is read in exactly ONE place in the
 * stylesheet, a named list of menu roots, and NEVER at :root. Wire it at :root
 * and a menu cosmetic repaints the in-game HUD; drop a selector from the list
 * and that surface silently goes back to green. Neither failure throws, neither
 * shows up in a build, and both are invisible until somebody equips New York.
 * ------------------------------------------------------------------------ */
// Normalized to LF: these assertions anchor regexes on \n, and a Windows
// checkout (or an editor resave) hands the working tree CRLF — which nulls the
// match and fails four tests over line endings rather than over CSS.
const GLOBALS = readFileSync(
  fileURLToPath(new URL('../styles/globals.scss', import.meta.url)),
  'utf8',
).replace(/\r\n/g, '\n');

/** The one rule that reads the accent: its selector list and its body. */
const SCOPE = GLOBALS.match(/\n(\.home__content,[\s\S]*?)\{([\s\S]*?)\n\}/);

describe('the accent scope in globals.scss', () => {
  it('exists, and starts at .home__content', () => {
    expect(SCOPE).not.toBeNull();
  });

  it('covers every surface that is meant to wear the tint', () => {
    // Each of these is a menu or page root. Removing one is how a surface goes
    // back to green without anything failing.
    for (const selector of [
      '.home__content',      // the menu
      '.hudCorner',          // home + the matchmaking queue
      '.account-modal',      // the profile modal (and the shop's wallet chip)
      '.settingsPage',       // settings, including its confirm dialogs
      '.shop',               // the storefront
      '.map-modal-content',  // the maps modal
      '.maps-page',          // the standalone /maps page
      '.user-profile-page',  // a public profile, tinted by its SUBJECT
    ]) {
      expect(SCOPE[1], `accent scope is missing ${selector}`).toContain(selector);
    }
  });

  it('re-declares both bases and the wash, then re-includes the mixin', () => {
    // var() inside a custom property resolves where it is DECLARED, so a scope
    // that changes --r without re-including the mixin gets a new base and the
    // old finished gradients. That failure looks like a half-recoloured menu.
    for (const decl of ['--r:', '--g:', '--b:', '--surfR:', '--surfG:', '--surfB:',
      '--washChannels:', '--primaryDark:', '@include wg-theme-derived']) {
      expect(SCOPE[2], `accent scope is missing ${decl}`).toContain(decl);
    }
  });

  it('falls back to the green literals on every single property', () => {
    // This is what makes the whole feature free for the ~99% who own nothing:
    // with no accent set the scope computes to exactly what :root said. A
    // missing fallback is a property that resolves to nothing, which takes the
    // entire declaration with it.
    for (const fallback of ['--accWashR, 20', '--accWashG, 65', '--accWashB, 25',
      '--accSurfR, 36', '--accSurfG, 87', '--accSurfB, 52', '--accDeep, #112b18']) {
      expect(SCOPE[2], `accent scope is missing the fallback ${fallback}`).toContain(fallback);
    }
  });

  it('covers the shop PLATE, which .shop cannot reach', () => {
    // ui/Modal's dialog node is an ANCESTOR of .shop, and it carries the two
    // biggest surfaces in the storefront: the opaque panel fill and the 2px
    // --primary frame. A custom property declared on .shop cannot travel up to
    // it, so it has to be named here in its own right. The :has() is what keeps
    // the tint off every other dialog ui/Modal renders.
    expect(SCOPE[1]).toContain('.modal:has(>.modal-content>.shop)');
  });

  it('is the ONLY place in the stylesheet that reads --acc*', () => {
    // The load-bearing one. :root declares the accent properties (the pre-paint
    // script has nowhere else to write before any element exists), so reading
    // them there would repaint the leaderboard, the daily and every pixel of a
    // round off a menu cosmetic.
    const withoutScope = GLOBALS.replace(SCOPE[0], '\n');
    expect(withoutScope).not.toContain('var(--acc');
  });
});

describe("the shop's panel ladder", () => {
  // The shop is the one surface with no photograph behind it — its panel is an
  // opaque plate covering the viewport, so the three panel tones ARE the screen.
  // Retinting only its buttons left the storefront green after everything else
  // had changed, which is the bug this block guards against coming back.
  // Same LF normalization as GLOBALS above, same reason.
  const SHOP = readFileSync(
    fileURLToPath(new URL('../styles/shop.css', import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');
  const OVERRIDE = SHOP.match(/\n(\.shop,\n\.modal-backdrop[^{]*)\{([\s\S]*?)\n\}/);

  it('keeps the hand-picked green literals on :root', () => {
    // These are the values a stock shop renders, and they must not become a
    // formula's approximation of themselves.
    for (const literal of ['--shopBg: #06160e', '--shopRaise: #0f2417', '--shopWell: #030a06']) {
      expect(SHOP).toContain(literal);
    }
  });

  it('overrides all three on .shop AND on the plate', () => {
    expect(OVERRIDE).not.toBeNull();
    for (const token of ['--shopBg:', '--shopRaise:', '--shopWell:']) {
      expect(OVERRIDE[2], `panel override is missing ${token}`).toContain(token);
    }
  });

  it('reads --accWash* with no fallback, so the tint goes guaranteed-invalid', () => {
    // Half of the mechanism. A fallback on these references would mean the
    // formula ALWAYS resolves, and every stock shop would silently render the
    // formula's approximation of the hand-picked greens instead of the greens.
    expect(OVERRIDE[2]).toContain('var(--accWashR)');
    expect(OVERRIDE[2]).not.toMatch(/var\(--accWash[RGB]\s*,/);
  });

  it('catches that invalid value with a literal var() fallback', () => {
    // THE OTHER HALF, and the half that shipped broken once. A guaranteed-
    // invalid custom property does NOT fall back to the inherited :root value —
    // it shadows it, and `background: var(--shopBg)` then computes to
    // `transparent` because background is not an inherited property. The whole
    // stock shop went see-through. Only a var() FALLBACK catches it.
    for (const [token, literal] of [
      ['--shopBg', '#06160e'], ['--shopRaise', '#0f2417'], ['--shopWell', '#030a06'],
    ]) {
      expect(OVERRIDE[2], `${token} must catch its tint with the literal`)
        .toContain(`${token}: var(${token}Tint, ${literal})`);
    }
  });

  it('keeps the scoped fallbacks equal to the :root literals', () => {
    // The literals appear twice — once on :root, once as the fallback — because
    // a var() fallback cannot reference the property being declared. Nothing in
    // CSS ties them together, so this does.
    for (const [token, literal] of [
      ['--shopBg', '#06160e'], ['--shopRaise', '#0f2417'], ['--shopWell', '#030a06'],
    ]) {
      expect(SHOP, `${token}: :root literal and scoped fallback disagree`)
        .toContain(`${token}: ${literal}`);
      expect(OVERRIDE[2]).toContain(`${token}Tint, ${literal})`);
    }
  });
});

describe('the shop background dissolve', () => {
  const SHOP = readFileSync(
    fileURLToPath(new URL('../styles/shop.css', import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');
  const SURFACE = SHOP.match(
    /\.modal-backdrop\.modal-backdrop--shopFullscreen>\.modal\.shopFullscreen\s*\{([^}]*)\}/,
  );
  const INCOMING = SHOP.match(
    /html\.site-bg-swap[^{}]*\.shopFullscreen::before\s*\{([^}]*)\}/,
  );
  const WASH = SHOP.match(
    /\.modal-backdrop\.modal-backdrop--shopFullscreen>\.modal\.shopFullscreen::after\s*\{([^}]*)\}/,
  );

  it('crossfades the photographs without fading the darkness wash', () => {
    expect(SURFACE).not.toBeNull();
    expect(INCOMING).not.toBeNull();
    expect(SURFACE[1]).toContain('background: var(--site-bg);');
    expect(INCOMING[1]).toContain('background: var(--site-bg-next);');
    expect(INCOMING[1]).not.toContain('linear-gradient');
  });

  it('keeps one wash painted across the transition handoff', () => {
    expect(WASH).not.toBeNull();
    expect(WASH[1]).toContain('background: var(--shopSurfaceWash);');
    expect(WASH[1]).not.toContain('animation:');
  });
});

describe('the retinted surfaces reference the tokens, not copies of them', () => {
  // rgb(36, 87, 52) IS --surfChannels and rgb(0, 30, 15) IS --washChannels.
  // Written out as literals they look identical and behave completely
  // differently: a literal is the one thing in the file an equipped background
  // cannot move. Every one of these files had at least one.
  // globals.scss is deliberately NOT in this list. It styles the whole site, and
  // the literals it still carries belong to surfaces that stay green on purpose
  // — the duel end mask, the HUD, the leaderboard. Its :root base is covered by
  // the scope tests above instead.
  const RETINTED = [
    'styles/shop.css',
    'styles/mapModal.css',
    'styles/accountModal.css',
    'components/accountView.js',
    'components/settingsModal.js',
    'components/ui/Modal.js',
    'pages/user.js',
  ];

  // mapModal.css legitimately holds ONE: its own :root fallback, the value the
  // scoped override falls back to when nothing is equipped.
  const ALLOWED = { 'styles/mapModal.css': 1 };

  for (const file of RETINTED) {
    it(`${file} carries no stray copy of a base tone`, () => {
      const src = readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8');
      // The comments in these files name the old literals to explain what they
      // replaced, so strip comments before matching or the docs fail the test.
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      const copies = code.match(/rgba?\(\s*(36,\s*87,\s*52|0,\s*30,\s*15)/g) || [];
      expect(copies.length, `${file}: ${copies.join(', ')}`).toBe(ALLOWED[file] ?? 0);
    });
  }
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
