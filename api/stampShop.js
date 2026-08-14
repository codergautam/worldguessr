import User from '../models/User.js';
import StampLedger from '../models/StampLedger.js';
import StampQuests from '../models/StampQuests.js';
import { dayKeyUTC } from '../serverUtils/stamps/periods.js';
import ShopCatalog from '../models/ShopCatalog.js';
import ShopPurchaseCount from '../models/ShopPurchaseCount.js';
import { SHOP_CATALOG, getItem, effectivePrice } from '../shared/shop/catalog.js';
import { EMOTE_CATALOG, getEmote, MAX_EMOTE_BAR } from '../shared/emotes/catalog.js';
import { STAMPS_ENABLED } from '../serverUtils/stamps/config.js';
import { STAMP_REASONS } from '../serverUtils/stamps/reasons.js';
import { grantStamps } from '../serverUtils/stamps/grantStamps.js';
import { syncedClearCache } from '../serverUtils/cacheBus.js';
import { registerStat } from '../serverUtils/statRegistry.js';
import { rateLimit } from '../utils/rateLimit.js';

// ============================================================================
// STAMPS SHOP — one endpoint, five actions (catalog | purchase | equip |
// balance | history), dispatched on body.action.
//
// ONE FILE ON PURPOSE: five files would be five copies of the auth boilerplate
// and five chances to forget a link in the cache chain below.
//
// ---------------------------------------------------------------------------
// THE CACHE CHAIN — READ THIS BEFORE TOUCHING ANY MUTATION PATH
// ---------------------------------------------------------------------------
// A purchase or an equip writes User, and User is cached in three different
// places under three different keys. Miss one and the buyer pays and then sees
// their old inventory for up to two minutes, with no error anywhere.
// clearUserCaches() below is the whole chain; call it after EVERY mutation:
//
//   1. syncedClearCache(`userAuth_${user.secret}`)
//        kills the 120s cache on api/googleAuth.js's secret-login lookup.
//        `synced` matters: the api (3001) and auth (3004) processes each hold
//        their OWN copy of that entry, so a local clear fixes half the fleet.
//
//   2. syncedClearCache(`publicData_${user._id}`)
//        kills the 20s cache in api/publicAccount.js (mobile refreshAccount).
//
//   3. syncedClearCache(`crazyAuth_${user.crazyGamesId}`)  — CrazyGames users
//        kills the 120s cache in api/crazyAuth.js. Skip it and a CG player's
//        purchase is invisible to their own client for a full 120 seconds.
//
// DEPLOY PREREQUISITE, NOT A CODE FIX: syncedClearCache degrades silently to a
// local-process-only clear when MAINTENANCE_SECRET is unset (see
// serverUtils/cacheBus.js — it returns before the peer POSTs). The same env var
// gates the ws push below. Ship this feature without it and cross-process
// staleness comes back with zero log output.
//
// SURFACES DELIBERATELY NOT INVALIDATED (and therefore deliberately cosmetic-
// free in v1):
//   - api/publicProfile.js keeps a hand-rolled 60s Map with NO clear function
//     at all. Nothing outside that file can evict it.
//   - api/leaderboard.js stacks a 60s Map on top of a 15-minute cron rebuild,
//     i.e. up to ~16 minutes of lag.
// Rendering an equipped glow on either one would show the OLD glow long after
// the equip, so cosmetics are not sent to those endpoints. If that changes, the
// caches have to grow a clear path first.
//
// ---------------------------------------------------------------------------
// WHY THE DEBIT AND THE DELIVERY ARE ONE UPDATE
// ---------------------------------------------------------------------------
// This repo has ZERO mongoose transactions. Charging in one write and
// delivering in another leaves a window where a crash takes the stamps and
// hands over nothing. grantStamps(..., { extraUpdate }) fuses both into a
// single findOneAndUpdate on the User document, and single-document atomicity
// is the only guarantee available here. Never split them.
// ============================================================================

// Slot -> the catalogue `type` allowed in it. Equipping a marker into the glow
// slot must fail: the renderers read the slot, not the item.
const SLOT_TYPES = {
  background: 'background',
  nameGlow: 'glow',
  markerSkin: 'marker',
};

// IMPORTED, NEVER RESTATED. This used to be a local 8 while the clients used
// their own copy, and the two disagreeing is what let a bar be written that no
// picker could render. shared/emotes/catalog.js is the one definition.
const MAX_EMOTE_ORDER = MAX_EMOTE_BAR;
const ADFREE_SKU = 'pass_adfree_20m';
const ADFREE_DAILY_CAP = 3;
const HISTORY_DEFAULT = 25;
const HISTORY_MAX = 100;
// Per-account burst ceiling: ledger rows written for this user in the last
// minute. Per-IP alone is the wrong shape — one account can hammer from many
// IPs, and a whole school behind one NAT shares a single bucket.
const ACCOUNT_LEDGER_WINDOW_MS = 60_000;
const ACCOUNT_LEDGER_MAX = 12;
// The purchase reason's budgeted ceiling. Sourced from the reasons table so an
// override priced above it is rejected with a 400 instead of crashing inside
// assertReason.
const MAX_PURCHASE_PRICE = STAMP_REASONS.purchase?.maxAbs ?? 5000;

