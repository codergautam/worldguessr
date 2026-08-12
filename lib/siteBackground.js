import { asset } from '@/lib/basePath';
import { getItem } from '@/shared/shop/catalog';

// The site background: ONE static image for everybody, unless the player has
// bought and equipped a different one from the Stamps shop.
//
// This replaced a daily rotation (one curated city per UTC day, picked from a
// 71-entry list in this module). It was removed on purpose: the rotation cost a
// pre-paint inline script, a per-day preload the CDN could not cache across the
// day flip, an idle prefetch of tomorrow's image, and a home-screen chip to
// explain itself, all to change an image nobody asked to have changed. The
// unsold images are still in public/backgrounds/ and are candidates for the
// shop, not for a rotation.
//
// HOW IT IS APPLIED, and there is no JavaScript anywhere on the DEFAULT path:
//   pages/_document.js declares `--site-bg` on :root inside its inline <style>
//   and preloads the same file at high priority, so the first paint is the real
//   background with no flash and no no-JS fallback to maintain.
//
//   Every consumer (menus, modals, the game loading overlay, /leaderboard,
//   /map/*, the duel exit mask) reads `var(--site-bg)` rather than hardcoding a
//   path, which is what lets a purchased background swap all of them at once.
//
//   paintSiteBackground() below is the ONE writer of an inline override, and
//   the only place that decides how the picture CHANGES. Two callers reach it:
//   pages/_app.js when the session resolves, and components/shop/useStampShop.js
//   on an equip, so the change looks the same whether it came from signing in
//   or from clicking Equip. They used to hold a hand-copy each, which is
//   exactly how one of them ended up cutting while the other dissolved.
//
// COMPATIBILITY SPEC if this image is ever swapped: landscape, >=1920 wide,
// exported webp <=250KB (this is the LCP asset every visitor downloads before
// first paint); must survive center/cover crops from ultrawide desktop down to
// 9:19 portrait phones, so subject and horizon centered with nothing important
// in the outer quarter of any edge; mid-brightness tones, because the site
// composites this under a 50% black scrim plus dark-green gradients and
// blown-out skies wash the menus out while near-black shots turn to mud; low
// high-frequency clutter through the middle band where UI text sits.
//
// The default is street2.webp — Trafalgar Square at dusk with Big Ben down
// Whitehall, the background WorldGuessr has shipped with for years. It is the
// same file the mobile app and the portal zips have always used, so keeping it
// here is also what keeps all three surfaces looking like one game.
//
// Purchasable backgrounds live in shared/shop/catalog.js, which owns their
// paths outright. The mobile app bundles its own static copy of this image and
// does not read this module at all.
export const DEFAULT_BACKGROUND_PATH = '/street2.webp';

// A 20px-wide WebP of the default background, inlined as a data URI so it
// costs ZERO requests and paints on the very first frame.
//
// WHY IT EXISTS: the background is a 102KB download, and until it arrives
// body::before has nothing to paint under its scrim, so a first-time visitor on
// a slow phone gets the UI on a black rectangle for as long as the fetch takes.
// Black reads as broken. This paints the photograph's colours immediately — upscaled by
// `cover` into a soft dusk wash — and the real image lands on top of it as a
// second background layer with no flash, because both are `center/cover` and
// the real one is opaque.
//
// REGENERATE IT WHENEVER DEFAULT_BACKGROUND_PATH CHANGES, or the site will
// blur-preview an image it no longer shows:
//   sharp('public/street2.webp').resize({width:20}).webp({quality:40,effort:6})
//   → base64 → paste below. 20px/q40 is the knee of the curve here: 114 bytes
//   raw, 152 as base64. Going wider buys detail nobody sees behind the scrim.
//
// Portal zips get this for free: scripts/packageEmbed.mjs rewrites baked asset
// paths, and a data URI has no path to rewrite.
export const DEFAULT_BACKGROUND_LQIP =
  'data:image/webp;base64,UklGRmoAAABXRUJQVlA4IF4AAAAwBACdASoUAAwAPu1iqk2ppaQiMAgBMB2JZgCuHB+CknwSHTTuOjCaJAAA/uNRBvaUY5pzljr+gV3bP8vBnIiPmsU8EwqwLX19YoL5G2czf2NlZ/nYya0g1hlljAAA';

