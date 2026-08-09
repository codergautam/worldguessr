import clientConfig from '@/clientConfig';
import { createUUID } from '@/components/createUUID';

/* ===========================================================================
 *  STAMPS SHOP — the transport layer
 *
 *  One endpoint (POST /api/stampShop), five actions, dispatched on `action`.
 *  Everything the UI knows about the wire lives in this file so there is
 *  exactly one place that knows the auth shape, the retry rule and the error
 *  codes. See api/stampShop.js for the server half.
 *
 *  THREE RULES THIS FILE EXISTS TO ENFORCE
 *
 *   1. THE CLIENT NEVER SENDS A PRICE. It sends a sku; the server re-resolves
 *      the price from the catalogue and its override row. A client-sent price
 *      is a client-set price.
 *
 *   2. RETRY ONLY ON A NETWORK FAILURE, NEVER ON A 4xx. A timeout means we do
 *      not know whether the charge landed, so the retry reuses the SAME body —
 *      and therefore the same purchaseKey, which is the server's idempotency
 *      key. A 4xx is a definitive answer ("you already own it", "not enough
 *      stamps"); retrying it just burns rate limit.
 *
 *   3. duplicate:true IS SUCCESS. It comes back 200 and means the idempotency
 *      key already charged — i.e. our retry worked. Refresh state from it, do
 *      NOT surface an error.
 * ======================================================================== */

/** Web is the only platform this bundle ever is. */
export const SHOP_PLATFORM = 'web';

/* (CONFIRM_THRESHOLD lived here — the price above which a purchase opened a
   confirmation modal. Removed by user ruling: every item buys in one press.) */

/** Display only. Mirrors ADFREE_DAILY_CAP in api/stampShop.js. */
export const ADFREE_DAILY_CAP = 3;

/*
 * THE EMOTE BAR CAP IS NOT DECLARED HERE ANY MORE. It was a hand-kept `8`
 * mirroring a hand-kept `8` in api/stampShop.js, and a client and a server that
 * each own a copy of the same rule is how the bar ended up meaning two different
 * things. Import MAX_EMOTE_BAR from shared/emotes/catalog.js, which the server
 * imports too.
 */

/** The ad-free pass sku, so the pass tab can label its own cap. */
export const ADFREE_SKU = 'pass_adfree_20m';

/* ---------------------------------------------------------------------------
 *  BUY COUNTS — "1.2K bought" under a card
 * ------------------------------------------------------------------------ */

/**
 * The figure at which a buy count stops being printed exactly and starts being
 * abbreviated by components/utils/fmtNumber.js (1.1K, 12K, 343K). It is that
 * file's own threshold, restated here because it is ALSO the ceiling on the
 * optimistic +1 below, and the two have to be the same number.
 *
 * WHY THE OPTIMISTIC BUMP STOPS HERE. Under it, every single buy is a visible
 * digit, so a count that sat still while you bought the thing would read as
 * broken. At or above it a +1 moves no pixel — and it could only round a label
 * across a line the server has not crossed yet (999,999 -> "1M" off one local
 * press). The server's number arrives on the next catalogue open either way.
 *
 * Mirrored in mobile/app/shop.tsx, which does the identical thing to the
 * identical field.
 */
export const BUY_COUNT_EXACT_MAX = 1000;

/**
 * The catalogue with ONE sku's buy count raised by one — the optimistic paint
 * after a purchase, so the buyer sees their own buy land without a refetch.
 *
 * IT COVERS THE OPEN STOREFRONT AND NOTHING BEYOND IT, which is all it has to:
 * the server drops its own count cache on the write (api/stampShop.js), so the
 * next catalogue open reads the real figure. This exists because the storefront
 * deliberately does not refetch after a buy, not because the server's number is
 * allowed to be behind.
 *
 * RETURNS THE SAME ARRAY WHEN NOTHING CHANGED, and the same OBJECT for every row
 * it did not touch. The storefront memoises ~45 cards on their `item` prop, so
 * rebuilding the list to move one number would re-render the whole page.
 */
export function withOptimisticBuy(items, sku) {
  if (!Array.isArray(items) || !sku) return items;
  let changed = false;
  const next = items.map((item) => {
    if (item.sku !== sku) return item;
    const count = Number(item.purchases);
    if (!Number.isFinite(count) || count >= BUY_COUNT_EXACT_MAX) return item;
    changed = true;
    return { ...item, purchases: count + 1 };
  });
  return changed ? next : items;
}

/**
 * A failed shop call, carrying the server's machine-readable code.
 * `code` is what the UI switches on; `message` is the server's English prose
 * and is only ever a last-resort fallback (we localise from the code).
 */
export class ShopError extends Error {
  constructor(code, message, status, payload) {
    super(message || code);
    this.name = 'ShopError';
    this.code = code || 'server_error';
    this.status = status || 0;
    this.payload = payload || null;
  }
}