const VALID_PLATFORMS = ['web', 'mobile'];
const ACTIONS = ['catalog', 'purchase', 'equip', 'balance', 'history'];

/**
 * The entitlement block every auth response must carry: balance, cosmetics and
 * the ad-free expiry, plus the SERVER-DELIVERED feature flag.
 *
 * Exported from here (and imported by googleAuth / crazyAuth) so the shape is
 * written once. Three hand-maintained copies is how one of them ends up missing
 * a field after a schema change.
 *
 * stampsEnabled is server-delivered on purpose: a shipped app-store build
 * cannot be re-flagged, so the kill switch has to arrive in the payload.
 *
 * Every field is defaulted — user docs created before these fields existed have
 * them as undefined, and a client that receives undefined renders nothing.
 */
export function entitlementFields(user) {
  return {
    stamps: user?.stamps || 0,
    cosmetics: {
      owned: user?.cosmetics?.owned || [],
      equipped: {
        background: user?.cosmetics?.equipped?.background || null,
        nameGlow: user?.cosmetics?.equipped?.nameGlow || null,
        markerSkin: user?.cosmetics?.equipped?.markerSkin || null,
      },
      emoteOrder: user?.cosmetics?.emoteOrder || [],
    },
    adFreeUntil: user?.adFreeUntil || null,
    stampsEnabled: STAMPS_ENABLED,
  };
}

/** The default entitlement block for a brand-new account (no doc to read). */
export function defaultEntitlementFields() {
  return entitlementFields(null);
}

/** See THE CACHE CHAIN above. Every mutation path calls this. */
function clearUserCaches(user) {
  syncedClearCache(`userAuth_${user.secret}`);
  syncedClearCache(`publicData_${user._id.toString()}`);
  if (user.crazyGamesId) syncedClearCache(`crazyAuth_${user.crazyGamesId}`);
}

/**
 * Push the new cosmetics to the ws server so a live session updates instantly
 * instead of on the next reconnect.
 *
 * FIRE AND FORGET — never awaited in the response path. The ws endpoint is
 * synchronous by design (it must not await; see ws/ws.js) and the buyer's
 * purchase already succeeded in the database. A ws hiccup must not turn a
 * completed purchase into an error response.
 *
 * Same base-URL construction and env vars as the /enforce-ban call in
 * api/mod/takeAction.js. Do not invent a second one.
 *
 * The ws handler leaves ABSENT params alone and CLEARS on an explicitly empty
 * one, so always send the freshly-read current values — sending blanks would
 * wipe the player's equipped items.
 */
function pushCosmeticsToWs(accountId, { nameGlow, markerSkin, owned }) {
  if (!process.env.MAINTENANCE_SECRET) return;
  try {
    const wsPort = process.env.WS_PORT || 3002;
    const params = new URLSearchParams({
      nameGlow: nameGlow || '',
      markerSkin: markerSkin || '',
      owned: (owned || []).join(','),
    });
    const wsUrl = `http://localhost:${wsPort}/cosmetics-updated/${process.env.MAINTENANCE_SECRET}/${accountId}?${params.toString()}`;
    fetch(wsUrl, { method: 'GET' }).catch((error) => {
      // Non-critical: the DB write already landed, the client picks it up on
      // its next auth refresh or reconnect.
      console.warn('[stampShop] cosmetics ws push failed (non-critical):', error.message);
    });
  } catch (error) {
    console.warn('[stampShop] cosmetics ws push threw (non-critical):', error.message);
  }
}

/** Active ban? Same test as api/updateCountryCode.js. */
function hasActiveBan(user) {
  if (!user.banned) return false;
  return user.banType === 'permanent' ||
    (user.banType === 'temporary' && user.banExpiresAt && new Date(user.banExpiresAt) > new Date());
}

/** Is this override row live right now? */
function withinWindow(override, now) {
  if (!override) return true;
  if (override.availableFrom && now < new Date(override.availableFrom).getTime()) return false;
  if (override.availableUntil && now > new Date(override.availableUntil).getTime()) return false;
  return true;
}

/**
 * All override docs, keyed by sku. One query, whole collection — it is tiny.
 *
 * NEVER CACHED, unlike the purchase counts below. This is the layer that
 * disables an item, discounts it and time-windows it, and every one of those has
 * to take effect on the write, not on a TTL.
 */
async function loadOverrides() {
  const rows = await ShopCatalog.find({}).lean();
  return new Map(rows.map((r) => [r.sku, r]));
}