// Portal zips (CoolMath / Poki / GameDistribution) ship offline, and
// scripts/packageEmbed.mjs rewrites BAKED asset refs only — a runtime-computed
// URL escapes the rewrite and 404s inside the package. The default background
// above is baked into _document and survives that rewrite; an EQUIPPED
// background is resolved at runtime from the session, so it is suppressed in
// these builds and the default simply stands.
export const IS_PORTAL_BUILD =
  process.env.NEXT_PUBLIC_COOLMATH === 'true' ||
  process.env.NEXT_PUBLIC_POKI === 'true' ||
  process.env.NEXT_PUBLIC_GAMEDISTRIBUTION === 'true';

/**
 * URL of the background a sku paints, or null.
 *
 * THE ONE RESOLVER, and the reason it lives here rather than at each call site:
 * three places now turn a sku into a background — pages/_app.js (the visitor's
 * own session), components/shop/useStampShop.js (the equip that repaints under
 * the cursor) and pages/user.js (somebody ELSE's profile). Three private copies
 * of "catalogue lookup, type check, basePath" is three chances for a portal
 * build to ship a URL it cannot load.
 *
 * The catalogue owns the paths outright, so an unknown sku — revoked item,
 * tampered payload, a sku of some other type — resolves to null and whatever
 * default the caller has simply stands.
 *
 * PORTAL ZIPS ALWAYS GET NULL: scripts/packageEmbed.mjs rewrites BAKED asset
 * refs only, so a runtime-resolved URL 404s inside the package. See
 * IS_PORTAL_BUILD above.
 */
export function backgroundUrlForSku(sku) {
  if (IS_PORTAL_BUILD || !sku) return null;
  const item = getItem(sku);
  return (item?.type === 'background' && item.path) ? asset(item.path) : null;
}

// ---------------------------------------------------------------------------
// THE ACCENT: the home screen's palette, and ONLY the home screen's.
//
// A purchased background paints behind the whole site, but only two containers
// recolour to match it — `.home__content` and `.hudCorner` in
// styles/globals.scss. Everything else, in-game UI included, stays green. That
// scope is deliberate: the menu is where a bought photograph is the entire
// point of the screen, and it is also the only place where a green wash over a
// purple photograph is unavoidable rather than incidental.
//
// SEVEN CUSTOM PROPERTIES, SET ON <html>, READ BY TWO SELECTORS. They live at
// the root for the same reason --site-bg does: the prepaint script has to be
// able to write them before any element exists. They are inert up there — the
// green :root palette does not read a single one of them — so the tint only
// appears where globals.scss opts in through var(--accWashR, 20) and friends.
//
// WHY CHANNELS AND NOT HEX for two of the three tones: the gradients they feed
// are rgba() with per-stop alpha, and CSS cannot pull an alpha variant out of a
// hex string without color-mix(), which fails the whole declaration on browsers
// that lack it and would silently leave half the menu green. Numbers always
// work. `deep` stays hex because it is only ever used opaque, as a border.
const HEX_RE = /^#[0-9a-f]{6}$/i;

export const ACCENT_VAR_NAMES = [
  '--accWashR', '--accWashG', '--accWashB',
  '--accSurfR', '--accSurfG', '--accSurfB',
  '--accDeep',
];