/**
 * Error code -> locale key. Anything not listed falls back to shopErrorGeneric,
 * which is deliberate: a new server code should read as "something went wrong",
 * never as a raw identifier on a 2M-user surface.
 *
 * insufficient_stamps is NOT in here. It is not an error state in the UI — the
 * card keeps showing its price and the button is simply greyed out and cannot
 * be pressed (.shopCard__btn--buy:disabled).
 */
const ERROR_KEYS = {
  not_authenticated: 'shopErrorSignedOut',
  banned: 'shopErrorBanned',
  not_owned: 'shopErrorNotOwned',
  emote_not_owned: 'shopErrorNotOwned',
  already_owned: 'shopErrorAlreadyOwned',
  daily_cap_reached: 'shopErrorDailyCap',
  account_rate_limited: 'shopErrorRateLimited',
  rate_limited: 'shopErrorRateLimited',
  network_error: 'shopErrorNetwork',
};

/** Locale key for a ShopError (or anything else that got thrown). */
export function errorKeyFor(error) {
  if (error?.status === 429) return 'shopErrorRateLimited';
  return ERROR_KEYS[error?.code] || 'shopErrorGeneric';
}

/**
 * A fresh idempotency key, minted once per button press and kept stable across
 * every retry of THAT press. crypto.randomUUID needs a secure context; the
 * house Math.random UUID covers http://localhost and the odd old browser. Both
 * satisfy the server's 8-100 character rule.
 */
export function mintPurchaseKey() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (e) { /* fall through */ }
  return createUUID();
}

function endpoint() {
  return clientConfig().apiUrl + '/api/stampShop';
}

/**
 * POST one action.
 *
 * @param {string} action  catalog | purchase | equip | balance | history
 * @param {object} payload merged into the body (token, sku, slot, ...)
 * @param {{ retryOnNetworkError?: boolean }} opts
 *        Purchases pass true. The retry re-sends the IDENTICAL body, so the
 *        purchaseKey is reused and the server collapses both attempts onto one
 *        ledger row. Never set it for anything that is not idempotent.
 */
export async function shopRequest(action, payload = {}, opts = {}) {
  const { retryOnNetworkError = false } = opts;
  const body = JSON.stringify({ action, platform: SHOP_PLATFORM, ...payload });
  const attempts = retryOnNetworkError ? 2 : 1;

  let res = null;
  let lastNetworkError = null;

  for (let i = 0; i < attempts; i++) {
    try {
      res = await fetch(endpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      lastNetworkError = null;
      break;
    } catch (e) {
      // Transport failure only — fetch does not reject on 4xx/5xx. We do not
      // know whether the server saw it, which is exactly what the idempotency
      // key is for.
      lastNetworkError = e;
    }
  }

  if (lastNetworkError || !res) {
    throw new ShopError('network_error', lastNetworkError?.message || 'Network error', 0, null);
  }

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }

  if (!res.ok) {
    throw new ShopError(data?.error, data?.message, res.status, data);
  }
  return data || {};
}

/**
 * The entitlement block, pulled out of ANY response that carries one (catalog,
 * purchase, equip, balance, history — and the 402 insufficient_stamps body,
 * which carries it too and is the cheapest way to correct a stale balance).
 *
 * Returns null when the response has none, so callers can patch-or-skip
 * without inventing zeros. `stamps` is the marker field: the server always
 * emits it as a number alongside cosmetics.
 */
export function entitlementsFrom(data) {
  if (!data || typeof data.stamps !== 'number') return null;
  return {
    stamps: data.stamps,
    cosmetics: {
      owned: Array.isArray(data.cosmetics?.owned) ? data.cosmetics.owned : [],
      equipped: {
        background: data.cosmetics?.equipped?.background || null,
        nameGlow: data.cosmetics?.equipped?.nameGlow || null,
        markerSkin: data.cosmetics?.equipped?.markerSkin || null,
      },
      emoteOrder: Array.isArray(data.cosmetics?.emoteOrder) ? data.cosmetics.emoteOrder : [],
    },
    adFreeUntil: data.adFreeUntil || null,
    // FAIL CLOSED: an absent flag is off, never "probably on".
    stampsEnabled: data.stampsEnabled === true,
  };
}

/** The catalogue `type` a slot accepts. Mirrors SLOT_TYPES in api/stampShop.js. */
export const SLOT_FOR_TYPE = {
  background: 'background',
  glow: 'nameGlow',
  marker: 'markerSkin',
};

/* ---------------------------------------------------------------------------
 *  THE DEFAULT (BASELINE) CARD
 *
 *  Every slot can hold nothing, and "nothing" is a real, choosable look: the
 *  plain white name, the stock pin, the stock site background. The server
 *  has always accepted it — api/stampShop.js treats `sku === null` as an
 *  explicit unequip — but until now no client ever sent it, so buying one glow
 *  meant wearing a glow forever.
 *
 *  These are NOT catalogue items and must never be treated as such:
 *    - `sku: null` is what goes on the wire, and it is also what makes the
 *      preview render the baseline (no glow props resolve for a null sku).
 *    - there is no price, no `owned`, no purchase path. A card that showed a
 *      price of 0 would read as a free item somebody has to claim.
 *    - `isDefault` is the ONE flag the previews branch on, so nothing has to
 *      infer "baseline" from an absent sku three files away.
 *
 *  Frozen and module-scoped because the card list is memoised: a fresh object
 *  per render would defeat React.memo on the card AND on the preview inside it.
 * ------------------------------------------------------------------------ */