// ---------------------------------------------------------------------------
// PURCHASE COUNTS — the "1.2K bought" line under every card
// ---------------------------------------------------------------------------
// A MAP THIS FILE OWNS, INCREMENTED IN PLACE. Not a recachegoose key.
//
// Every storefront open reads this. Uncached that is one query per open forever,
// for a number nobody transacts against, so it is cached — but the cache used to
// be a plain 5-minute recachegoose TTL, and a TTL is the wrong tool for a
// counter. It has exactly two moves: serve the stored value, or throw it away
// and re-read. So a buy was either invisible for up to five minutes (the number
// is knowably one low at the precise moment a player is looking at it, because
// they just bought the thing) or, if invalidated on the write, cost a full
// re-read of the collection to learn a number we already knew.
//
// WE KNOW THE DELTA. It is one, every time, and this process is the only one
// that can produce it. So bumpPurchaseCount() below adds one to the map and that
// is the whole update: no invalidation, no re-read, no window in which the count
// is wrong. The TTL stays only as a reconciler — it re-seeds from the database
// so anything written outside this path (the backfill script, a manual fix, a
// restart of a peer) is picked up rather than diverging forever.
//
// ONE PROCESS SERVES THIS, WHICH IS WHY A LOCAL MAP IS EXACT. server.js
// auto-mounts the whole api/ folder; authServer.js hand-mounts /api/googleAuth
// and /api/setName and nothing else. Reader and writer are the same process. If
// a second process ever serves /api/stampShop, this becomes per-process again
// and converges on the TTL — the same behaviour recachegoose had, since that was
// an in-memory per-process store too, so nothing regresses. It would just want a
// peer notification on the bump, the way clearUserCaches does for entitlements.
//
// IT IS STILL NOT PART OF clearUserCaches(). That chain exists for ENTITLEMENTS,
// which have to be right the instant they change and are cleared per user; this
// is one global figure with one writer, and fusing the two would make every ban
// and every equip touch a cache that has nothing to do with either.
//
// THE BUYER SEES THEIR OWN BUY LAND WITHOUT WAITING FOR ANY OF THIS. Both
// clients add one locally on a successful purchase, because neither refetches
// the catalogue after a buy — but only while the figure is below the
// abbreviation threshold (1,000), because above it a +1 moves no pixel and could
// only round a label across a line the server has not crossed. See
// withOptimisticBuy() in components/shop/stampShopClient.js and bumpBuyCount()
// in mobile/app/shop.tsx.
const PURCHASE_COUNT_TTL_MS = 5 * 60 * 1000;

/** sku -> times bought. Missing entry means nobody has bought it yet, i.e. 0. */
let purchaseCounts = new Map();
/** When `purchaseCounts` was last seeded from the database. 0 = never. */
let purchaseCountsAt = 0;
/** The refresh in flight, so N simultaneous opens share ONE query. */
let purchaseCountsInflight = null;
/**
 * Buys that landed WHILE a refresh was in flight, replayed on top of its result.
 *
 * Without this the read wins a race it should lose: the query leaves at T, a
 * purchase increments both the database and the map at T+10ms, the query returns
 * pre-increment rows at T+50ms and overwrites the map — dropping a buy that is
 * sitting in the database, until the next refresh happens to pick it up. Null
 * when no refresh is running, which is almost always.
 */
let purchaseCountsPending = null;

registerStat('api/stampShop.purchaseCounts', () => purchaseCounts.size);

async function loadPurchaseCounts() {
  if (purchaseCountsAt && Date.now() - purchaseCountsAt < PURCHASE_COUNT_TTL_MS) {
    return purchaseCounts;
  }
  if (purchaseCountsInflight) return purchaseCountsInflight;

  purchaseCountsPending = new Map();
  purchaseCountsInflight = ShopPurchaseCount.find({})
    .select('sku count')
    .lean()
    .then((rows) => {
      const fresh = new Map(rows.map((r) => [r.sku, r.count || 0]));
      for (const [sku, delta] of purchaseCountsPending) {
        fresh.set(sku, (fresh.get(sku) || 0) + delta);
      }
      purchaseCounts = fresh;
      purchaseCountsAt = Date.now();
      return purchaseCounts;
    })
    .catch((error) => {
      // Serve the last good map and DO NOT stamp the clock, so the next open
      // retries rather than serving a failure for a full window. On a cold start
      // that map is empty, and an empty map is what "0 bought" already means —
      // a storefront that renders is worth more than a correct vanity number.
      console.warn('[stampShop] purchase count refresh failed:', error.message);
      return purchaseCounts;
    })
    .finally(() => {
      // Safe here and only here: these two run as consecutive microtasks after
      // the handler above, and a bump can only arrive on an HTTP request, which
      // is a macrotask. Nothing can slip in between.
      purchaseCountsInflight = null;
      purchaseCountsPending = null;
    });

  return purchaseCountsInflight;
}