function channels(hex) {
  if (typeof hex !== 'string' || !HEX_RE.test(hex)) return null;
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * The palette a sku recolours the home screen to, or null.
 *
 * ALL OR NOTHING. A row with two good tones and one typo resolves to null and
 * the menu stays entirely green, because the failure that actually looks
 * broken is the half-applied one: purple gradient, green buttons, green rims.
 * A catalogue row with no `accent` at all takes the same path, which is what
 * lets a new city ship its photograph before anyone has picked its colours.
 */
export function accentForSku(sku) {
  if (IS_PORTAL_BUILD || !sku) return null;
  const item = getItem(sku);
  if (item?.type !== 'background' || !item.accent) return null;
  const wash = channels(item.accent.wash);
  const surface = channels(item.accent.surface);
  if (!wash || !surface || !HEX_RE.test(item.accent.deep || '')) return null;
  return { wash, surface, deep: item.accent.deep };
}

/**
 * The seven properties as a plain object, for a React `style` prop.
 *
 * THERE ARE TWO KINDS OF ACCENT AND THEY MUST NOT SHARE A WRITER. The visitor's
 * own goes on <html> and lasts the session (applySiteAccent, below). A PUBLIC
 * PROFILE's belongs to the person being looked at, lasts as long as that one
 * element, and must not touch <html> at all — writing it there would repaint the
 * reader's own menus in a stranger's colours and survive the route change.
 *
 * So pages/user.js sets these inline on its shell instead, exactly as it already
 * does with --profile-bg, and .user-profile-page reads them through the same
 * scope block in globals.scss that the home screen uses. This function exists so
 * the two writers cannot disagree about the names: ONE list, spelled once.
 *
 * Returns null for a null accent so a caller can spread-or-omit in one
 * expression; there is nothing to reset because there was never anything set.
 */
export function accentStyleVars(accent) {
  if (!accent) return null;
  return {
    '--accWashR': String(accent.wash[0]),
    '--accWashG': String(accent.wash[1]),
    '--accWashB': String(accent.wash[2]),
    '--accSurfR': String(accent.surface[0]),
    '--accSurfG': String(accent.surface[1]),
    '--accSurfB': String(accent.surface[2]),
    '--accDeep': accent.deep,
  };
}

/**
 * Write (or clear) the accent on <html>. Clearing hands the slot back to the
 * var() defaults in globals.scss, which are the green values verbatim — so an
 * unequip returns the menu to stock without a reload and without a second set
 * of "reset" declarations that could drift from the palette they undo.
 */
export function applySiteAccent(accent) {
  if (typeof document === 'undefined') return;
  const s = document.documentElement.style;
  if (!accent) {
    ACCENT_VAR_NAMES.forEach((name) => s.removeProperty(name));
    return;
  }
  const vars = accentStyleVars(accent);
  Object.keys(vars).forEach((name) => s.setProperty(name, vars[name]));
}

// ---------------------------------------------------------------------------
// THE CROSSFADE — how the photograph CHANGES, as opposed to which one it is.
//
// ONE LAYER CANNOT DISSOLVE INTO ANOTHER. `--site-bg` is a background-image and
// background-image does not transition, so every version of this that wrote the
// property and hoped produced a cut, and the cut is what "it doesn't look
// smooth" means. Waiting for the file to decode before writing (the previous
// attempt) removes the LQIP flash in the middle of the cut. It is still a cut.
//
// So there are two layers and they are pseudo-elements on DIFFERENT elements,
// declared in pages/_document.js:
//
//   html::before   the OUTGOING photograph. THERE IS NO RESTING RULE FOR IT AT
//                  ALL — `content` is declared only under .site-bg-swap, so
//                  outside a swap the pseudo-element is never generated and a
//                  visitor who owns no background composites nothing extra,
//                  ever. While the class is on it paints `--site-bg`: the value
//                  still committed, i.e. the picture currently on screen, held
//                  still underneath.
//   body::before   the INCOMING photograph, animating opacity 0 -> 1 on top of
//                  it. At rest it is the committed background and the ONLY
//                  layer, which is what it has always been.
//
// html::before rather than body::after, and that is not stylistic: body::after
// is the LAST child of body, so at any shared z-index it paints ABOVE the menu
// it is supposed to sit behind. html::before is outside <body> entirely and
// therefore structurally beneath every pixel of the app, with no z-index
// arithmetic to get wrong. pages/banned.js and pages/mod.js also override
// `body::before` specifically; keeping the resting layer there is what leaves
// those overrides working.
//
// WHY THE COMMIT IS INVISIBLE, which is the part worth checking if this is ever
// edited. At t=0 the incoming layer reads `--site-bg-next` and the outgoing one
// reads `--site-bg`. At t=FADE_MS both `--site-bg` becomes the new URL and the
// class comes off in the same tick: body::before stops reading `--site-bg-next`
// and starts reading `--site-bg`, which now holds the identical URL, at the
// opacity 1 the finished animation left it at. Same pixels either side of the
// frame. There is no second fade to hide and no forced reflow to schedule.
//
// The opacity trick this depends on: both layers are FULLY OPAQUE with a 50%
// black scrim baked into their background stack, rather than translucent at
// 0.5. Over the forced-black canvas those are the same picture — but two opaque
// layers crossfade linearly (old*(1-x) + new*x), whereas two half-transparent
// ones sum to 0.75 of a layer at the midpoint and visibly brighten. See
// pages/_document.js, where both scrims are written out literally.
export const SITE_BG_SWAP_CLASS = 'site-bg-swap';

// This is the storefront's focal feedback: long enough for two photographs to
// dissolve cleanly under the product grid, still short enough to feel like the
// equip action completed immediately.
export const SITE_BG_FADE_MS = 600;

// Module scope, because the thing being guarded is the DOM, and there is only
// one of those. Two swaps landing close together (sign in, then equip something
// in the shop before the first has settled) must not leave the first one's
// timer to commit a URL the second already replaced.
let siteBgCommitTimer = null;

/**
 * Paint `path` as the site background, dissolving from whatever is up.
 *
 * THE ONE WRITER OF `--site-bg`, which is the point: pages/_app.js (the
 * session's answer) and components/shop/useStampShop.js (the equip under the
 * user's cursor) used to carry a hand-copy of the same three lines, so a
 * crossfade added to one would have been a cut in the other.
 *
 * `equipped` false means "this is the default", and it COMMITS BY REMOVING the
 * inline property rather than writing the default URL into it — that hands the
 * value back to the :root rule in _document, which is the one place that owns
 * it, so a future change to the default cannot be shadowed by a stale copy.
 *
 * IT DOES NOT FADE WHEN NOTHING CHANGED, and that is most calls. Every page
 * load re-asserts the same background the pre-paint script already put up; a
 * dissolve there would be an animation from a picture to itself, on the LCP
 * frame, for every owner on every navigation.
 *
 * THE ACCENT LANDS WITH THE START OF THE FADE, not its end. It feeds gradients
 * and border colours (globals.scss, .home__content / .hudCorner), none of which
 * are transitionable, so it snaps whenever it is applied and the only question
 * is which half of the swap it snaps in. It goes with the arriving photograph:
 * the alternative leaves green chrome sitting on a picture that has already
 * become purple, which is the half-applied state accentForSku() exists to
 * prevent, just spread over the fade window instead of forever.
 */
export function paintSiteBackground(path, equipped, accent) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const target = equipped && path ? `url("${path}")` : '';
  // '' when no inline override is set, i.e. the :root default is what shows.
  const painted = root.style.getPropertyValue('--site-bg');

  if (siteBgCommitTimer) {
    clearTimeout(siteBgCommitTimer);
    siteBgCommitTimer = null;
  }

  const commit = () => {
    siteBgCommitTimer = null;
    if (target) root.style.setProperty('--site-bg', target);
    else root.style.removeProperty('--site-bg');
    root.classList.remove(SITE_BG_SWAP_CLASS);
    applySiteAccent(accent);
    rememberSiteBackground(equipped ? path : null, equipped ? accent : null);
  };

  // Nothing to dissolve: same picture, or no picture to dissolve TO (a path we
  // could not resolve). Either way the commit is the whole job.
  if (painted === target || !path) {
    commit();
    return;
  }

  // The incoming layer always gets a concrete URL, including on an unequip —
  // "back to the default" is a change like any other and deserves the same
  // dissolve. Only the COMMIT distinguishes equipped from default.
  root.style.setProperty('--site-bg-next', `url("${path}")`);
  root.classList.add(SITE_BG_SWAP_CLASS);
  applySiteAccent(accent);
  siteBgCommitTimer = setTimeout(commit, SITE_BG_FADE_MS);
}