export const DEFAULT_ITEMS = Object.freeze({
  glow: Object.freeze({ sku: null, type: 'glow', isDefault: true }),
  marker: Object.freeze({ sku: null, type: 'marker', isDefault: true }),
  // `name` and `cc` are the two fields a baseline card borrows from a real
  // catalogue row, and ONLY the background takes them. This card sits in a grid
  // of ten named, flagged cities, and the stock background is a photograph of a
  // specific place — Trafalgar Square at dusk (lib/siteBackground.js). Calling
  // it "Default" made the one city everybody already owns the only card that
  // would not tell you where it was.
  //
  // The other two baselines keep the locale label: there is no city behind "no
  // glow" or "the stock pin", so `shopDefaultName` still renders for them (and
  // still does on mobile, which has no background shelf at all). That is why the
  // name goes HERE rather than into the locale string — one shared key cannot
  // say "London" for one card and "Default" for the other two.
  //
  // NOT TRANSLATED, on purpose: it is the tenth entry in a shelf of proper
  // nouns, and the nine beside it (Paris, Tokyo, Rio de Janeiro) are plain
  // strings straight out of shared/shop/catalog.js.
  background: Object.freeze({ sku: null, type: 'background', isDefault: true, name: 'London', cc: 'gb' }),
});

/*
 * THE BASELINE CARDS CARRY NO NOTE, and the map of locale keys that fed one is
 * deleted rather than emptied. Every note it held described the preview sitting
 * directly above it — "your name with no glow", "the standard map pin" — on a
 * card already titled Default. Three lines of copy for three facts the picture
 * states better. Nothing renders a note here now, so nothing needs a table of
 * them; the same ruling that took the per-sku blurbs off the catalogue.
 */

/**
 * The busy key useStampShop stamps while a slot is being CLEARED.
 *
 * equip(type, null) is called with no third argument, so the hook falls through
 * to `slot:<slot>` — the sku is null and locking on null would leave the card
 * that was just clicked fully live. This is that string, in one place, so the
 * Default card and the hook cannot drift.
 */
export function slotBusyKey(slot) {
  return `slot:${slot}`;
}

/**
 * Tab order. Anything with no items in it is dropped before render.
 *
 * PINS, THEN GLOWS, THEN BACKGROUNDS — sorted by WHO SEES IT, not by price. A
 * pin is what every other player watches land on the map; a glow follows your
 * name into every duel, lobby and leaderboard; a background dresses YOUR OWN
 * menu and nobody else's. Backgrounds used to open the page because they are
 * the biggest picture on it, which is a layout argument, and it put the one
 * category that never appears in a match in front of the two that do.
 *
 * IT IS DELIBERATELY NOT PRICE ORDER (backgrounds are 100, pins 200, glows
 * 500), so do not "fix" it into one. Price sorts the cards INSIDE a shelf; what
 * the thing is worth showing off sorts the shelves.
 *
 * This list is section order on BOTH storefronts: mobile/app/shop.tsx mirrors it
 * minus 'background' (that client never receives backgrounds). Keep them in step
 * — the same shop in the same order on both platforms is the whole point.
 */
export const CATEGORY_ORDER = ['marker', 'glow', 'background', 'emote', 'pass'];

export const CATEGORY_LABEL_KEY = {
  // The catalogue type stays 'marker' (it is on the wire and in the DB); only
  // the shelf label is "Pins".
  marker: 'shopCategoryPins',
  glow: 'shopCategoryGlows',
  background: 'shopCategoryBackgrounds',
  emote: 'shopCategoryEmotes',
  pass: 'shopCategoryPasses',
};

/**
 * One line under each section heading saying WHAT THIS KIND OF THING IS and
 * where it shows up in game.
 *
 * THIS IS NOT THE PER-ITEM BLURB COMING BACK, and the difference is the whole
 * reason one is right and the other was wrong. A card's blurb described the
 * picture directly above it ("Golden hour over the Golden Gate", under a
 * photograph of the Golden Gate at golden hour): the preview already said it,
 * better, and it said it forty times down a page. A SECTION line says the thing
 * no preview can — that a glow follows your name into a duel, that a pin is
 * what other players see land on the map — once per shelf, for a shopper who
 * has never owned one and cannot tell from a swatch what they would be buying.
 *
 * One line each. If one ever needs two, the shelf is misnamed.
 */
export const CATEGORY_DESC_KEY = {
  marker: 'shopCategoryPinsDesc',
  glow: 'shopCategoryGlowsDesc',
  background: 'shopCategoryBackgroundsDesc',
  emote: 'shopCategoryEmotesDesc',
  pass: 'shopCategoryPassesDesc',
};
