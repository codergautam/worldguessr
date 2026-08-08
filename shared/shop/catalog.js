// Stamps shop catalogue, shared by web and mobile. Pure data — no imports, no
// env, no I/O, so the server can price-check a purchase against the exact same
// table the client rendered.
//
// Entry shape:
//   sku        stable id, never reused or renamed (it is what a purchase row
//              stores; renaming one revokes everybody's item)
//   type       'background' | 'glow' | 'marker' | 'emote' | 'pass'
//   name       user-facing label
//   price      stamps, integer
//   platforms  where the item can be BOUGHT and USED
//   animated   glows only, optional
//
// EVERY SKU IS A SINGLE ITEM. There are no bundles, and the machinery that
// granted several skus for one purchase was deleted with them — an entry here
// grants itself and nothing else. Three region "Collections" (1,200 each) and a
// World Collection (5,000) were removed on 2026-08-07 for the reason nobody
// could argue with: every one of them cost MORE than buying its own contents
// one at a time (Europe was 1,200 for 750 of backgrounds; the World set was
// 5,000 for 2,100). A bundle that is a worse deal than its parts is not a
// pricing mistake to tune, it is a shelf nobody can rationally buy from.
// Reintroducing one means bringing back the multi-grant purchase path in
// api/stampShop.js too, and pricing it BELOW the sum of its parts.
//
// Backgrounds are ['web'] for v1: the mobile app bundles its own static
// background asset and does not read /backgrounds/*.webp at all, so selling a
// path it cannot load would be selling nothing.
//
// Emote entries here are the STOREFRONT half only. Their glyphs live in
// shared/emotes/catalog.js, keyed by the same sku, so the two never drift.

// 250 -> 100 for the WHOLE shelf, not just the entry rung. San Francisco was
// alone at 100 to give a first purchase a cheap rung to land on, and the effect
// was that eight of the nine backgrounds sat behind a decision instead. The
// shelf is now flat: every background is one price, the cheapest thing in the
// shop, and which city you want is the only question left to answer.
const BACKGROUND_PRICE = 100;
const GLOW_PRICE = 500;
const MARKER_PRICE = 200;

// This array OWNS the paths — every one of them must be a real file under
// public/, because a sku whose path 404s renders as no site background at all.
//
// The DEFAULT background is not sold here and never should be: London/Big Ben
// (lib/siteBackground.js) is what every visitor already has, so a sku for it
// would be charging for the status quo.
//
// ONE PRICE, ONE SHELF. Every row takes BACKGROUND_PRICE from the map below and
// no row prices itself, so there is no ladder to read and nothing to keep in
// order. San Francisco stays FIRST because it is the likeliest first purchase a
// player makes, and array order IS display order (see the SHOP_CATALOG note at
// the bottom) — it just is not cheaper than its neighbours any more.
//
// The `price ?? BACKGROUND_PRICE` fallback in the map stays: an off-ladder sku
// can still price itself on its own row without a second pipeline. Nothing uses
// it today, and a new row should need a reason to.
//
// THERE IS NO PER-SKU BLURB AND THERE IS NO FIELD FOR ONE. A background card
// carries its photo, its city name and its price, and the photo IS the pitch —
// a line of copy under it was restating the picture in worse words. The
// `noteKey` column that fed it is gone from the catalogue, the API response and
// the card, so nothing renders a sentence here by accident.
// `region` went with the packs. It was never rendered anywhere — it existed
// only to let a pack ask "which skus are mine?" — so with the packs gone it was
// dead metadata being copied into every catalogue response.
//
// `cc` IS THE ONE PIECE OF METADATA THAT EARNS ITS ROW, because it is rendered:
// ISO 3166-1 alpha-2, drawn beside the city name on the card as a real flag
// image through components/utils/countryFlag.js. It is a country CODE and not
// a flag emoji on purpose — Windows ships no flag glyphs, so an emoji here
// degrades to the bare letters "US"/"BR" for most of the desktop players, which
// is exactly the bug countryFlag.js was written to avoid. It must survive
// api/stampShop.js's response whitelist to reach the card; a row that adds a
// city without a `cc` renders nameless-of-nowhere rather than crashing.
const BACKGROUNDS = [
  { sku: 'bg_sf',        name: 'San Francisco',  cc: 'us', path: '/backgrounds/bg-sf.webp' },
  { sku: 'bg_paris',     name: 'Paris',          cc: 'fr', path: '/backgrounds/bg-paris.webp' },
  { sku: 'bg_rome',      name: 'Rome',           cc: 'it', path: '/backgrounds/bg-rome.webp' },
  { sku: 'bg_prague',    name: 'Prague',         cc: 'cz', path: '/backgrounds/bg-prague.webp' },
  { sku: 'bg_tokyo',     name: 'Tokyo',          cc: 'jp', path: '/backgrounds/bg-tokyo.webp' },
  { sku: 'bg_seoul',     name: 'Seoul',          cc: 'kr', path: '/backgrounds/bg-seoul.webp' },
  { sku: 'bg_singapore', name: 'Singapore',      cc: 'sg', path: '/backgrounds/bg-singapore.webp' },
  { sku: 'bg_newyork',   name: 'New York',       cc: 'us', path: '/backgrounds/bg-newyork.webp' },
  { sku: 'bg_rio',       name: 'Rio de Janeiro', cc: 'br', path: '/backgrounds/bg-rio.webp' },
  { sku: 'bg_agra',      name: 'Agra',           cc: 'in', path: '/backgrounds/bg-agra.webp' },
].map((b) => ({ ...b, type: 'background', price: b.price ?? BACKGROUND_PRICE, platforms: ['web'] }));

