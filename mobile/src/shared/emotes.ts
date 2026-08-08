// OFFLINE FALLBACK ONLY. The live emote roster comes from the shop catalog
// fetch (api.getShopCatalog) crossed with the account's owned skus; this table
// is what the picker renders before that lands, when it fails, and for guests.
//
// Hand-maintained mirror of shared/emotes/catalog.js. Entry shape:
//   id           stable string id, the wire value going forward
//   glyph        what is drawn (emoji, or plain text for 'GG')
//   free         true = available to everyone, no purchase
//   sku          shop sku for paid emotes, null for free ones
//   legacyIndex  0..7 for the ORIGINAL eight emotes, null for everything else
//
// WHY legacyIndex EXISTS: the old wire protocol sent an integer index into
// components/emoteReactions.js EMOTES, and every previously shipped mobile build
// still speaks it. Those eight indices are FROZEN FOREVER — reordering this list,
// or inserting a paid emote among them, silently rewrites what old clients
// display. New emotes are id-addressed only.

export interface EmoteDef {
  id: string;
  /** Shop card title. Mirrors `name` in shared/emotes/catalog.js. */
  name: string;
  glyph: string;
  free: boolean;
  sku: string | null;
  legacyIndex: number | null;
  /**
   * Effect id, mirroring `fx` in shared/emotes/catalog.js. Present on the skull
   * and nothing else: it is what the top of the price ladder (1000 Stamps) is
   * selling.
   *
   * NOT DRAWN ON THIS CLIENT YET. Web renders it as a CSS class
   * (.emoteFx--<fx>, an animated drop-shadow pair in styles/globals.scss) and RN
   * has no equivalent to copy, so a native version is a Reanimated glow layer
   * behind the glyph in EmoteReactions.tsx and the shop's cells. The field is
   * carried here regardless, so the mirror stays a true mirror and whoever picks
   * that up finds the data already in place rather than a table that quietly
   * disagrees with the server's.
   */
  fx?: string | null;
}

export const EMOTE_CATALOG: readonly EmoteDef[] = [
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
  // 1000 Stamps, against a ladder that otherwise stops at 150 — the chase item,
  // and the only entry in this table with an effect. See the `fx` field note.
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
  EMOTE_CATALOG.filter((e) => Number.isInteger(e.legacyIndex)).map((e) => [e.legacyIndex as number, e]),
);

/** Entry for an id, or null. Never throws: this is fed straight from the wire. */
export function getEmote(id: string | null | undefined): EmoteDef | null {
  if (typeof id !== 'string') return null;
  return BY_ID.get(id) ?? null;
}

/** Entry for a legacy integer index 0..7, or null for anything else. */
export function byLegacyIndex(i: unknown): EmoteDef | null {
  if (!Number.isInteger(i)) return null;
  return BY_LEGACY_INDEX.get(i as number) ?? null;
}

/**
 * Whether an emote needs no purchase. An UNKNOWN id is NOT free — fail closed,
 * so a typo or a forged value can never bypass an ownership check.
 */
export function isFree(id: string): boolean {
  return getEmote(id)?.free === true;
}

/* ===========================================================================
 *  THE EMOTE BAR — `cosmetics.emoteOrder`
 *
 *  HAND-MAINTAINED MIRROR of the block by the same name in
 *  shared/emotes/catalog.js. Read that file's header before touching any of
 *  this: it is the definition, this is the copy the app bundle can import.
 *
 *    stored value   an ORDERED list of emote ids, at most MAX_EMOTE_BAR long.
 *    empty          means "the stock bar" — the free emotes in catalogue order,
 *                   NOT "no emotes". Every account starts here.
 *    unowned ids    are dropped at render, never at read.
 *
 *  THIS APP USED TO IGNORE THE FIELD ENTIRELY. getAvailableEmotes() below is
 *  still here because the shop needs it, but the picker no longer calls it: it
 *  showed everything you owned in catalogue order, so arranging a bar on the web
 *  changed nothing here, and the two clients disagreed about what "your emotes"
 *  even meant. The picker calls resolveEmoteBar() now, exactly as web does.
 * ======================================================================== */