// ---------------------------------------------------------------------------
// LAST-EQUIPPED CACHE — why an owner sees their own city on the FIRST frame.
//
// The equipped background lives on the session, and the session is an auth
// round-trip that only starts once window.cConfig exists. So the swap in
// pages/_app.js lands hundreds of ms after first paint: an owner reloaded and
// watched London appear, then their city replace it.
//
// The HTML cannot carry the answer. Every page is statically generated and
// served from the CDN edge to everybody, so personalising the markup would
// mean an uncacheable per-user response — a far worse trade than one frame of
// the wrong city. The only place a per-device answer can live is the device.
//
// So the writers below record the resolved URL, and PREPAINT_SITE_BG_SCRIPT
// reads it back before first paint. The record is a CACHE, never the truth:
// the session still decides, and pages/_app.js clears the key the moment it
// resolves a session with no background equipped.
//
// COST TO EVERYBODY ELSE, which is the constraint that shaped this: one
// localStorage.getItem and a regex test, then return. No network request, no
// element created, no property written. A visitor who has never bought a
// background pays for the read and nothing else.
export const SITE_BG_STORAGE_KEY = 'wg_site_bg';

// The accent rides in its own key rather than inside the path string, so a
// device that has one and not the other degrades to "right photo, green menu"
// instead of losing the background entirely to a parse failure.
//
// THE FLASH THIS PREVENTS IS THE WHOLE REASON IT EXISTS. Without it an owner
// watches the menu paint green and turn purple a few hundred ms later, when
// the session finally resolves — a far louder artefact than the wrong-city
// flash the path cache was built for, because it is the entire left half of
// the screen changing colour rather than a photograph swapping behind 0.5
// opacity.
export const SITE_BG_ACCENT_KEY = 'wg_bg_accent';