// Name glows paint a text-shadow behind a username. Each carries TWO hex
// values and both are required: the username renders on the dark HUD AND
// inside a Leaflet tooltip, which is a white surface with black text. One
// colour cannot serve both — a neon that reads on black turns invisible on
// white, and a deep tone that reads on white disappears into the HUD.
//   glowDark  = the glow used on dark surfaces (HUD, menus, leaderboards)
//   glowLight = the glow used on light surfaces (map tooltips, white cards)
//
// THE LIGHT COLUMN IS ITS OWN PALETTE, SPREAD ON ITS OWN. It used to be a set
// of near-black 700/800-level tones (23%-51% HSL lightness) and the whole
// column read as one grey drop shadow: hue is the first thing a colour loses
// as it approaches black. Every light value is now pitched into a vivid mid
// band — a 45%-58% lightness target, 44.9%-57.8% once quantised to 8-bit hex,
// at 74%-92% saturation — which is where a colour holds its hue against a white
// card, and the hues are spread by brute force rather than by eye.
//
// SEVEN GLOWS. It was fourteen, then nine, and AZURE and AURORA PULSE were cut
// on sight ("they look bad"). Neither deletion moved a floor, which is the one
// thing worth recording here: the tightest pair on both columns is still Living
// Flame vs Gold at 27.2 degrees dark and 27.0 light, exactly where it was with
// nine, because orange and yellow are neighbours on the wheel and no amount of
// catalogue space changes that. The runner-up is Comet vs Amethyst at 27.5, also
// unchanged. What the two cuts bought is a hole: Prism at 114 now has open wheel
// all the way to Ice at 186, where Aurora used to sit at 155.
//
// DO NOT RE-RUN THE BRUTE-FORCE SPREAD ON THE STRENGTH OF THIS DELETION. There
// is no pair left to relieve — the survivors are already at the floor a
// seven-hue palette can reach, and moving a value now would only walk it out of
// the hue window its NAME allows (Ice cannot be green, Gold cannot be lime,
// Flame cannot be red). Re-run it when a sku is ADDED.
//
// Where the surviving values came from, all of them inside those name windows:
//
//   Living Flame  dark+light  36 -> 26 deg   amber -> true orange, which is
//                                            also where its own animation
//                                            already spends most of its loop
//   Gold          dark+light  50 -> 53 deg   golden yellow, and 53 is the top of
//                                            the window: #FFDF00 "golden yellow"
//                                            is 52.5 and anything past ~55 is
//                                            lemon, not gold
//   Comet Orbit   light      238 -> 246 deg  now the same hue as its own dark
//   Amethyst      dark+light 271/264 -> 274  likewise. The two columns agreeing
//                                            on a hue is a bonus, not the goal.
//
// TWO FLOORS EVERY LIGHT VALUE CLEARS, and they pull in opposite directions:
//   - saturation >= 74%, because chroma is what carries hue. Desaturating is
//     what turns a halo into the grey smear this column used to be.
//   - contrast >= 2.0:1 against white, so the halo is CLEARLY darker than the
//     card rather than a tint of it. The bright hues (Gold, Prism) sit within a
//     whisker of that floor and give up saturation, not lightness, to reach it;
//     the naturally dark ones (Comet, Amethyst) run far above it and are capped
//     at 58% lightness instead.
//
// CHEAPEST FIRST, AND IT IS A SORT, NOT A CONVENTION. Both storefronts render a
// category in the order the server hands it over (api/stampShop.js maps
// SHOP_CATALOG straight through), so array order IS shelf order. A price ladder
// that depends on somebody remembering to insert a new row in the right place is
// a ladder that breaks on the first hurried commit.
//
// The sort that matters is the one in SHOP_CATALOG at the bottom of this file,
// where the static and animated glows are merged into ONE ascending shelf. The
// per-array sorts below are what make that merge stable and predictable.
//
// Array.prototype.sort is stable (spec since ES2019), so equal prices — every
// static glow is 500 — keep the hue order written above rather than being
// shuffled into an arbitrary one.
const byPriceAsc = (a, b) => a.price - b.price;