/**
 * +1 on this sku's counter. FIRE AND FORGET — never awaited in the response
 * path, and a failure is a warn and nothing else.
 *
 * IT IS NOT FUSED INTO THE ATOMIC DEBIT. That fuse (see the header) exists so a
 * crash can never take a player's stamps without handing over what they paid
 * for. This is a label on a card. Widening the one write in this file that must
 * not grow a new way to fail, so it can carry a vanity number, is a bad trade —
 * the cost of losing one is that a card reads one buy low until the backfill
 * script is run again.
 *
 * The upsert can lose a race against another first-ever purchase of the same sku
 * on the unique index; the retry lands on the row the winner just created.
 *
 * THE CACHED FIGURE MOVES FIRST AND DOES NOT WAIT FOR THE DATABASE. We are
 * committing a known delta of exactly one, so the map can be right immediately;
 * making it wait would put the count behind for the length of a round trip, and
 * re-reading the collection afterwards would spend a query to learn a number we
 * just computed.
 *
 * IF THE WRITE THEN FAILS the map is one high until the TTL reconciles it down.
 * That is the better of the two failures available here: the old behaviour was a
 * lost write leaving the card one LOW permanently, until somebody re-ran the
 * backfill script.
 */
function bumpPurchaseCount(sku) {
  purchaseCounts.set(sku, (purchaseCounts.get(sku) || 0) + 1);
  if (purchaseCountsPending) {
    purchaseCountsPending.set(sku, (purchaseCountsPending.get(sku) || 0) + 1);
  }

  ShopPurchaseCount.updateOne({ sku }, { $inc: { count: 1 } }, { upsert: true })
    .catch((error) => {
      if (error?.code === 11000) return ShopPurchaseCount.updateOne({ sku }, { $inc: { count: 1 } });
      throw error;
    })
    .catch((error) => {
      console.warn('[stampShop] purchase count bump failed (non-critical):', error.message);
    });
}

/**
 * Emote order entries are stored as emote catalogue IDs (the wire value). A
 * client that sends shop SKUs instead is normalised rather than rejected — the
 * two tables are one-to-one and a 400 here would just be a mapping bug the user
 * cannot fix.
 */
const EMOTE_BY_SKU = new Map(EMOTE_CATALOG.filter((e) => e.sku).map((e) => [e.sku, e]));
function resolveEmote(value) {
  if (typeof value !== 'string' || !value) return null;
  return getEmote(value) || EMOTE_BY_SKU.get(value) || null;
}

/** Fresh entitlement state after a write. NEVER cached — it was just mutated. */
async function readFreshState(userId) {
  const doc = await User.findById(userId).select('stamps cosmetics adFreeUntil').lean();
  return entitlementFields(doc);
}

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const body = req.body || {};
  const { token, action } = body;

  if (typeof action !== 'string' || !ACTIONS.includes(action)) {
    return res.status(400).json({ error: 'invalid_action', message: `action must be one of: ${ACTIONS.join(', ')}` });
  }

  // KILL SWITCH — no DB contact whatsoever, on any action. A client that gets
  // { enabled: false } hides the whole shop surface.
  if (!STAMPS_ENABLED) {
    return res.status(200).json({ enabled: false });
  }

  // Per-IP throttle. NOTE: utils/rateLimit.js keys purely on IP with no route
  // namespace, so this bucket is shared with every other endpoint that uses it
  // (publicProfile, userProgression). That makes it stricter than the number
  // below, never looser, which is the safe direction.
  const limiter = rateLimit({ max: 40, windowMs: 60000, message: 'Too many shop requests. Please slow down.' });
  if (!limiter(req, res)) return; // 429 already sent

  const platform = (typeof body.platform === 'string' && VALID_PLATFORMS.includes(body.platform))
    ? body.platform
    : 'web';

  try {
    // ---- AUTH ---------------------------------------------------------------
    // NO .cache() here, ever. A cached read serves a stale balance, and a stale
    // balance is either a purchase the user cannot afford or a shop that still
    // shows an item they already bought.
    let user = null;
    if (typeof token === 'string' && token) {
      user = await User.findOne({ secret: token });
    }

    // `catalog` is browsable signed-out (the shop page renders for guests, just
    // with no balance and nothing owned). Every other action needs an account.
    if (!user && action !== 'catalog') {
      return res.status(401).json({ error: 'not_authenticated', message: 'Invalid token' });
    }

    const banned = user ? hasActiveBan(user) : false;

    switch (action) {
      case 'catalog':
        return await handleCatalog(res, user, platform);
      case 'balance':
        return res.status(200).json({ enabled: true, ...entitlementFields(user) });
      case 'history':
        return await handleHistory(res, user, body);
      case 'purchase':
        if (banned) {
          return res.status(403).json({ error: 'banned', message: 'Banned users cannot make purchases' });
        }
        return await handlePurchase(res, user, body, platform);
      case 'equip':
        if (banned) {
          return res.status(403).json({ error: 'banned', message: 'Banned users cannot change cosmetics' });
        }
        return await handleEquip(res, user, body);
      default:
        return res.status(400).json({ error: 'invalid_action' });
    }
  } catch (error) {
    console.error('[stampShop] error:', error);
    return res.status(500).json({ error: 'server_error', message: error.message });
  }
}