// "wash|surface|deep", e.g. "37,26,77|59,42,110|#170f2e". Same threat model as
// SITE_BG_PATH_RE below: this value is interpolated straight into CSS custom
// properties, so the format is pinned to digits, commas, one pipe apiece and a
// six-digit hex. Nothing else can survive the round trip.
const SITE_BG_ACCENT_RE = /^\d{1,3},\d{1,3},\d{1,3}\|\d{1,3},\d{1,3},\d{1,3}\|#[0-9a-fA-F]{6}$/;

// Anything that is not a plain site-relative .webp path is ignored, because
// this value is interpolated into a CSS url() — a poisoned localStorage entry
// containing quotes, parens or semicolons could otherwise close the url() and
// inject declarations. Matches what asset() produces: an optional basePath,
// then the catalogue's own path.
const SITE_BG_PATH_RE = /^\/[\w.\-/]+\.webp$/;

/**
 * Record (or forget) the background this device should paint before the
 * session resolves. Called by the SAME code that writes `--site-bg`, so the
 * cache cannot drift from the property: pages/_app.js on session resolve, and
 * components/shop/useStampShop.js on equip.
 *
 * Storage access throws in an iframe with third-party storage blocked, which
 * describes a good share of embed traffic — a failure here costs one frame of
 * the default background and must never break the equip.
 */
export function rememberSiteBackground(url, accent) {
  if (typeof window === 'undefined') return;
  try {
    if (url && SITE_BG_PATH_RE.test(url)) {
      window.localStorage.setItem(SITE_BG_STORAGE_KEY, url);
    } else if (window.localStorage.getItem(SITE_BG_STORAGE_KEY) !== null) {
      // Read before removing. The clearing branch runs on every page load for
      // every visitor who owns no background, and that is nearly all of them —
      // they should not be issuing a storage write to delete a key that has
      // never existed on their device.
      window.localStorage.removeItem(SITE_BG_STORAGE_KEY);
    }

    // The accent is written by the SAME call that writes the path, which is
    // what stops the two from drifting into "London photo, New York menu".
    // A background with no accent clears the key rather than leaving the last
    // city's colours behind the next city's photograph.
    const serialized = accent
      ? `${accent.wash.join(',')}|${accent.surface.join(',')}|${accent.deep}`
      : null;
    if (serialized && SITE_BG_ACCENT_RE.test(serialized)) {
      window.localStorage.setItem(SITE_BG_ACCENT_KEY, serialized);
    } else if (window.localStorage.getItem(SITE_BG_ACCENT_KEY) !== null) {
      window.localStorage.removeItem(SITE_BG_ACCENT_KEY);
    }
  } catch (e) { /* private mode / blocked storage: default background stands */ }
}

