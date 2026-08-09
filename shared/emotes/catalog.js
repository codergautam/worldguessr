// Emote catalogue, shared by web and mobile. Pure data — no imports, no env,
// no I/O, so the ws server can validate an incoming emote against the same
// table the client rendered it from.
//
// Entry shape:
//   id           stable string id, the wire value going forward
//   glyph        what is drawn (emoji, or plain text for 'GG')
//   free         true = available to everyone, no purchase
//   sku          shop sku for paid emotes, null for free ones
//   legacyIndex  0..7 for the ORIGINAL eight emotes, null for everything else
//   fx           OPTIONAL effect id. Present on exactly one emote today and
//                that is the point: it is what makes the top of the price
//                ladder look like the top of the price ladder. The string is a
//                CSS class suffix (`.emoteFx--<fx>`, defined ONCE in
//                styles/globals.scss beside the in-game emote rules) and every
//                surface that draws a glyph applies it: the shop card, the
//                wheel cell, the in-game picker and the reaction that floats up
//                mid-duel. Data, not a component special case — an emote's look
//                belongs to the emote.
//
// WHY legacyIndex EXISTS: the current wire protocol sends an integer index into
// components/emoteReactions.js EMOTES, and old web clients plus every shipped
// mobile build still speak it. Those eight indices are frozen forever —
// reordering this list, or inserting a paid emote among them, silently rewrites
// what old clients display. New emotes are id-addressed only.
//
// `name` is the shop's card title. The FREE eight need one as badly as the paid
// twelve do: they are cards in the same grid now (you arrange them in your bar
// exactly like a bought one), and a card with a glyph and no name is the only
// card in the storefront that does not say what it is.
export const EMOTE_CATALOG = [
  // The original eight. Order and index are the legacy wire contract.
  { id: 'wave',     name: 'Wave',      glyph: '👋', free: true, sku: null, legacyIndex: 0 },
  { id: 'thumbsup', name: 'Thumbs up', glyph: '👍', free: true, sku: null, legacyIndex: 1 },
  { id: 'laugh',    name: 'Laugh',     glyph: '😂', free: true, sku: null, legacyIndex: 2 },
  { id: 'wow',      name: 'Wow',       glyph: '😮', free: true, sku: null, legacyIndex: 3 },
  { id: 'think',    name: 'Think',     glyph: '🤔', free: true, sku: null, legacyIndex: 4 },
  { id: 'target',   name: 'Bullseye',  glyph: '🎯', free: true, sku: null, legacyIndex: 5 },
  { id: 'angry',    name: 'Angry',     glyph: '😡', free: true, sku: null, legacyIndex: 6 },
  { id: 'gg',       name: 'GG',        glyph: 'GG', free: true, sku: null, legacyIndex: 7 },

  // Purchasable. sku <-> shared/shop/catalog.js, one to one.
  { id: 'fire',   name: 'Fire',     glyph: '🔥', free: false, sku: 'emote_fire',   legacyIndex: null },
  { id: 'heart',  name: 'Heart',    glyph: '❤️', free: false, sku: 'emote_heart',  legacyIndex: null },
  { id: 'clap',   name: 'Applause', glyph: '👏', free: false, sku: 'emote_clap',   legacyIndex: null },
  { id: 'cry',    name: 'Tears',    glyph: '😭', free: false, sku: 'emote_cry',    legacyIndex: null },
  // THE TOP OF THE SHELF. 200 Stamps against a ladder that otherwise tops out
  // at 150, so it has to be worth crossing a room for: `fx` gives it the cursed
  // ember burn nothing else in the game has. Price lives in
  // shared/shop/catalog.js; the look lives here, because it is the same look
  // in the shop, on the wheel and mid-duel.
  { id: 'skull',  name: 'Skull',    glyph: '💀', free: false, sku: 'emote_skull',  legacyIndex: null, fx: 'ember' },
  { id: 'eyes',   name: 'Eyes',     glyph: '👀', free: false, sku: 'emote_eyes',   legacyIndex: null },
  { id: 'cool',   name: 'Shades',   glyph: '😎', free: false, sku: 'emote_cool',   legacyIndex: null },
  { id: 'party',  name: 'Party',    glyph: '🎉', free: false, sku: 'emote_party',  legacyIndex: null },
  { id: 'globe',  name: 'Globe',    glyph: '🌍', free: false, sku: 'emote_globe',  legacyIndex: null },
  { id: 'crown',  name: 'Crown',    glyph: '👑', free: false, sku: 'emote_crown',  legacyIndex: null },
  { id: 'rocket', name: 'Rocket',   glyph: '🚀', free: false, sku: 'emote_rocket', legacyIndex: null },
  { id: 'goat',   name: 'GOAT',     glyph: '🐐', free: false, sku: 'emote_goat',   legacyIndex: null },
];