// EMBER, MINT and CRIMSON WERE DELETED, not repriced or renamed. A flat halo in
// a hue an animated sku already owns is the cheapest possible version of that
// sku sitting next to it on the same shelf — ember's orange is the Living
// Flame's resting colour, and mint and crimson are both frames of the Prism
// Cycle sweep. Their sku strings are gone from this repo on purpose — a grep for
// any of the three returns nothing, which is how anyone asking "is it really
// gone?" gets a straight answer.
//
// AZURE WENT THE SAME WAY, and for the plainest reason on this list: the owner
// looked at it and it looked bad. There is no palette argument to make — it was
// a mid blue at 214/218 degrees with nothing wrong on paper, it simply did not
// earn a slot on the shelf. Its sku string is gone from this repo like the other
// three, so a grep for it turns up nothing but this sentence.
const SOLID_GLOWS = [
  { sku: 'glow_ice',       name: 'Ice',       glowDark: '#00E5FF', glowLight: '#09B9DC' },
  { sku: 'glow_rose',      name: 'Rose',      glowDark: '#FF4FD8', glowLight: '#F631BB' },
  { sku: 'glow_amethyst',  name: 'Amethyst',  glowDark: '#B155F7', glowLight: '#A131F6' },
  { sku: 'glow_gold',      name: 'Gold',      glowDark: '#FFE30A', glowLight: '#CBB61A' },
].map((g) => ({ ...g, type: 'glow', price: GLOW_PRICE, platforms: ['web', 'mobile'], animated: false }));

// THE GRADIENT TIER IS GONE — all five of it. "Sunset", "Venom", "Nebula" and
// "Magma" (800 each, static two-tone) and "Spectrum Nova" (3,500, the animated
// one) were deleted outright, along with the machinery that painted them: the
// `gradient` flag, the two outer-colour columns that sat beside glowDark and
// glowLight on those rows, and the resolver in
// components/utils/usernameWithFlag.js that read them. All five sku strings and
// every one of those identifiers are gone from this repo on purpose — a grep
// for any of them returns nothing, which is how anyone asking "is it really
// gone?" gets a straight answer.
//
// WHY THE CODE WENT WITH THEM. nameGlowShadow() painted its tight layers in one
// colour and its wide layers in another, and with the tier deleted there was no
// longer any DATA that made those two colours differ: `o === c` for every
// surviving sku, on every surface. A two-colour code path with no two-colour
// data is not "ready for next time", it is a branch nobody exercises and
// therefore a branch nobody notices breaking. It was collapsed back to a single
// colour and the emitted string is character-for-character what it was before,
// for all nine survivors, on both surfaces — a dead-code removal, not a
// behaviour change.
const GLOWS = [...SOLID_GLOWS].sort(byPriceAsc);