// Runs inline in <head>, before first paint. Deliberately minified by hand and
// wrapped in try/catch: it sits in front of the LCP of every visitor, so it
// bails on the first line for the overwhelming majority who have no purchased
// background, and a throw here must never take the page with it.
//
// It sets an inline property on <html>, which beats the :root rule _document
// declares regardless of source order, and injects the matching preload so the
// image is fetched at the same priority the baked one gets rather than being
// discovered late by the CSS.
//
// NOT SHIPPED IN PORTAL BUILDS (see IS_PORTAL_BUILD above): those zips pin the
// baked default, so the script would be dead weight in the one build where
// every byte is downloaded from a partner's CDN.
// THE COOKIE CHECK IS THE WHOLE POINT OF THE FIRST LINE, do not "simplify" it
// away. Reading `document.cookie` is an in-memory string get. Reading
// localStorage is not: the first access on an origin blocks the renderer while
// the browser's storage service hands over that origin's data, and this script
// runs in front of first paint. A visitor arriving for the very first time has
// no JS-visible cookie yet (GA sets `_ga` on window load, and Cloudflare's own
// cookies are HttpOnly), and cannot own a background either, so they skip
// storage entirely and pay nothing but the string read.
//
// It fails in the SAFE direction. Cookies cleared but localStorage kept means
// an owner falls back to the old behaviour — the default paints first and _app
// swaps it — which is a flash, never a wrong background.
export const PREPAINT_SITE_BG_SCRIPT = `(function(){try{` +
  `if(!document.cookie)return;` +
  `var p=localStorage.getItem('${SITE_BG_STORAGE_KEY}');` +
  `if(!p||!${SITE_BG_PATH_RE.toString()}.test(p))return;` +
  `document.documentElement.style.setProperty('--site-bg','url("'+p+'")');` +
  // THE PLACEHOLDER LAYER STAYS, even though it is the default's city and not
  // this user's. An earlier version set it to `none` on the theory that a
  // blurry London under a loading Rome was a flash of the wrong city; what it
  // actually bought was a BLACK screen for owners, because killing the
  // placeholder leaves nothing at all to paint while their image downloads.
  // At 20px there is no city to recognise, only a dusk-toned wash. Black is
  // the worse of the two and it is now impossible on every path.
  `var l=document.createElement('link');l.rel='preload';l.as='image';` +
  `l.type='image/webp';l.fetchPriority='high';l.href=p;` +
  `document.head.appendChild(l);` +
  // The accent, on the same pass. It is read AFTER the path check on purpose:
  // no background means no accent, so the overwhelming majority have already
  // returned above and never touch this key at all. An owner whose accent is
  // missing or malformed keeps their photograph and a green menu, which is the
  // pre-accent behaviour and not a broken one.
  `var a=localStorage.getItem('${SITE_BG_ACCENT_KEY}');` +
  `if(!a||!${SITE_BG_ACCENT_RE.toString()}.test(a))return;` +
  `var q=a.split('|'),w=q[0].split(','),u=q[1].split(','),d=document.documentElement.style;` +
  `d.setProperty('--accWashR',w[0]);d.setProperty('--accWashG',w[1]);d.setProperty('--accWashB',w[2]);` +
  `d.setProperty('--accSurfR',u[0]);d.setProperty('--accSurfG',u[1]);d.setProperty('--accSurfB',u[2]);` +
  `d.setProperty('--accDeep',q[2]);` +
  `}catch(e){}})();`;