const BY_ID = new Map(EMOTE_CATALOG.map((e) => [e.id, e]));
const BY_LEGACY_INDEX = new Map(
  EMOTE_CATALOG.filter((e) => Number.isInteger(e.legacyIndex)).map((e) => [e.legacyIndex, e]),
);

/** Entry for an id, or null. Never throws: this is fed straight from the wire. */
export function getEmote(id) {
  return BY_ID.get(id) ?? null;
}

/** Entry for a legacy integer index 0..7, or null for anything else. */
export function byLegacyIndex(i) {
  if (!Number.isInteger(i)) return null;
  return BY_LEGACY_INDEX.get(i) ?? null;
}

/**
 * Whether an emote needs no purchase. An UNKNOWN id is NOT free — fail closed,
 * so a typo or a forged wire value can never bypass an ownership check.
 */
export function isFree(id) {
  return getEmote(id)?.free === true;
}

/* ===========================================================================
 *  THE EMOTE BAR — `cosmetics.emoteOrder`
 *
 *  READ THIS BEFORE CHANGING ANY OF THE FOUR FUNCTIONS BELOW. They are the ONLY
 *  definition of what an emote bar is, and four surfaces render from them:
 *  the web picker, the mobile picker, and both storefronts. Every one of those
 *  used to answer the question itself, and every one answered it differently —
 *  which is precisely how a player could add an emote to their bar in the shop
 *  and have literally nothing change in game, on either platform.
 *
 *  THE CONTRACT
 *    stored value   an ORDERED list of emote ids, at most MAX_EMOTE_BAR long.
 *    empty          means "the stock bar" — the free emotes in catalogue order.
 *                   It is NOT "no emotes". Every account starts here, and
 *                   `[]` is what Reset writes, so this branch is the common one.
 *    unowned ids    are DROPPED at render, never at read. A refund, a rollback
 *                   or a hand-edited document must not leave a button whose
 *                   every press the server silently rejects.
 *
 *  WHY THE STORED LIST IS EXPLICIT AND NOT A DIFF. Adding one paid emote used
 *  to write `['fire']` — the whole list, one entry long — because the client
 *  appended to an EMPTY array and empty means default. The bar went from eight
 *  emotes to one, and the only reason nobody noticed for a whole release is
 *  that no picker read the field at all. Anything that appends now seeds from
 *  resolveEmoteBar() first (see toEmoteBarIds), so the list it appends to is
 *  the bar the player can actually see.
 * ======================================================================== */

/**
 * How many emotes the in-game picker holds.
 *
 * TWELVE, NOT EIGHT, and the number is load-bearing. The bar's default is the
 * eight free emotes, so a cap of eight meant a player's very first purchase was
 * met with "your bar is full, remove one first" — buying a thing and being told
 * to throw a thing away to use it. Twelve leaves room for the free set plus a
 * few bought ones, which is the actual shape of an emote collection.
 *
 * api/stampShop.js imports this; it is the server's validation ceiling too.
 */
export const MAX_EMOTE_BAR = 12;

/** The free emotes, in wire order. The stock bar, and the fallback for everything. */
export const FREE_EMOTES = EMOTE_CATALOG.filter((e) => e.free);

/** The stock arrangement as ids. `[]` in the database resolves to exactly this. */
export function defaultEmoteBar() {
  return FREE_EMOTES.map((e) => e.id);
}

/** Free, or bought. An unknown emote is neither. */
function owns(emote, ownedSet) {
  if (!emote) return false;
  if (emote.free) return true;
  return !!emote.sku && ownedSet.has(emote.sku);
}

/**
 * Every emote this account may send, in catalogue order — the SHOP's roster,
 * not the picker's. The picker shows the bar; the shop shows everything you
 * could put in it.
 */
export function availableEmotes(owned) {
  const ownedSet = new Set(Array.isArray(owned) ? owned : []);
  return EMOTE_CATALOG.filter((e) => owns(e, ownedSet));
}

/**
 * THE PICKER ROSTER — what the in-game bar actually renders, as catalogue
 * entries. Both clients call this and nothing else.
 *
 * Falls back to the free set when the stored order is empty, unknown, or filters
 * down to nothing. A player can therefore never end up with an empty emote
 * button, whatever is in their document.
 */
export function resolveEmoteBar(emoteOrder, owned) {
  const ownedSet = new Set(Array.isArray(owned) ? owned : []);
  const out = [];
  const seen = new Set();

  if (Array.isArray(emoteOrder)) {
    for (const id of emoteOrder) {
      const emote = getEmote(id);
      if (!emote || seen.has(emote.id) || !owns(emote, ownedSet)) continue;
      seen.add(emote.id);
      out.push(emote);
      if (out.length >= MAX_EMOTE_BAR) break;
    }
  }

  return out.length ? out : FREE_EMOTES.slice();
}