// The animated tier. `animated: true` is not decoration — it drives three
// separate things, and all three have to stay true of every row below:
//
//   web       components/utils/usernameWithFlag.js maps the sku to a class in
//             styles/nameGlow.css. A sku added here with no keyframes rule
//             there is sold as animated and renders static.
//   mobile    mobile/src/shared/cosmetics.ts mirrors these EXACT hex values and
//             marks them animated so the app degrades to the static colour and
//             says so on the card (React Native allows one textShadow and
//             cannot animate textShadowRadius on the native driver).
//   shop      the storefronts put a small "Animated" chip on the stage. They no
//             longer promote these into a featured band with a bigger card:
//             one card size, one shelf, sorted by price like everything else.
//
// glowDark/glowLight are the STATIC fallback: what reduced-motion users, the
// mobile app and the embed bundle actually see. They are the sku's identity at
// rest, so they follow the same discipline as the static palette — vivid and
// hue-separated, never pastel. A pastel at a 20px radius blooms to white
// against white text and every hue collapses into the same pale smear.
//
// Priced as a ladder and merged into the one glow shelf at the bottom of this
// file, so the section reads bottom rung to flex without a break: four statics
// at 500, then 2,500 -> 3,000, with Comet Orbit the top of the whole shop.
//
// SIX SKUS HAVE BEEN DELETED FROM THIS BAND OVER TIME, NONE OF THEM REPRICED.
//
//   "Neon Flicker" (a failing neon tube) and "Electric Arc" (a crackling
//   discharge) were STROBES — rapid on/off with a still halo between the hits.
//   A strobe does not read from across a card: the eye catches AMPLITUDE and
//   TRAVEL, not blinking. Do not reintroduce a stutter sku; that whole category
//   is ruled out.
//
//   "Sonar Ping" (1,200) and "Shockwave" (2,200) replaced them and were
//   themselves deleted, for the opposite reason: they were the SAME MOTION as
//   each other. Both were an expanding ring — one launched a pair of them on a
//   linear flight, one thumped twice and rested — and side by side on a shelf a
//   shopper could not tell which was which, let alone which was worth 1,000
//   more Stamps.
//
//   "Spectrum Nova" (3,500) went with the whole gradient tier. It was the same
//   two ingredients as Prism Cycle — a hue ladder plus a breathing radius —
//   separated only by the SIZE of two numbers (180 degrees of offset against
//   120, four blooms per lap against three). That is a different AMOUNT, not a
//   different IDEA, which is exactly the test Sonar Ping and Shockwave failed.
//   Prism Cycle inherits the job and was sped up and hardened to do it.
//
//   "Aurora Pulse" (1,500) was cut on sight — the owner looked at it and it
//   looked bad. It was the entry rung of this band and the only breath in it, so
//   note what its removal actually costs before adding anything back: the band
//   now opens at 2,500, and if a cheaper animated sku is ever wanted it needs to
//   be a NEW motion, not this one restored. A slow symmetrical swell was tried
//   here and did not survive a look.
//
// A tier only justifies its ladder if each rung is a DIFFERENT IDEA, so what
// remains is three unrelated motions: a fire, a spectrum sweep and an orbit. All
// six deleted sku strings are gone from this repo on purpose: a grep for any of
// them returns nothing.
const ANIMATED_GLOWS = [
  { sku: 'glow_ember_flame',     name: 'Living Flame', price: 2500, glowDark: '#FF7D1A', glowLight: '#DC6409' },
  // Was #F0ABFC (fuchsia-300). That is a pastel, and the pastel is what the
  // mobile app and every reduced-motion user got — a white smear where the
  // 2,500-Stamp spectrum should be. The animation on web was never the problem;
  // the thing it falls back TO was. Same hue, saturated.
  //
  // ITS LIGHT VALUE THEN MOVED HUE OUTRIGHT, from magenta to green, and this is
  // the one sku in the shop allowed to do that: it sweeps the ENTIRE wheel, so
  // no frame of its loop is the canonical one and its resting colour is free to
  // be whatever serves the palette. It also puts the sku's two surfaces in
  // agreement: green on dark, green on light. That freedom is why it is the one
  // row the brute-force spread below never had to move — it was already sitting
  // in the widest hole either column had.
  { sku: 'glow_cycle_prism',     name: 'Prism Cycle',  price: 2500, glowDark: '#1AFF00', glowLight: '#40D214' },
  // THE TOP OF THE SHOP, now that Spectrum Nova is gone. Nothing about it
  // changed: it was always the sku that moves in a way nothing else in the app
  // moves (a spark on an orbit, not a bloom), which is precisely why it is the
  // one that survived the cull of the "same idea, bigger number" skus.
  { sku: 'glow_orbit_comet',     name: 'Comet Orbit',  price: 3000, glowDark: '#6D5BFF', glowLight: '#4531F6' },
].map((g) => ({ ...g, type: 'glow', platforms: ['web', 'mobile'], animated: true }))
  .sort(byPriceAsc);

