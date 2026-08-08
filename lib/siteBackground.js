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
// HOW IT IS APPLIED, and there is no JavaScript anywhere on this path:
//   pages/_document.js declares `--site-bg` on :root inside its inline <style>
//   and preloads the same file at high priority, so the first paint is the real
//   background with no flash and no no-JS fallback to maintain.
//
//   Every consumer (menus, modals, the game loading overlay, /leaderboard,
//   /map/*, the duel exit mask) reads `var(--site-bg)` rather than hardcoding a
//   path, which is what lets a purchased background swap all of them at once.
//
//   pages/_app.js is the ONLY writer of an inline override: it sets the
//   property when a background sku is equipped and REMOVES it when one is not,
//   handing the slot back to the :root default. components/shop/useStampShop.js
//   makes the identical write early so an equip repaints under the user's
//   cursor instead of on the next reload.
//
// COMPATIBILITY SPEC if this image is ever swapped: landscape, >=1920 wide,
// exported webp <=250KB (this is the LCP asset every visitor downloads before
// first paint); must survive center/cover crops from ultrawide desktop down to
// 9:19 portrait phones, so subject and horizon centered with nothing important
// in the outer quarter of any edge; mid-brightness tones, because the site
// composites this at 0.5 opacity over black plus dark-green gradients and
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
// body::before has nothing to paint, so a first-time visitor on a slow phone
// gets the UI on a black rectangle for as long as the fetch takes. Black reads
// as broken. This paints the photograph's colours immediately — upscaled by
// `cover` into a soft dusk wash — and the real image lands on top of it as a
// second background layer with no flash, because both are `center/cover` and
// the real one is opaque.
//
// REGENERATE IT WHENEVER DEFAULT_BACKGROUND_PATH CHANGES, or the site will
// blur-preview an image it no longer shows:
//   sharp('public/street2.webp').resize({width:20}).webp({quality:40,effort:6})
//   → base64 → paste below. 20px/q40 is the knee of the curve here: 114 bytes
//   raw, 152 as base64. Going wider buys detail nobody sees behind 0.5 opacity.
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
export function rememberSiteBackground(url) {
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
  `}catch(e){}})();`;