/* ---------------------------------------------------------------------------
 *  THE TWO EDITS. Between them they are every change a player can make to a
 *  bar, and they are here rather than in a component because "what does putting
 *  an emote in slot 6 mean" is precisely the class of question this file exists
 *  to answer once. The shop used to offer five verbs across two surfaces (drag
 *  to reorder, tap a slot to remove, a card button to add, the same button to
 *  remove, a reset) with three refusals hanging off them; both clients now offer
 *  ONE: tap a slot, pick an emote.
 *
 *  They take the list the user is LOOKING AT — resolveEmoteBar's output, mapped
 *  to ids — never the stored array, for the reason argued at the top of this
 *  section: stored empty means the stock bar, so editing the stored value
 *  directly is how a bar of eight became a bar of one.
 * ------------------------------------------------------------------------ */

/**
 * Put `id` in cell `index`. THE ONLY WAY AN EMOTE ENTERS A BAR.
 *
 * Three outcomes, and the third is the whole reason there is no drag handle
 * anywhere in the shop any more:
 *
 *   the cell is past the end        append. Tapping one of the empty slots and
 *                                   choosing something is how a bar grows.
 *   the emote is not in the bar     it replaces whatever was in that cell. The
 *                                   displaced emote is not lost — it is still
 *                                   in the picker, because owning it is what
 *                                   put it there, not its position here.
 *   the emote IS in another cell    THE TWO TRADE PLACES. That is the reorder
 *                                   gesture, and expressing it as a swap is
 *                                   what let a pointer-capture drag with a 6px
 *                                   slop threshold (and its "was that a tap or
 *                                   a drag" ambiguity, and mobile's separate
 *                                   select-then-nudge toolbar) be deleted
 *                                   outright on both clients.
 *
 * Returns the SAME ARRAY when nothing would change, so a caller can skip the
 * write with `next === ids` rather than diffing two lists.
 */
export function setEmoteAt(ids, index, id) {
  const list = Array.isArray(ids) ? ids : [];
  if (!Number.isInteger(index) || index < 0) return list;
  if (!getEmote(id)) return list;

  const from = list.indexOf(id);

  // Past the end: append, or — if this emote is already placed — move it to the
  // end, which is the same gesture read the other way round. Never duplicate:
  // the server rejects a repeated id outright, and a bar that showed the same
  // face twice would be shorter than it looks.
  if (index >= list.length) {
    if (from >= 0) return [...list.slice(0, from), ...list.slice(from + 1), id];
    if (list.length >= MAX_EMOTE_BAR) return list;
    return [...list, id];
  }

  if (from === index) return list;

  const next = list.slice();
  if (from >= 0) next[from] = next[index];
  next[index] = id;
  return next;
}

/**
 * Empty cell `index`, closing the gap behind it.
 *
 * IT COMPACTS RATHER THAN LEAVING A HOLE. The stored value is an ordered list,
 * so a hole is not a thing it can express; the empty cells on screen are simply
 * the tail of a 12-cell frame that the list has not reached yet.
 *
 * REFUSES THE LAST ONE, and returns the list unchanged rather than throwing or
 * reporting. An empty order MEANS the stock bar (see resolveEmoteBar), so
 * clearing the final emote would resolve straight back to the free eight and
 * the removal would silently undo itself. The UI states this as a greyed-out
 * control with the reason beside it, which is a refusal you meet BEFORE you
 * press rather than a red message after.
 */
export function clearEmoteAt(ids, index) {
  const list = Array.isArray(ids) ? ids : [];
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return list;
  if (list.length <= 1) return list;
  return list.filter((_, i) => i !== index);
}

/**
 * The value to PERSIST for a bar the user just arranged.
 *
 * Normalises back to `[]` when the result is the stock arrangement, so "reset"
 * is a state the bar can reach by hand — drag the free eight back into
 * catalogue order and the document says default again, rather than holding a
 * frozen copy of a list that a future release might extend.
 */
export function toEmoteBarIds(ids, owned) {
  const ownedSet = new Set(Array.isArray(owned) ? owned : []);
  const seen = new Set();
  const out = [];

  for (const id of Array.isArray(ids) ? ids : []) {
    const emote = getEmote(id);
    if (!emote || seen.has(emote.id) || !owns(emote, ownedSet)) continue;
    seen.add(emote.id);
    out.push(emote.id);
    if (out.length >= MAX_EMOTE_BAR) break;
  }

  const stock = defaultEmoteBar();
  const isStock = out.length === stock.length && out.every((id, i) => id === stock[i]);
  return isStock ? [] : out;
}