// ---------------------------------------------------------------------------
// catalog
// ---------------------------------------------------------------------------
/**
 * The code catalogue merged with its override rows, priced SERVER-SIDE, and
 * filtered to what this platform can actually render.
 *
 * The emote catalogue ships in the same response so mobile does not need a
 * third hardcoded mirror of a table that already exists twice.
 */
async function handleCatalog(res, user, platform) {
  // In parallel: one of them is a live read of a tiny collection, the other is
  // almost always a cache hit. Sequencing them would just add a round trip.
  // `counts`, NOT `purchaseCounts` — that name belongs to the module-level map
  // this resolves to, and shadowing it here makes the read below unreadable:
  // nobody should have to work out which of two same-named bindings a line is
  // touching when one of them is mutable and swapped out by the refresh.
  const [overrides, counts] = await Promise.all([loadOverrides(), loadPurchaseCounts()]);
  const now = Date.now();
  const owned = new Set(user?.cosmetics?.owned || []);

  const items = SHOP_CATALOG
    // PLATFORM FILTER. Every category ships to both storefronts today —
    // backgrounds were the last web-only row and joined mobile once the app
    // could load a remote WebP. The filter stays because the rule it enforces
    // has not changed: a client must never be sold an asset it cannot render.
    .filter((item) => (item.platforms || []).includes(platform))
    .filter((item) => {
      const override = overrides.get(item.sku);
      if (override && override.enabled === false) return false;
      return withinWindow(override, now);
    })
    .map((item) => {
      const override = overrides.get(item.sku);
      const price = effectivePrice(item, override?.priceOverride);
      return {
        sku: item.sku,
        type: item.type,
        name: item.name,
        // The ONLY price anyone should render. The client never sends a price
        // back — purchase re-resolves it from these same two inputs.
        price,
        basePrice: item.price,
        onSale: price !== item.price,
        platforms: item.platforms,
        path: item.path ?? null,
        // Backgrounds only: the ISO country code the card draws its flag from.
        // This whitelist is exhaustive, so a catalogue column that is not named
        // here never reaches either storefront — which is how `region` used to
        // look present and render nothing.
        cc: item.cc ?? null,
        // Backgrounds only: the three-tone palette the home screen recolours
        // itself to. Sent whole rather than flattened because both clients
        // read it by name (deep/wash/surface), and mobile has no catalogue of
        // its own to fall back on for a shelf it is rendering live.
        accent: item.accent ?? null,
        animated: item.animated ?? null,
        glowDark: item.glowDark ?? null,
        glowLight: item.glowLight ?? null,
        durationMs: item.durationMs ?? null,
        sortOrder: override?.sortOrder ?? 0,
        availableUntil: override?.availableUntil ?? null,
        owned: owned.has(item.sku),
        // How many times this has been bought. ALWAYS A NUMBER, never absent: a
        // client that has to distinguish "no row yet" from "nobody has bought
        // it" is a client with two ways to say zero. Both storefronts render
        // nothing at 0 rather than the words "0 bought".
        purchases: counts.get(item.sku) || 0,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // THE WHOLE TABLE, free entries included. Both storefronts render a card per
  // emote you can put in your bar, and the free eight are eight of those — a
  // shop that hid them was a shop where you could arrange twelve of your twenty
  // emotes. `name` rides along so neither client has to keep a second copy of
  // the labels (mobile kept one, and it drifted).
  const emotes = EMOTE_CATALOG.map((e) => ({
    id: e.id,
    name: e.name,
    glyph: e.glyph,
    free: e.free,
    sku: e.sku,
    legacyIndex: e.legacyIndex,
    owned: e.free || (e.sku ? owned.has(e.sku) : false),
  }));

  return res.status(200).json({
    enabled: true,
    platform,
    items,
    emotes,
    ...entitlementFields(user),
  });
}

// ---------------------------------------------------------------------------
// history
// ---------------------------------------------------------------------------
async function handleHistory(res, user, body) {
  const requested = Number(body.limit);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(1, Math.floor(requested)), HISTORY_MAX) : HISTORY_DEFAULT;

  const rows = await StampLedger.find({ userId: user._id })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('delta reason meta applied balanceAfter createdAt')
    .lean();

  return res.status(200).json({
    enabled: true,
    ...entitlementFields(user),
    history: rows.map((r) => ({
      delta: r.delta,
      reason: r.reason,
      sku: r.meta?.sku || null,
      applied: !!r.applied,
      balanceAfter: r.balanceAfter ?? null,
      createdAt: r.createdAt,
    })),
  });
}

// ---------------------------------------------------------------------------
// purchase
// ---------------------------------------------------------------------------
async function handlePurchase(res, user, body, platform) {
  const { sku, purchaseKey } = body;

  if (typeof sku !== 'string' || !sku) {
    return res.status(400).json({ error: 'invalid_sku', message: 'sku is required' });
  }
  // Client-minted per button press. It is the idempotency key: a double-tap, a
  // retried request or a flaky mobile connection collapses onto the same ledger
  // row instead of charging twice.
  if (typeof purchaseKey !== 'string' || purchaseKey.length < 8 || purchaseKey.length > 100) {
    return res.status(400).json({ error: 'invalid_purchase_key', message: 'purchaseKey must be a unique string (8-100 chars) minted per purchase attempt' });
  }

  // PER-ACCOUNT BURST GUARD (the per-IP limiter above cannot see this: one
  // account can spread requests over many IPs).
  const recentLedgerRows = await StampLedger.countDocuments({
    userId: user._id,
    createdAt: { $gt: new Date(Date.now() - ACCOUNT_LEDGER_WINDOW_MS) },
  });
  if (recentLedgerRows > ACCOUNT_LEDGER_MAX) {
    return res.status(429).json({ error: 'account_rate_limited', message: 'Too many transactions. Please wait a moment.' });
  }

  const item = getItem(sku);
  if (!item) {
    return res.status(400).json({ error: 'unknown_sku', message: 'No such item' });
  }
  if (!(item.platforms || []).includes(platform)) {
    return res.status(400).json({ error: 'wrong_platform', message: 'This item is not available on this platform' });
  }

  const override = await ShopCatalog.findOne({ sku }).lean();
  if (override && override.enabled === false) {
    return res.status(400).json({ error: 'item_disabled', message: 'This item is not for sale' });
  }
  if (!withinWindow(override, Date.now())) {
    return res.status(400).json({ error: 'item_unavailable', message: 'This item is not available right now' });
  }

  // PRICE IS RESOLVED SERVER-SIDE, ALWAYS. The request carries a sku, never a
  // price — a client-sent price is a client-set price.
  const price = effectivePrice(item, override?.priceOverride);
  const isConsumable = item.type === 'pass';

  if (!Number.isInteger(price) || price < 0 || price > MAX_PURCHASE_PRICE) {
    return res.status(400).json({ error: 'price_unavailable', message: 'This item cannot be purchased right now' });
  }
  // A price-0 consumable would deliver without writing a ledger row, and the
  // ad-free daily cap counts ledger rows — so a free pass would be uncapped and
  // stackable forever. Refuse instead of shipping an infinite-pass hole.
  if (isConsumable && price === 0) {
    return res.status(400).json({ error: 'price_unavailable', message: 'This item cannot be purchased right now' });
  }

  // FAST PATH ONLY. This answers "you already own it" without a write, but it
  // is NOT the guard — it reads a document fetched at the top of this request,
  // and two presses in the same handful of milliseconds both read it before
  // either write lands. The real guard is the extraFilter on the debit below.
  const ownedList = user.cosmetics?.owned || [];
  if (!isConsumable && ownedList.includes(sku)) {
    return res.status(400).json({ error: 'already_owned', message: 'You already own this item' });
  }

  // ---- Build the DELIVERY, to be fused into the debit --------------------
  let extraUpdate;
  let adFreeDurationMs = 0;
  let adFreeDayKey = null;
  if (item.sku === ADFREE_SKU) {
    // Repeatable consumable. Cap per UTC day via an ATOMIC conditional
    // counter — the same shape as the earn caps in ws/classes/Game.js. The
    // previous countDocuments read was check-then-act: N concurrent requests
    // (each press mints a distinct purchaseKey, so the ledger's idempotency
    // index cannot collapse them) all read the same pre-purchase count and
    // all passed the cap. The counter only moves while it is still under the
    // cap, so concurrency can never overshoot. The zero-$inc upsert
    // materialises the field on day docs that predate it — a $lt range query
    // never matches a missing field, and a missing counter must read as 0,
    // not as "capped".
    adFreeDayKey = dayKeyUTC();
    await StampQuests.updateOne(
      { userId: user._id, periodType: 'day', periodKey: adFreeDayKey },
      { $inc: { adFreePassesAwarded: 0 } },
      { upsert: true }
    );
    const slot = await StampQuests.findOneAndUpdate(
      { userId: user._id, periodType: 'day', periodKey: adFreeDayKey, adFreePassesAwarded: { $lt: ADFREE_DAILY_CAP } },
      { $inc: { adFreePassesAwarded: 1 } },
      { new: true }
    );
    if (!slot) {
      return res.status(400).json({ error: 'daily_cap_reached', message: `Limit ${ADFREE_DAILY_CAP} ad-free passes per day` });
    }

    // The EXTENSION is applied after the debit lands (see below), through an
    // aggregation-pipeline update that reads the CURRENT adFreeUntil inside
    // the server — so two racing purchases each add their duration
    // (max(now, current) + duration, chained) instead of both computing
    // near-identical absolutes from the same stale read and one $set eating
    // the other's charge. The cost is that charge and delivery are two
    // writes for this one sku: a process death in the ~ms between them loses
    // the extension (the row is applied:true, so the reconcile sweep will
    // not re-deliver). That window only opens on an unclean kill — deploys
    // drain (see server.js SIGTERM handler) — whereas the $set race was open
    // on every concurrent pair of presses, deliberately triggerable, and
    // silently ate a full charge.
    // Fallback only for a catalogue entry that somehow ships without a
    // duration; it must track shared/shop/catalog.js (60 minutes since the
    // Aug 13 2026 raise) or a missing field would silently sell a short pass.
    adFreeDurationMs = item.durationMs || 60 * 60 * 1000;
    extraUpdate = undefined;
  } else {
    // ONE SKU, ONE GRANT. There are no bundles in the catalogue any more, so
    // this deliberately does not fan out — see the header of
    // shared/shop/catalog.js before adding a multi-grant item back.
    extraUpdate = { $addToSet: { 'cosmetics.owned': sku } };
  }

  // ---- THE ATOMIC FUSE ---------------------------------------------------
  // A claimed ad-free slot whose charge did NOT land must be handed back, or
  // failed attempts (broke balance, stale retries, a thrown debit) burn the
  // day's cap without delivering anything. $gt: 0 keeps a double release from
  // going negative; a crash between claim and release leaks one slot until
  // UTC midnight — the cap can only ever under-serve, never be exceeded.
  const releaseAdFreeSlot = async () => {
    if (!adFreeDayKey) return;
    await StampQuests.updateOne(
      { userId: user._id, periodType: 'day', periodKey: adFreeDayKey, adFreePassesAwarded: { $gt: 0 } },
      { $inc: { adFreePassesAwarded: -1 } }
    ).catch(() => {});
  };

  // Debit and delivery in ONE document update. See the header: without this a
  // crash between two writes charges the player and hands over nothing.
  let result;
  if (price === 0) {
    // Free (an admin priceOverride of 0). grantStamps would throw here —
    // assertReason requires a negative delta for 'purchase' and Math.sign(-0)
    // is not -1 — so deliver directly. Consumables never reach this branch
    // (rejected above), and $addToSet is naturally idempotent, so replaying it
    // is harmless.
    await User.updateOne({ _id: user._id }, extraUpdate);
    result = { applied: true, duplicate: false, insufficient: false };
  } else {
    try {
    result = await grantStamps(
      user._id,
      -price,
      'purchase',
      `p:${user._id}:${purchaseKey}`,
      { sku },
      {
        extraUpdate,
        // THE DOUBLE-CLICK GUARD, AND IT HAS TO LIVE HERE. Every press mints a
        // fresh purchaseKey, so the ledger's idempotency index cannot collapse
        // two presses — by design, because two presses ARE two intents for a
        // repeatable pass. What must not happen is two CHARGES for a buy-once
        // item, and the only place that can be decided is inside the same
        // findOneAndUpdate that takes the stamps: the second write finds the
        // sku already in `cosmetics.owned` (the first one's $addToSet put it
        // there), matches nothing, and moves no money.
        //
        // Consumables get no filter: buying a second ad-free pass while one is
        // running is a real thing to want, and it stacks (see above).
        ...(isConsumable ? {} : { extraFilter: { 'cosmetics.owned': { $ne: sku } } }),
      },
    );
    } catch (e) {
      // A throw here never charged anyone — grantStamps' transaction rolls
      // back — so the claimed slot must not stay burned. Release, then let
      // the route wrapper report the failure.
      await releaseAdFreeSlot();
      throw e;
    }
  }

  if (result.insufficient) {
    await releaseAdFreeSlot();
    return res.status(402).json({
      error: 'insufficient_stamps',
      message: 'Not enough stamps',
      price,
      ...entitlementFields(user),
    });
  }

  // The debit's filter refused it. grantStamps cannot say WHICH condition
  // failed, so re-read and answer precisely rather than blaming the balance for
  // an ownership collision (or the reverse).
  if (result.blocked) {
    const fresh = await readFreshState(user._id);
    if ((fresh.cosmetics?.owned || []).includes(sku)) {
      // The losing half of a double click. Nothing was charged for it, and the
      // player owns the item — so this is a success as far as they are
      // concerned, reported the same way a retry is.
      return res.status(200).json({ enabled: true, success: true, duplicate: true, sku, price, ...fresh });
    }
    if ((fresh.stamps ?? 0) < price) {
      return res.status(402).json({ error: 'insufficient_stamps', message: 'Not enough stamps', price, ...fresh });
    }
    return res.status(500).json({ error: 'purchase_failed', message: 'Purchase could not be completed' });
  }

  if (result.duplicate) {
    // Same purchaseKey already charged. This is a RETRY, not an error: return
    // the current state so the client converges on the truth. The original
    // charge already claimed its cap slot, so this attempt's claim goes back.
    await releaseAdFreeSlot();
    const state = await readFreshState(user._id);
    return res.status(200).json({ enabled: true, success: true, duplicate: true, sku, price, ...state });
  }

  if (!result.applied) {
    // Kill switch flipped between the top-of-handler check and here, or an
    // unexpected no-op. Nothing was charged.
    await releaseAdFreeSlot();
    return res.status(500).json({ error: 'purchase_failed', message: 'Purchase could not be completed' });
  }

  if (adFreeDurationMs > 0) {
    // Deliver the pass: additive under concurrency (see the branch above).
    // $$NOW is the server's clock; $ifNull covers a user who has never held a
    // pass. Racing purchases chain — each adds its full duration on top of
    // max(now, current) — so N charges always buy N durations.
    await User.updateOne({ _id: user._id }, [
      { $set: { adFreeUntil: { $add: [{ $max: ['$$NOW', { $ifNull: ['$adFreeUntil', new Date(0)] }] }, adFreeDurationMs] } } }
    ]);
  }

  const state = await readFreshState(user._id);
  clearUserCaches(user);
  // ONE BUY, ONE BUMP, AND ONLY HERE. Not on the duplicate path above (that is a
  // retry landing on a charge already counted) and not on insufficient/failed
  // (nothing was bought). Not awaited — see bumpPurchaseCount.
  bumpPurchaseCount(sku);
  pushCosmeticsToWs(user._id.toString(), {
    nameGlow: state.cosmetics.equipped.nameGlow,
    markerSkin: state.cosmetics.equipped.markerSkin,
    owned: state.cosmetics.owned,
  });

  return res.status(200).json({ enabled: true, success: true, duplicate: false, sku, price, ...state });
}

// ---------------------------------------------------------------------------
// equip
// ---------------------------------------------------------------------------
/**
 * Equip a cosmetic into a slot and/or set the emote bar order. Both are
 * optional; at least one must be present.
 *
 * Ownership is re-checked SERVER-SIDE against the user document. The shop
 * response tells the client what is owned, but the client is not the authority
 * on it.
 */
async function handleEquip(res, user, body) {
  const { slot, sku, emoteOrder } = body;
  const owned = new Set(user.cosmetics?.owned || []);
  const update = {};

  const wantsSlot = slot !== undefined && slot !== null;
  const wantsEmotes = emoteOrder !== undefined && emoteOrder !== null;
  if (!wantsSlot && !wantsEmotes) {
    return res.status(400).json({ error: 'nothing_to_equip', message: 'Provide slot+sku and/or emoteOrder' });
  }

  if (wantsSlot) {
    if (typeof slot !== 'string' || !SLOT_TYPES[slot]) {
      return res.status(400).json({ error: 'invalid_slot', message: `slot must be one of: ${Object.keys(SLOT_TYPES).join(', ')}` });
    }

    if (sku === null || sku === '') {
      // Explicit unequip.
      update[`cosmetics.equipped.${slot}`] = null;
    } else {
      if (typeof sku !== 'string') {
        return res.status(400).json({ error: 'invalid_sku', message: 'sku must be a string, or null to unequip' });
      }
      const item = getItem(sku);
      if (!item) {
        return res.status(400).json({ error: 'unknown_sku', message: 'No such item' });
      }
      // A marker in the glow slot renders nothing at all — the renderers read
      // the slot, so the type has to match it.
      if (item.type !== SLOT_TYPES[slot]) {
        return res.status(400).json({ error: 'wrong_slot', message: `${sku} cannot be equipped in ${slot}` });
      }
      if (!owned.has(sku)) {
        return res.status(403).json({ error: 'not_owned', message: 'You do not own this item' });
      }
      update[`cosmetics.equipped.${slot}`] = sku;
    }
  }

  let normalisedEmotes = null;
  if (wantsEmotes) {
    if (!Array.isArray(emoteOrder)) {
      return res.status(400).json({ error: 'invalid_emote_order', message: 'emoteOrder must be an array' });
    }
    if (emoteOrder.length > MAX_EMOTE_ORDER) {
      return res.status(400).json({ error: 'emote_order_too_long', message: `At most ${MAX_EMOTE_ORDER} emotes` });
    }

    normalisedEmotes = [];
    const seen = new Set();
    for (const entry of emoteOrder) {
      const emote = resolveEmote(entry);
      if (!emote) {
        return res.status(400).json({ error: 'unknown_emote', message: `Unknown emote: ${entry}` });
      }
      // Paid emotes must be owned. An unknown entry never gets here, so this
      // fails closed the same way ws.js's ownsEmote does.
      if (!emote.free && !owned.has(emote.sku)) {
        return res.status(403).json({ error: 'emote_not_owned', message: `You do not own ${emote.id}` });
      }
      // Duplicates would render the same emote twice and shrink the bar.
      if (seen.has(emote.id)) {
        return res.status(400).json({ error: 'duplicate_emote', message: `Duplicate emote: ${emote.id}` });
      }
      seen.add(emote.id);
      normalisedEmotes.push(emote.id);
    }
    update['cosmetics.emoteOrder'] = normalisedEmotes;
  }

  await User.updateOne({ _id: user._id }, { $set: update });

  const state = await readFreshState(user._id);
  clearUserCaches(user);
  pushCosmeticsToWs(user._id.toString(), {
    nameGlow: state.cosmetics.equipped.nameGlow,
    markerSkin: state.cosmetics.equipped.markerSkin,
    owned: state.cosmetics.owned,
  });

  return res.status(200).json({ enabled: true, success: true, ...state });
}