/** Mirrors MAX_EMOTE_BAR in shared/emotes/catalog.js. The server's ceiling too. */
export const MAX_EMOTE_BAR = 12;

/** The free emotes, in wire order. The stock bar, and the fallback for everything. */
export const FREE_EMOTES: readonly EmoteDef[] = EMOTE_CATALOG.filter((e) => e.free);

/** The stock arrangement as ids. `[]` in the database resolves to exactly this. */
export function defaultEmoteBar(): string[] {
  return FREE_EMOTES.map((e) => e.id);
}

/** Free, or bought. An unknown emote is neither. */
function owns(emote: EmoteDef | null, ownedSet: Set<string>): boolean {
  if (!emote) return false;
  if (emote.free) return true;
  return !!emote.sku && ownedSet.has(emote.sku);
}

/**
 * What THIS account may send, in catalogue order — the SHOP's roster, not the
 * picker's. The picker shows the bar; the shop shows everything you could put
 * in it. An unknown/absent `owned` degrades to free-only rather than offering
 * buttons every press of which the server would silently drop.
 */
export function getAvailableEmotes(owned?: string[] | null): EmoteDef[] {
  const ownedSet = new Set(Array.isArray(owned) ? owned : []);
  return EMOTE_CATALOG.filter((e) => owns(e, ownedSet));
}

/**
 * THE PICKER ROSTER — what the in-game bar renders. Falls back to the free set
 * when the stored order is empty, unknown, or filters down to nothing, so a
 * player can never end up with an empty emote button.
 */
export function resolveEmoteBar(
  emoteOrder?: string[] | null,
  owned?: string[] | null,
): EmoteDef[] {
  const ownedSet = new Set(Array.isArray(owned) ? owned : []);
  const out: EmoteDef[] = [];
  const seen = new Set<string>();

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

/**
 * Put `id` in cell `index` — THE ONLY WAY AN EMOTE ENTERS A BAR, on either
 * client. Past the end appends; an emote already in another cell TRADES PLACES
 * with the one there, which is what makes reordering a tap instead of a drag.
 * Takes the VISIBLE list (resolveEmoteBar mapped to ids), never the stored one.
 * Returns the same array when nothing would change.
 */
export function setEmoteAt(ids: string[], index: number, id: string): string[] {
  const list = Array.isArray(ids) ? ids : [];
  if (!Number.isInteger(index) || index < 0) return list;
  if (!getEmote(id)) return list;

  const from = list.indexOf(id);

  // Never duplicate: the server rejects a repeated id, and a bar showing the
  // same face twice is shorter than it looks. Already placed + past the end
  // therefore means "move it to the end".
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
 * Empty cell `index`, closing the gap behind it — the stored value is an
 * ordered list, so a hole is not a thing it can express.
 *
 * REFUSES THE LAST ONE and returns the list unchanged: an empty order MEANS the
 * stock bar, so clearing the final emote would resolve back to the free eight
 * and undo itself. The UI greys the control instead of reporting after a press.
 */
export function clearEmoteAt(ids: string[], index: number): string[] {
  const list = Array.isArray(ids) ? ids : [];
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return list;
  if (list.length <= 1) return list;
  return list.filter((_, i) => i !== index);
}

/**
 * The value to PERSIST for a bar the user just arranged. Normalises back to
 * `[]` when the result is the stock arrangement, so "reset" is a state the bar
 * can reach by hand.
 */
export function toEmoteBarIds(ids: string[], owned?: string[] | null): string[] {
  const ownedSet = new Set(Array.isArray(owned) ? owned : []);
  const seen = new Set<string>();
  const out: string[] = [];

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

export const EMOTE_TTL_MS = 3200; // how long an incoming reaction floats
export const EMOTE_COOLDOWN_MS = 1500; // min gap between sends (server also enforces)