// Every marker sku is a real pin IMAGE (public/pins/<name>.png), authored at the
// stock pins' 87x131 and wired up in lib/markerIcons.js + embed/shims/markerIcons.js.
// A sku added here without its two icon entries silently falls back to the stock pin.
const MARKERS = [
  { sku: 'marker_gold_pin', name: 'Gold Pin' },
].map((m) => ({ ...m, type: 'marker', price: MARKER_PRICE, platforms: ['web', 'mobile'] }));

// Purchasable emotes. sku <-> shared/emotes/catalog.js id, one to one.
const EMOTES = [
  { sku: 'emote_fire',   name: 'Fire',       price: 50 },
  { sku: 'emote_heart',  name: 'Heart',      price: 50 },
  { sku: 'emote_clap',   name: 'Applause',   price: 50 },
  { sku: 'emote_cry',    name: 'Tears',      price: 75 },
  { sku: 'emote_eyes',   name: 'Eyes',       price: 75 },
  { sku: 'emote_cool',   name: 'Shades',     price: 100 },
  { sku: 'emote_party',  name: 'Party',      price: 100 },
  { sku: 'emote_globe',  name: 'Globe',      price: 100 },
  { sku: 'emote_crown',  name: 'Crown',      price: 125 },
  { sku: 'emote_rocket', name: 'Rocket',     price: 125 },
  { sku: 'emote_goat',   name: 'GOAT',       price: 150 },
  // THE CHASE ITEM, and it is deliberately off the end of the ladder: nearly
  // seven times the next most expensive emote, so it is a thing you save for
  // rather than a thing you pick up. It is the only sku in the shop carrying an
  // `fx` (see shared/emotes/catalog.js) — the burn is what a shelf full of
  // 50-Stamp faces is being asked to make you want, and a price that high with
  // nothing to show for it is just a bad deal. Last in the list because the
  // catalogue ships sorted ascending by price and this has to close the shelf.
  { sku: 'emote_skull',  name: 'Skull',      price: 1000 },
].map((e) => ({ ...e, type: 'emote', platforms: ['web', 'mobile'] }));

const PASSES = [
  {
    sku: 'pass_adfree_20m',
    type: 'pass',
    name: 'Ad-Free 20 Minutes',
    price: 100,
    platforms: ['web', 'mobile'],
    durationMs: 20 * 60 * 1000,
  },
];

export const SHOP_CATALOG = [
  ...BACKGROUNDS,
  // ONE GLOW SHELF, CHEAPEST FIRST, ANIMATED OR NOT. Both storefronts render a
  // category in catalogue order, so this sort IS the shelf order — in the DOM,
  // not just visually, which is what keeps the tab order and the screen-reader
  // order reading the same ladder the eye does.
  //
  // IT USED TO BE ANIMATED-FIRST, and that was load-bearing back when the
  // animated skus were promoted into a featured band with a bigger card at the
  // top of the section. There is no band any more (one card size, one grid), so
  // leading with the 1,500-3,000 tier just meant the shelf opened at its most
  // expensive rung and dropped to 500 halfway down. It now climbs 500 -> 3,000
  // start to finish.
  //
  // Array.prototype.sort is stable (spec since ES2019), so equal prices keep the
  // order their own array wrote: the five statics stay in the hue order set out
  // above rather than being shuffled into an arbitrary one.
  ...[...GLOWS, ...ANIMATED_GLOWS].sort(byPriceAsc),
  ...MARKERS,
  ...EMOTES,
  ...PASSES,
];

const BY_SKU = new Map(SHOP_CATALOG.map((item) => [item.sku, item]));

/** Catalogue entry for a sku, or null. Never throws: callers get user input here. */
export function getItem(sku) {
  return BY_SKU.get(sku) ?? null;
}

/**
 * Price to actually charge: the catalogue price unless a sale/config override
 * supplies a valid one. An override is honoured only when it is a finite
 * non-negative number, so a null, a NaN or an empty form field falls back to
 * full price instead of quietly making the item free.
 *
 * Accepts an item object or a sku. Returns null for an unknown sku.
 */
export function effectivePrice(item, override) {
  const entry = typeof item === 'string' ? getItem(item) : item;
  if (!entry) return null;
  const overrideNum = Number(override);
  const price = (override !== null && override !== undefined && override !== '' &&
    Number.isFinite(overrideNum) && overrideNum >= 0)
    ? overrideNum
    : Number(entry.price);
  return Number.isFinite(price) ? Math.max(0, Math.round(price)) : null;
}
