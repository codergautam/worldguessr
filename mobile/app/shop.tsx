/**
 * Stamps shop — its own screen, opened from the Stamps button that sits beside
 * the league pill on the home header (app/(tabs)/home.tsx). It is NOT reachable
 * from Settings any more: a storefront three taps deep behind a settings list
 * is a storefront nobody opens.
 *
 * Follows the settings.tsx shell verbatim (street2 background + gradient wash,
 * SafeAreaView, close-button header) so it reads as part of the same app rather
 * than a bolted-on store.
 *
 * THINGS THAT ARE DELIBERATE HERE:
 *
 *  - ONE PAGE, NO TABS. Every category is mounted at once, stacked under its
 *    own heading, reached by scrolling — same shape as the web storefront
 *    (components/shop/ShopView.js). There is no selected-category state in this
 *    file: a shop you have to tab around to see the stock of hides four fifths
 *    of its stock. Categories the server sent nothing for are omitted outright,
 *    never rendered as an empty heading.
 *
 *  - THE WALLET AND THE JUMP ROW LIVE OUTSIDE THE SCROLLVIEW. The balance has
 *    to be on screen at the moment of every buy decision, and now that the page
 *    is long the section chips have to be reachable from the bottom of it. Both
 *    sit in the fixed header above the scroller, which is the cheapest possible
 *    "sticky" in React Native — no per-frame work, no onScroll re-render.
 *
 *  - GLOW CARDS PREVIEW LIVE, ON ONE BLACK STAGE. A halo needs somewhere to go:
 *    drawn small, on the card's own translucent green, every hue lands in the
 *    same pale smear and the whole palette looks identical. So each glow gets a
 *    near-black plate washed with the app's own 135deg black -> green-black
 *    gradient, the name set at display size and weight, and enough quiet margin
 *    that the bloom dies inside its own stage. ONE stage, one size, for every
 *    sku — same as web (components/shop/ItemPreview.js).
 *
 *  - EACH FACT IS STATED ONCE, and that rule is what most of the recent
 *    deletions here enforce. The price is the button and is nowhere else. "This
 *    one animates" is one chip on one stage, not a chip plus a band heading plus
 *    a band subtitle. Ownership is the button reading Equip/Equipped, not a
 *    ribbon as well. What a thing IS belongs to the section line at the top of
 *    the shelf, never to a blurb under each tile repeating its own picture.
 *
 *  - The preview renders the user's OWN name through the very same
 *    <PlayerName> the game uses, so what they see before buying is literally
 *    what they get — INCLUDING THE MOTION, now that there is any. The animated
 *    tier used to preview as a still frame and the screen said so, because
 *    `textShadowRadius` is not a native-driver property and there is only ONE
 *    textShadow per Text. NameGlowHalo sidesteps both by stacking fixed
 *    shadows and cross-fading their opacity, so these cards move here exactly
 *    as they do on the site. A sku this build has no colour for still previews
 *    with no glow, because that is exactly what it would render in game.
 *
 *  - THE GLOWS SECTION IS ONE LIST, CHEAPEST FIRST, animated or not — the same
 *    ladder web shows, and the same one shared/shop/catalog.js already sorts
 *    into. It used to run in two bands with their own headings, their own gold
 *    dot and a promoted card size for the animated tier — four ways of saying
 *    one sentence. The chip still says which ones move, and now the cards show
 *    it as well. Web deleted its version of the same band for its own reasons.
 *
 *  - Backgrounds are filtered out SERVER-SIDE for `platform:'mobile'` (the app
 *    bundles its own background asset and never reads /backgrounds/*.webp), so
 *    there is no background section and no background preview. Do not add one
 *    without the server filter changing first.
 *
 *  - One `purchaseKey` per BUTTON PRESS, minted here and held across retries.
 *    api.purchaseCosmetic retries a timeout with the same key and never retries
 *    a 4xx. Never mint a fresh key to retry a failed buy; that is the exact
 *    double-charge the key exists to prevent.
 *
 *  - EVERY SLOT-BACKED SECTION OPENS WITH A DEFAULT CARD (see DefaultCard).
 *    "Wear nothing" is a real choice and it needed a card to live in: without
 *    one, buying a single glow meant wearing a glow forever. It has no price and
 *    no buy button, it always exists, and it sends `sku: null` down the SAME
 *    equip path every other card uses. That makes each section's rule readable:
 *    EXACTLY ONE CARD IS EQUIPPED, ALWAYS — Default when the slot is null, a
 *    real card when the slot holds its sku.
 *
 *  - EMOTES GET A WHEEL, NOT A DEFAULT CARD, exactly as web does. Owning an
 *    emote is enough to fire it; what there is to arrange is the ORDER of the
 *    in-game picker (`cosmetics.emoteOrder`), so a "Default" tile among the
 *    emotes would be a lie. src/components/shop/EmoteWheel.tsx is the control,
 *    and it is web's screen verbatim: tap a cell, pick an emote, and picking
 *    one that already sits in another cell trades the two. Passes are
 *    consumables and still get nothing on either platform.
 *
 *  - THE EMOTE SHELF IS EVERY EMOTE, not every purchasable one. `res.items` is
 *    the price list (twelve); the free eight come from the bundled catalogue and
 *    are cards here too, because you arrange them on your wheel exactly like a
 *    bought one. The server is authoritative for the price and for what you own;
 *    the glyph and the name are static data this bundle already carries.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Pressable } from '../src/components/ui/SfxPressable';
import Animated, { FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { haptics } from '../src/services/haptics';
// formatCompact is the house compact formatter (src/shared/utils/formatTime.ts),
// already on the home header and the map tiles: exact under 1,000, then 1.1K /
// 12K / 343K. Web renders the same field through its own mirror of it
// (components/utils/fmtNumber.js) so the two shops abbreviate identically.
import { colors, formatCompact, t } from '../src/shared';
import { borderRadius, fontSizes, spacing } from '../src/styles/theme';
import { useAuthStore } from '../src/store/authStore';
import { api, ApiError, newPurchaseKey, type ShopItem } from '../src/services/api';
import { resolveMarkerPin, STOCK_PIN_IMAGE } from '../src/shared/cosmetics';
import {
  EMOTE_CATALOG,
  MAX_EMOTE_BAR,
  clearEmoteAt,
  resolveEmoteBar,
  setEmoteAt,
  toEmoteBarIds,
} from '../src/shared/emotes';
import PlayerName from '../src/components/PlayerName';
import EmoteWheel from '../src/components/shop/EmoteWheel';
import EmberGlow from '../src/components/shop/EmberGlow';

type Category = 'glow' | 'emote' | 'pass' | 'marker';

/**
 * Section order. Web's order verbatim (components/shop/stampShopClient.js) with
 * `background` dropped, because backgrounds never reach this client — the same
 * shop in the same order on both platforms, which is the whole point of a
 * parity surface.
 */
const CATEGORY_ORDER: Category[] = ['glow', 'marker', 'emote', 'pass'];

/** Which equip slot a category writes, or null for items that are not equipped. */
const SLOT_FOR_CATEGORY: Record<Category, 'nameGlow' | 'markerSkin' | null> = {
  glow: 'nameGlow',
  marker: 'markerSkin',
  // Emotes write an ARRANGEMENT (cosmetics.emoteOrder), not a slot — see
  // EmoteWheel. Owning one is what lets you put it on the wheel; the wheel is
  // what the in-game picker renders.
  emote: null,
  pass: null, // consumed on purchase
};

/**
 * A shop card, as this screen renders one.
 *
 * `sku: null` is a FREE EMOTE: it is on the shelf and it goes in your bar, but
 * there is nothing to buy, so it never reaches a price or a purchase path. The
 * `emoteId` is what the bar is written from — a free emote has no sku to key on.
 */
// Omit, not intersect: `ShopItem & { sku: string | null }` narrows sku to
// `string` (the intersection of the two), which is the opposite of the point.
type ShelfItem = Omit<ShopItem, 'sku'> & {
  sku: string | null;
  emoteId?: string;
  glyph?: string;
  /** The catalogue's effect id — 'ember' on the skull, absent on everything else. */
  fx?: string | null;
  freeEmote?: boolean;
};

/** Signed-out visitors still get to see a glow on something name-shaped. */
const SAMPLE_NAME = 'WorldGuessr';

/**
 * The figure at which a buy count stops being printed exactly and starts being
 * abbreviated by formatCompact (1.1K, 12K, 343K). It is that helper's own
 * threshold, restated here because it is ALSO the ceiling on the optimistic +1
 * below, and the two have to be the same number.
 *
 * WHY THE OPTIMISTIC BUMP STOPS HERE. Under it, every single buy is a visible
 * digit, so a count that sat still while you bought the thing would read as
 * broken. At or above it a +1 moves no pixel, and it could only round a label
 * across a line the server has not crossed yet.
 *
 * IT ONLY HAS TO COVER THIS SCREEN'S LIFETIME. The server drops its own count
 * cache on the write (api/stampShop.js), so the next catalogue load reads the
 * real figure — this bump exists because nothing refetches after a buy, not
 * because the server's number is allowed to lag.
 *
 * Web does the identical thing to the identical field: see BUY_COUNT_EXACT_MAX
 * and withOptimisticBuy in components/shop/stampShopClient.js.
 */
const BUY_COUNT_EXACT_MAX = 1000;

/**
 * The catalogue with ONE sku's buy count raised by one.
 *
 * Returns the SAME array when there is nothing to move, so a purchase of an
 * already-abbreviated item does not rebuild the shelf for no reason.
 */
function bumpBuyCount(items: ShopItem[], sku: string): ShopItem[] {
  let changed = false;
  const next = items.map((item) => {
    if (item.sku !== sku) return item;
    const count = item.purchases;
    if (typeof count !== 'number' || !isFinite(count) || count >= BUY_COUNT_EXACT_MAX) return item;
    changed = true;
    return { ...item, purchases: count + 1 };
  });
  return changed ? next : items;
}

/**
 * THE LINE UNDER THE NAME. It says one of two things and it always says one of
 * them — same slot, same two rules, same wording as web's .shopCard__buys (see
 * the subline comment in components/shop/ShopView.js).
 *
 *   "Default"     for anything nobody paid for: a free emote (no sku, on the
 *                 shelf, already yours). Without this the stock eight were the
 *                 only cards in the shop that said nothing at all about where
 *                 they came from — a glyph, a name and a button, with no hint
 *                 that everybody already has one.
 *   "N buys"      for every sku, INCLUDING ZERO (owner ruling, 2026-08-08).
 *
 * ZERO USED TO HIDE, on the argument that "0 buys" is a sentence about emptiness
 * printed on the one item somebody is still deciding whether to want. What that
 * actually bought was a shelf where some cards had a subline and some did not
 * for a reason invisible from the outside, and a missing number reads as missing
 * DATA rather than as none.
 *
 * formatCompact(undefined) is '0' (it short-circuits on falsy), so a count an
 * older API never sent renders identically to a real nought — which is what it
 * means.
 */
function BuyCount({ item }: { item: ShelfItem }) {
  return (
    <Text style={styles.cardNote} numberOfLines={1}>
      {item.freeEmote
        ? t('shopDefaultName')
        : t('shopBuys', { n: formatCompact(item.purchases ?? 0) })}
    </Text>
  );
}

export default function ShopScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const secret = useAuthStore((s) => s.secret);
  const user = useAuthStore((s) => s.user);
  const applyCosmetics = useAuthStore((s) => s.applyCosmetics);

  const [items, setItems] = useState<ShopItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** sku currently in flight — disables just that card, not the whole page. */
  const [busySku, setBusySku] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // (`landedAt` lived here. It existed for ONE job: telling the wheel to close a
  // picker panel that was still pointing at a cell a purchase had just moved.
  // The panel is deleted, so the signal has nothing left to say — the wheel
  // diffs its own cells and animates whatever changed without being told, and
  // the scroll-back-to-the-wheel after a buy is done directly below.)

  const stamps = user?.stamps ?? 0;
  const ownedList = user?.cosmetics?.owned;
  const owned = useMemo(() => new Set(ownedList ?? []), [ownedList]);
  const equipped = user?.cosmetics?.equipped ?? {};
  const emoteOrder = user?.cosmetics?.emoteOrder;
  const previewName = user?.username || SAMPLE_NAME;

  /**
   * The entitlement block off any shop response, in the shape applyCosmetics
   * takes.
   *
   * ONE READER FOR ALL THREE CALL SITES, and it reads `res.cosmetics` — which is
   * where the server has always put owned/equipped/emoteOrder (entitlementFields
   * in api/stampShop.js). The three call sites below each used to read
   * `res.owned` and `res.equipped` off the TOP level, which is `undefined` on
   * every response, so every guard failed silently and a purchase never updated
   * the local inventory: you bought an emote and the card went on showing its
   * price until the app refetched the account.
   */
  const entitlementPatch = useCallback((res: {
    stamps?: number;
    cosmetics?: { owned?: string[]; equipped?: any; emoteOrder?: string[] };
    adFreeUntil?: string | null;
    stampsEnabled?: boolean;
    enabled?: boolean;
  }) => ({
    ...(typeof res.stamps === 'number' ? { stamps: res.stamps } : {}),
    ...(Array.isArray(res.cosmetics?.owned) ? { owned: res.cosmetics!.owned } : {}),
    ...(res.cosmetics?.equipped ? { equipped: res.cosmetics.equipped } : {}),
    ...(Array.isArray(res.cosmetics?.emoteOrder) ? { emoteOrder: res.cosmetics!.emoteOrder } : {}),
    ...(res.adFreeUntil !== undefined ? { adFreeUntil: res.adFreeUntil } : {}),
    ...(typeof res.stampsEnabled === 'boolean' ? { stampsEnabled: res.stampsEnabled } : {}),
  }), []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.getShopCatalog(secret);
      setItems(Array.isArray(res.items) ? res.items : []);
      // The catalogue call doubles as a balance read when it carries a token —
      // one round trip, and it keeps the wallet honest if a purchase landed on
      // another device since this session started.
      if (secret) {
        applyCosmetics({
          ...entitlementPatch(res),
          // The catalogue names the kill switch `enabled`; every other response
          // calls it stampsEnabled.
          ...(typeof res.enabled === 'boolean' ? { stampsEnabled: res.enabled } : {}),
        });
      }
    } catch (err: any) {
      setLoadError(err?.message ?? t('errorNetworkRequest'));
    } finally {
      setLoading(false);
    }
  }, [secret, applyCosmetics, entitlementPatch]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * The page, in render order. Empty categories are dropped entirely rather
   * than shown as an empty heading: a section that says "nothing here" is a
   * dead end the server already told us about, and on one long page it is four
   * lines of nothing to scroll past.
   */
  const sections = useMemo(() => {
    const byType = new Map<Category, ShelfItem[]>();
    (items ?? []).forEach((item) => {
      const type = item.type as Category;
      // Anything this build has no section for is dropped rather than rendered
      // into a heading that does not exist (backgrounds are already filtered
      // server-side; a future category would arrive here first).
      if (!CATEGORY_ORDER.includes(type)) return;
      // Emotes are rebuilt wholesale below, off the full table. Dropping the
      // price-list copies here is what stops each paid emote getting two cards.
      if (type === 'emote') return;
      const list = byType.get(type);
      if (list) list.push(item);
      else byType.set(type, [item]);
    });

    /* THE EMOTE SHELF IS EVERY EMOTE. `items` is the PRICE LIST, so it holds
       the twelve you can buy and nothing else — which meant the eight you
       already have had no card and could not be moved in or out of the bar.
       Identity (glyph, name) comes from the BUNDLED catalogue this app already
       renders its picker from; the server is authoritative for the price and
       for what you own, and that is what is crossed in here. Web builds the
       identical list the identical way. */
    if (items?.length) {
      const paidBySku = new Map(items.filter((i) => i.type === 'emote').map((i) => [i.sku, i]));
      byType.set('emote', EMOTE_CATALOG
        // A paid emote with no price row was filtered out server-side (disabled,
        // out of window) and must not appear as a card with no way to buy it. It
        // DOES stay if you already own it — a sale ending must not take your
        // emote out of your own shop.
        .filter((emote) => emote.free || paidBySku.has(emote.sku!) || owned.has(emote.sku!))
        .map((emote) => {
          const paid = emote.sku ? paidBySku.get(emote.sku) : undefined;
          return {
            ...(paid ?? { sku: emote.sku ?? null, type: 'emote' as const, price: 0, platforms: ['mobile'] }),
            name: paid?.name || emote.name,
            emoteId: emote.id,
            glyph: emote.glyph,
            // The effect id, off the bundled catalogue like the glyph and for
            // the same reason: what an emote LOOKS like is static data this
            // bundle already carries, and reading it off the wire would only buy
            // a deploy-skew window where the shop sells a plain skull.
            fx: emote.fx ?? null,
            freeEmote: !emote.sku,
          } as ShelfItem;
        }));
    }

    return CATEGORY_ORDER.filter((c) => (byType.get(c)?.length ?? 0) > 0).map((c) => ({
      type: c,
      label: categoryLabel(c),
      items: byType.get(c)!,
    }));
  }, [items, owned]);

  /**
   * The bar as the picker will render it, and the ids to test cards against.
   * Resolved ONCE per render and shared, so the bar widget and the cards can
   * never disagree about whether an emote is in it.
   */
  const bar = useMemo(() => resolveEmoteBar(emoteOrder, ownedList), [emoteOrder, ownedList]);
  const barIds = useMemo(() => bar.map((e) => e.id), [bar]);
  const barIsDefault = (emoteOrder ?? []).length === 0;

  // Jump-to-section. Offsets live in a REF so measuring them never re-renders.
  // The highlight DOES need state, but it is written only when the section
  // actually changes, not on every scroll frame: at 16ms throttle a naive
  // setState would re-render the whole page ~60x/sec, which is exactly the
  // full-grid-rerender pattern that has frozen low-end devices in this app
  // before. The guard below means a full scroll through five sections commits
  // four times total.
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Record<string, number>>({});
  // The emote GRID's offset inside its section. The section starts with the
  // wheel you are standing on, so "Get more" has to aim past it.
  const emoteGridY = useRef(0);
  const [activeSection, setActiveSection] = useState<Category | null>(null);
  const activeRef = useRef<Category | null>(null);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    // A band just under the pinned header, matching the web scroll-spy: the
    // section crossing it is the one being read.
    const probe = y + spacing.xl;
    let current: Category | null = null;
    let bestY = -Infinity;
    for (const [type, top] of Object.entries(sectionY.current)) {
      if (top <= probe && top > bestY) { bestY = top; current = type as Category; }
    }
    // Never blank out: a short final section can sit entirely below the band.
    if (current && current !== activeRef.current) {
      activeRef.current = current;
      setActiveSection(current);
    }
  }, []);

  const jumpTo = useCallback((type: Category) => {
    const y = sectionY.current[type];
    if (typeof y !== 'number') return;
    haptics.selection();
    // Set it immediately so the chip responds on tap rather than waiting for
    // the smooth scroll to settle.
    activeRef.current = type;
    setActiveSection(type);
    scrollRef.current?.scrollTo({ y: Math.max(0, y - spacing.sm), animated: true });
  }, []);

  /* ------------------------------------------------------------------------
   *  THE EMOTE WHEEL — the arrangement the in-game picker renders.
   *
   *  ONE VERB, THE SAME ONE WEB HAS: tap a cell, pick an emote. What that gets
   *  rid of on THIS client is the tap-to-select-then-◀-✕-▶ toolbar, the
   *  card-side add/remove toggle, and both refusals ("bar holds 12", "keep at
   *  least one") — none of which web had in the same form, so the two shops
   *  taught two different mental models for one field.
   *
   *  Web's rules, verbatim, because it is one feature on two clients:
   *    - the seed is the VISIBLE bar (resolveEmoteBar), never the stored array.
   *      The stored array is EMPTY for anyone who has never arranged one, and
   *      empty MEANS the free set, so appending to it wrote a bar exactly one
   *      emote long and threw the rest away.
   *    - setEmoteAt / clearEmoteAt decide replace-vs-swap-vs-append and refuse
   *      the last emote, in src/shared/emotes, so neither client can answer any
   *      of those questions on its own.
   *    - toEmoteBarIds normalises the stock arrangement back to `[]`, so Reset
   *      is a state you can also reach by hand.
   *  Optimistic, then reconciled from the server's block, like every other write
   *  on this screen; a failure puts the previous order back.
   * --------------------------------------------------------------------- */
  const writeEmoteBar = useCallback(
    async (ids: string[], ownedNow?: string[]) => {
      if (!secret || busySku) return;
      setActionError(null);
      setBusySku('emoteOrder');
      const previous = emoteOrder;
      const next = toEmoteBarIds(ids, ownedNow ?? ownedList);
      applyCosmetics({ emoteOrder: next });
      try {
        const res = await api.equipEmoteOrder(secret, next);
        if (Array.isArray(res.cosmetics?.emoteOrder)) {
          applyCosmetics({ emoteOrder: res.cosmetics!.emoteOrder });
        }
      } catch (err: any) {
        applyCosmetics({ emoteOrder: previous ?? [] });
        setActionError(err?.message ?? String(err));
      } finally {
        setBusySku(null);
      }
    },
    [secret, busySku, emoteOrder, ownedList, applyCosmetics],
  );

  /**
   * Put an emote in a cell. Replace, swap or append is setEmoteAt's decision;
   * an unchanged list comes back as the SAME array, which is what stops
   * "pick the emote already in this cell" spending a write.
   *
   * `from` overrides the inventory for one caller only: a purchase, whose fresh
   * ownership has not reached the store yet (see handleBuy).
   */
  const assignEmote = useCallback(
    (index: number, emoteId: string, from?: { bar: string[]; owned: string[] }) => {
      const current = from ? from.bar : barIds;
      const next = setEmoteAt(current, index, emoteId);
      if (next === current) return;
      haptics.light();
      writeEmoteBar(next, from?.owned);
    },
    [barIds, writeEmoteBar],
  );

  /**
   * Take the emote in cell `index` off the wheel — the wheel's ONE verb.
   *
   * clearEmoteAt refuses the last one by returning the list unchanged, and the
   * cell is already disabled in that state, so this needs no message: the
   * refusal is met before the tap rather than reported after it.
   */
  const removeEmoteCell = useCallback(
    (index: number) => {
      const next = clearEmoteAt(barIds, index);
      if (next === barIds) return;
      haptics.light();
      writeEmoteBar(next);
    },
    [barIds, writeEmoteBar],
  );

  /**
   * THE SHELF'S ONE VERB: tap an emote you own, it goes on the wheel; tap it
   * again, it comes off. The whole card is the target (see ShopCard), because
   * the thing you are pointing at IS the emote.
   *
   * THIS IS THE PICKER PANEL'S REPLACEMENT, and it is web's handler verbatim
   * (toggleEmote in components/shop/ShopView.js). Adding used to mean tapping a
   * ＋ on an empty cell to open a second grid of the same faces already on
   * screen below, then finding the face again in that grid.
   *
   * BOTH REFUSALS COME BACK AS THE SAME ARRAY, from shared/emotes — a full wheel
   * from setEmoteAt, the last emote from clearEmoteAt — so the only thing left
   * to decide here is which sentence to show.
   */
  const toggleEmote = useCallback(
    (item: ShelfItem) => {
      const id = item.emoteId;
      if (!id || busySku) return;
      const at = barIds.indexOf(id);
      const next = at >= 0 ? clearEmoteAt(barIds, at) : setEmoteAt(barIds, barIds.length, id);
      if (next === barIds) {
        haptics.warning();
        setActionError(
          at >= 0
            ? t('shopEmoteSlotClearLast', undefined, 'Keep at least one emote on your wheel')
            : t('shopEmoteWheelFull', { count: MAX_EMOTE_BAR }, `Your wheel is full at ${MAX_EMOTE_BAR}. Take one off first.`),
        );
        return;
      }
      haptics.light();
      setActionError(null);
      // NO SCROLL BACK TO THE WHEEL, deliberately. A purchase pulls the wheel
      // into view because it is a single event you want to watch land; adding is
      // something people do three or four times in a row, and yanking the list
      // up each time would take the shelf out from under the thumb still using
      // it. The feedback is local: the card's own frame and label change.
      writeEmoteBar(next);
    },
    [barIds, busySku, writeEmoteBar],
  );

  /** Back to the stock arrangement. `[]` is what the server reads as default. */
  const resetEmoteBar = useCallback(() => {
    if (barIsDefault) return;
    haptics.selection();
    writeEmoteBar([]);
  }, [barIsDefault, writeEmoteBar]);

  /** The picker's last tile: leave the wheel and go look at what is for sale. */
  const scrollToEmoteShelf = useCallback(() => {
    scrollRef.current?.scrollTo({
      y: Math.max(0, (sectionY.current.emote ?? 0) + emoteGridY.current - spacing.sm),
      animated: true,
    });
  }, []);

  const handleBuy = useCallback(
    async (item: ShelfItem) => {
      // A free emote has no sku and nothing to charge for; it can never reach a
      // buy button, and this is the belt to those braces.
      if (!secret || busySku || !item.sku) return;
      haptics.light();
      setActionError(null);
      setBusySku(item.sku);
      // ONE key per press, reused by the retry inside purchaseCosmetic.
      const purchaseKey = newPurchaseKey();
      // A BOUGHT EMOTE GOES STRAIGHT ON THE WHEEL, and this holds the details of
      // where until the buy is finished with its busy flag. Running the
      // arrangement write inside the try below would have `finally` clear the
      // busy key out from under it mid-flight.
      let landing: { index: number; id: string; bar: string[]; owned: string[] } | null = null;
      try {
        const res = await api.purchaseCosmetic(secret, item.sku, purchaseKey);
        // THE WHOLE BLOCK, READ FROM res.cosmetics WHERE THE SERVER PUTS IT.
        // This is also THE AD-FREE FRESHNESS FIX: services/ads.ts reads
        // adFreeUntil out of this store on every interstitial check, and that
        // field otherwise only moves on an auth refetch — so a pass bought
        // mid-session would not suppress the very next ad.
        applyCosmetics(entitlementPatch(res));
        // The buy count on that one card, moved on the spot.
        //
        // NOT ON A DUPLICATE. `duplicate: true` is purchaseCosmetic's same-key
        // retry landing on a charge that already went through, and the server
        // counted it the first time — bumping here would show one purchase as
        // two. Nothing is refetched: `load()` would cost a round trip to move a
        // number by one, and the server's copy is cached for five minutes anyway.
        if (!res.duplicate) {
          setItems((prev) => (prev ? bumpBuyCount(prev, item.sku!) : prev));
        }
        haptics.success();

        // OFF THE SERVER'S BLOCK, NOT OFF THE STORE. applyCosmetics above has
        // not re-rendered us yet, so `ownedList` in this closure still says we
        // do not own what we just paid for — and toEmoteBarIds would drop it.
        if (item.type === 'emote' && item.emoteId) {
          const freshOwned = Array.isArray(res.cosmetics?.owned)
            ? res.cosmetics!.owned!
            : (ownedList ?? []);
          const freshBar = resolveEmoteBar(
            res.cosmetics?.emoteOrder ?? emoteOrder,
            freshOwned,
          ).map((e) => e.id);
          landing = {
            // Into the first empty cell, so the common case takes nothing away
            // from you. Only a FULL wheel replaces, and it replaces the last
            // cell — one tap on it to change your mind either way.
            index: freshBar.length >= MAX_EMOTE_BAR ? MAX_EMOTE_BAR - 1 : freshBar.length,
            id: item.emoteId,
            bar: freshBar,
            owned: freshOwned,
          };
        }
      } catch (err: any) {
        // ApiError = the server decided (insufficient stamps, already owned,
        // unknown sku). Surface its message; do NOT offer a retry that would
        // mint a new key.
        setActionError(err?.message ?? String(err));
        if (!(err instanceof ApiError)) {
          // Ambiguous outcome after the one same-key retry already failed:
          // re-read the balance so the wallet cannot show a stale number if the
          // debit actually landed.
          load();
        }
      } finally {
        setBusySku(null);
      }

      // The wheel is above the shelf and the shelf is long, so bring it back on
      // screen: a landing nobody sees is the same as no landing at all.
      if (landing) {
        scrollRef.current?.scrollTo({
          y: Math.max(0, (sectionY.current.emote ?? 0) - spacing.sm),
          animated: true,
        });
        assignEmote(landing.index, landing.id, { bar: landing.bar, owned: landing.owned });
      }
    },
    [secret, busySku, ownedList, emoteOrder, applyCosmetics, entitlementPatch, load, assignEmote],
  );

  /**
   * Write one slot. THE ONLY EQUIP PATH ON THIS SCREEN.
   *
   * It takes a SLOT AND A TARGET SKU rather than an item, because "wear
   * nothing" is a real choice and there is no item for it — the Default card
   * calls this with `null` and the server (api/stampShop.js) reads that as an
   * explicit unequip. Same shape as the web hook's `equip(type, sku, busyKey)`,
   * deliberately, so the two clients stay one feature.
   *
   * `busyKey` is separate from `sku` for exactly that reason: an unequip has no
   * sku to lock a button on, so the Default card passes `slot:<slot>` and locks
   * itself. Web uses the identical string.
   */
  const handleEquip = useCallback(
    async (
      slot: 'nameGlow' | 'markerSkin' | null,
      sku: string | null,
      busyKey: string,
    ) => {
      if (!secret || !slot || busySku) return;
      haptics.selection();
      setActionError(null);
      setBusySku(busyKey);
      // Optimistic: equipping is cheap, reversible and has no currency effect,
      // so the preview and the roster update instantly and the server response
      // reconciles. A failure restores the previous slot value explicitly.
      const previous = (equipped as any)[slot] ?? null;
      applyCosmetics({ equipped: { [slot]: sku } });
      try {
        const res = await api.equipCosmetic(secret, slot, sku);
        // res.cosmetics.equipped, not res.equipped: the latter has never
        // existed, so this reconcile was a silent no-op and the optimistic
        // write was the only thing holding the state up.
        if (res.cosmetics?.equipped) applyCosmetics({ equipped: res.cosmetics.equipped });
      } catch (err: any) {
        applyCosmetics({ equipped: { [slot]: previous } });
        setActionError(err?.message ?? String(err));
      } finally {
        setBusySku(null);
      }
    },
    [secret, busySku, equipped, applyCosmetics],
  );

  /** A real card's press: equip its sku, or clear the slot if it is already on. */
  const equipItem = useCallback(
    (item: ShelfItem, unequip: boolean) => {
      if (!item.sku) return;
      handleEquip(
        SLOT_FOR_CATEGORY[item.type as Category],
        unequip ? null : item.sku,
        item.sku,
      );
    },
    [handleEquip],
  );

  /**
   * The Default card's press: clear the slot. The busy key is `slot:<slot>` —
   * an unequip has no sku to lock a button on, and web's slotBusyKey() stamps
   * the identical string for the identical reason.
   */
  const equipDefault = useCallback(
    (slot: 'nameGlow' | 'markerSkin') => {
      // Already the baseline. The button is disabled in that state; this is the
      // belt to its braces, so a stray press can never spend a write saying
      // "null" to a slot that is already null. Web guards the same way.
      if (!(equipped as any)[slot]) return;
      handleEquip(slot, null, `slot:${slot}`);
    },
    [handleEquip, equipped],
  );

  return (
    <View style={styles.root}>
      <ImageBackground
        source={require('../assets/street2.jpg')}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['rgba(0, 30, 15, 0.62)', 'rgba(6, 18, 11, 0.86)', 'rgba(0, 0, 0, 0.92)']}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
      </ImageBackground>

      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <Animated.View
          entering={FadeIn.duration(320).reduceMotion(ReduceMotion.Never)}
          style={styles.header}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel={t('close')}
          >
            <Ionicons name="close" size={26} color={colors.white} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('shop')}</Text>
          {/* Wallet. Outside the scroller, so the balance is on screen at the
              moment of every buy decision no matter how far down the page. */}
          <View
            style={styles.wallet}
            accessible
            accessibilityLabel={t('shopStampsBalance', { count: stamps })}
          >
            {/* The minted seal — the one currency mark, shared with the home
                header and with the web build's SVG path. */}
            <Ionicons name="disc" size={15} color="#FDE047" />
            <Text style={styles.walletValue}>{stamps.toLocaleString()}</Text>
          </View>
        </Animated.View>

        {/* Jump row — pinned with the wallet, not scrolled with the content. */}
        {sections.length > 1 && (
          <View style={styles.jumpBar}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.jumpRow}
              accessibilityLabel={t('shopJumpTo')}
            >
              {sections.map((section) => (
                <Pressable
                  key={section.type}
                  onPress={() => jumpTo(section.type)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: activeSection === section.type }}
                  style={({ pressed }) => [
                    styles.jumpChip,
                    activeSection === section.type && styles.jumpChipActive,
                    pressed && styles.jumpChipPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.jumpChipText,
                      activeSection === section.type && styles.jumpChipTextActive,
                    ]}
                  >
                    {section.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + spacing['3xl'] },
          ]}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          // 16ms delivers the event at frame rate; the handler itself only
          // commits when the section changes, so this is cheap.
          scrollEventThrottle={16}
        >
          {!secret ? (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                {t('shopSignInRequired')}
              </Text>
            </View>
          ) : null}

          {actionError ? (
            <View style={[styles.notice, styles.noticeError]}>
              <Text style={styles.noticeText}>{actionError}</Text>
            </View>
          ) : null}

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.white} />
            </View>
          ) : loadError ? (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>{loadError}</Text>
              <Pressable onPress={load} style={styles.retryBtn}>
                <Text style={styles.retryText}>{t('retry')}</Text>
              </Pressable>
            </View>
          ) : sections.length === 0 ? (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                {t('shopEmpty')}
              </Text>
            </View>
          ) : (
            sections.map((section, sectionIndex) => {
              // The slot this section writes, or null for emotes and passes —
              // which is exactly the test for "does this section have a
              // baseline to go back to".
              const sectionSlot = SLOT_FOR_CATEGORY[section.type];
              const defaultBusyKey = sectionSlot ? `slot:${sectionSlot}` : '';
              return (
                <Animated.View
                  key={section.type}
                  // The entrance rides the SECTION, not the cards. ~45 cards each
                  // playing their own delayed slide is the "fly-in parade" this
                  // app does not do, and on a low-end phone it is 45 animations
                  // competing with the first scroll.
                  entering={FadeInDown.duration(340)
                    .delay(Math.min(sectionIndex, 3) * 60)
                    .reduceMotion(ReduceMotion.Never)}
                  style={styles.section}
                  onLayout={(e) => {
                    sectionY.current[section.type] = e.nativeEvent.layout.y;
                  }}
                >
                  {/* Heading, then one line of what-this-is. The count pill that
                      used to sit beside the title is gone on both platforms: the
                      count is the grid directly underneath it. The line that
                      replaced it earns its space, because a swatch cannot tell a
                      first-time buyer that a glow follows their name into a
                      duel. Same copy as web (CATEGORY_DESC_KEY), except glows,
                      where this platform has one more honest thing to say. */}
                  <View style={styles.sectionHead}>
                    <Text style={styles.sectionTitle}>{section.label}</Text>
                    <Text style={styles.sectionDesc}>{categoryDesc(section.type)}</Text>
                  </View>

                  {section.type === 'glow' ? (
                    <GlowSection
                      items={section.items}
                      previewName={previewName}
                      ownedSkus={owned}
                      equippedSku={equipped.nameGlow ?? null}
                      stamps={stamps}
                      busySku={busySku}
                      locked={!secret}
                      onBuy={handleBuy}
                      onEquip={equipItem}
                      onEquipDefault={equipDefault}
                    />
                  ) : (
                    <>
                    {/* THE WHEEL SITS ABOVE THE SHELF, in the one section it
                        means anything in — it is the in-game picker, drawn as
                        the game draws it, and the cards below are what you can
                        put in it. Signed-out visitors browse the shelf without
                        one; there is no account to arrange. */}
                    {section.type === 'emote' && secret ? (
                      <EmoteWheel
                        bar={bar}
                        isDefault={barIsDefault}
                        busy={busySku === 'emoteOrder'}
                        onRemove={removeEmoteCell}
                        onReset={resetEmoteBar}
                        // An empty cell is a signpost to the shelf, not a
                        // picker: the roster it used to open is the grid
                        // immediately below it.
                        onAddMore={scrollToEmoteShelf}
                      />
                    ) : null}
                    <View
                      style={styles.grid}
                      // The GRID's offset inside its section, so the wheel's
                      // "Get more" tile has somewhere exact to send you. Only
                      // the emote shelf is ever asked for.
                      onLayout={section.type === 'emote'
                        ? (e) => { emoteGridY.current = e.nativeEvent.layout.y; }
                        : undefined}
                    >
                      {/* FIRST IN THE SECTION, AND THE PRICE LADDER IS UNTOUCHED:
                          rendered as a SIBLING ahead of the map, never spliced
                          into the sorted list, so no comparator has to be taught
                          about an item with no price. Only slot-backed categories
                          have a baseline to go back to — emotes are an
                          arrangement and passes are consumed, so neither gets
                          one. */}
                      {sectionSlot ? (
                        <DefaultCard
                          kind={section.type}
                          previewName={previewName}
                          equipped={!(equipped as any)[sectionSlot]}
                          busy={busySku === defaultBusyKey}
                          disabled={!secret || (!!busySku && busySku !== defaultBusyKey)}
                          onEquip={() => equipDefault(sectionSlot)}
                        />
                      ) : null}
                      {section.items.map((item) => {
                        // A free emote has NO sku (there is nothing to buy), so
                        // the key and the busy key are its emote id, and it is
                        // owned by definition — routing it through the owned set
                        // would test `undefined` and put a price on something
                        // everybody already has.
                        const key = item.sku ?? `emote:${item.emoteId}`;
                        return (
                          <ShopCard
                            key={key}
                            item={item}
                            owned={!!item.freeEmote || (!!item.sku && owned.has(item.sku))}
                            equipped={
                              SLOT_FOR_CATEGORY[item.type as Category]
                                ? (equipped as any)[SLOT_FOR_CATEGORY[item.type as Category]!] === item.sku
                                : false
                            }
                            inBar={!!item.emoteId && barIds.includes(item.emoteId)}
                            affordable={stamps >= item.price}
                            busy={busySku === key || busySku === item.emoteId}
                            disabled={!secret || (!!busySku && busySku !== key && busySku !== item.emoteId)}
                            onBuy={() => handleBuy(item)}
                            onEquip={(unequip) => equipItem(item, unequip)}
                            onToggleEmote={() => toggleEmote(item)}
                          />
                        );
                      })}
                    </View>
                    </>
                  )}
                </Animated.View>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function categoryLabel(c: Category): string {
  switch (c) {
    case 'glow':
      return t('shopCategoryGlows');
    case 'emote':
      return t('shopCategoryEmotes');
    case 'marker':
      return t('shopCategoryPins');
    case 'pass':
      return t('shopCategoryPasses');
  }
}

/**
 * One line under each heading saying what this kind of thing IS and where it
 * turns up in game. Web renders the same five strings from the same keys
 * (components/shop/stampShopClient.js CATEGORY_DESC_KEY).
 *
 * IT IS NOT THE PER-ITEM BLURB COMING BACK. A card's blurb described the swatch
 * printed directly above it; this says the thing no swatch can, once per shelf,
 * for somebody who has never owned one.
 *
 * GLOWS NO LONGER GET A PLATFORM SENTENCE. They had one for as long as this
 * app rendered the animated tier as a still glow; it says the same thing web
 * says now, because the two platforms finally do the same thing. What is left
 * of the old band structure — an "Animated" heading, a gold dot, a subtitle
 * repeating it and a gold frame on every card — is the one word on one chip.
 */
function categoryDesc(c: Category): string {
  switch (c) {
    // WEB'S LINE, WORD FOR WORD, and the mobile-specific one it replaced —
    // "The animated ones move on the web version." — is deleted along with the
    // key `shopCategoryGlowsDescMobile`. That sentence was true for exactly as
    // long as this platform could not animate a text shadow. It can now
    // (src/components/NameGlowHalo.tsx), so the sentence had become a
    // promise pointed at the wrong product: it told a buyer the thing they were
    // about to pay 3,000 Stamps for happens somewhere else.
    case 'glow':
      return t(
        'shopCategoryGlowsDesc',
        undefined,
        'A coloured halo on your name, everywhere it shows up in game.',
      );
    // WEB'S LINE, WORD FOR WORD, and the platform-specific one it replaces is
    // deleted. That line existed because this app had no bar to arrange and no
    // way to send an emoteOrder, so copy about a bar would have described a
    // control the screen did not have. It has one now, and it behaves
    // identically, so the two platforms say the same sentence.
    case 'emote':
      return t(
        'shopCategoryEmotesDesc',
        undefined,
        'React mid duel. Your bar is what comes up in game, and you decide what goes in it.',
      );
    case 'marker':
      return t(
        'shopCategoryPinsDesc',
        undefined,
        "The marker that drops where you guess, on your map and everyone else's.",
      );
    // Also platform-specific: there are no banner ads in the app, only AdMob
    // interstitials, so a pass is worth materially less here than on web and the
    // line says exactly what it removes.
    case 'pass':
      return t(
        'shopCategoryPassesDescMobile',
        undefined,
        'No full-screen ads for a stretch of play. Buy one whenever you need a clean run.',
      );
  }
}

/**
 * Buy / Equip / Equipped — the one action a card ever offers, so both card
 * shapes below get an identical control instead of two copies that drift.
 */
function CardAction({
  item,
  owned,
  equipped,
  inBar,
  affordable,
  busy,
  disabled,
  onBuy,
  onEquip,
}: {
  item: ShelfItem;
  owned: boolean;
  equipped: boolean;
  inBar?: boolean;
  affordable: boolean;
  busy: boolean;
  disabled: boolean;
  onBuy: () => void;
  onEquip: (unequip: boolean) => void;
}) {
  const slot = SLOT_FOR_CATEGORY[item.type as Category];

  if (owned) {
    // AN OWNED EMOTE'S PLATE IS A SIGN, NOT A CONTROL. The press belongs to the
    // whole card (see ShopCard), so this is a plain View: one tap target per
    // card, and a nested pressable inside it would be a second one fighting the
    // first for the same gesture. Web does exactly this — a stretched hit
    // button with an aria-hidden pill drawn over it.
    //
    // It used to read "Owned" and say nothing about the wheel, back when the
    // wheel's picker panel owned adding. Now it is the state and the invitation:
    // ＋ Add when it is off, a tick when it is on.
    if (item.type === 'emote') {
      return (
        <View style={[styles.actionBtn, inBar ? styles.actionBtnOnWheel : styles.actionBtnAdd]}>
          {busy ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text
              style={[styles.actionText, inBar && styles.actionTextOnWheel]}
              numberOfLines={1}
            >
              {inBar
                ? `✓ ${t('shopEmoteOnWheel', undefined, 'On your wheel')}`
                : `＋ ${t('shopEmoteAdd', undefined, 'Add to wheel')}`}
            </Text>
          )}
        </View>
      );
    }
    // A pass: bought, consumed, nothing to arrange.
    if (!slot) {
      return (
        <View style={[styles.actionBtn, styles.actionBtnOwned]}>
          <Text style={styles.actionText}>{t('shopOwned')}</Text>
        </View>
      );
    }
    return (
      <Pressable
        onPress={() => onEquip(equipped)}
        disabled={disabled || busy}
        style={({ pressed }) => [
          styles.actionBtn,
          equipped ? styles.actionBtnEquipped : styles.actionBtnOwned,
          (disabled || busy) && styles.actionBtnDisabled,
          pressed && styles.actionBtnPressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : (
          <Text style={styles.actionText}>
            {equipped ? t('shopEquipped') : t('shopEquip')}
          </Text>
        )}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onBuy}
      // In-flight lockout. Every press mints its own idempotency key, so two
      // presses would be two DIFFERENT keys and therefore two real charges.
      disabled={disabled || busy || !affordable}
      style={({ pressed }) => [
        styles.actionBtn,
        styles.actionBtnBuy,
        (disabled || busy || !affordable) && styles.actionBtnDisabled,
        pressed && styles.actionBtnPressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.white} />
      ) : (
        <>
          <Ionicons name="disc" size={14} color="#FDE047" />
          <Text style={styles.actionText}>{item.price.toLocaleString()}</Text>
        </>
      )}
    </Pressable>
  );
}

/**
 * The Glows section: ONE LIST, one card size, animated skus first.
 *
 * IT WAS TWO BANDS AND IT IS NOT ANY MORE — the same deletion web just made
 * (components/shop/ItemPreview.js). The animated tier used to be promoted into
 * a band with its own heading, a gold dot, a subtitle, a bigger plate, a bigger
 * name, a wider halo and a gold frame. That is seven mechanisms, and on THIS
 * platform they were selling motion the app cannot render at all. What is left
 * says it once, in words, where words are the only honest way to say it: the
 * section line above (see categoryDesc) plus one small chip per animated card.
 *
 * CHEAPEST FIRST, WHOLE SHELF, ANIMATED OR NOT. The catalogue already ships them
 * in exactly this order (shared/shop/catalog.js merges the static and animated
 * arrays into one ascending sort) and the server hands the list over untouched
 * — but this screen renders whatever arrives, including from an older server
 * that still leads with the animated tier, or one with a `sortOrder` override in
 * play. A shelf the shopper can read top to bottom is worth one comparator.
 */
function GlowSection({
  items,
  previewName,
  ownedSkus,
  equippedSku,
  stamps,
  busySku,
  locked,
  onBuy,
  onEquip,
  onEquipDefault,
}: {
  items: ShelfItem[];
  previewName: string;
  ownedSkus: Set<string>;
  equippedSku: string | null;
  stamps: number;
  busySku: string | null;
  locked: boolean;
  onBuy: (item: ShelfItem) => void;
  onEquip: (item: ShelfItem, unequip: boolean) => void;
  onEquipDefault: (slot: 'nameGlow' | 'markerSkin') => void;
}) {
  // A COPY, then sorted: sorting `items` in place would reorder the caller's
  // memoised `sections` array. The sku filter is what proves to the compiler
  // (and to a reader) that this shelf only ever holds things you can BUY — a
  // null sku means a free emote, and there is no such thing as a free glow.
  const ordered = [...items]
    .filter((i): i is ShelfItem & { sku: string } => !!i.sku)
    .sort((a, b) => a.price - b.price);

  return (
    <View style={styles.glowList}>
      {/* THE BASELINE, FIRST AND IN THE SAME LIST. It is what the section looks
          like with nothing bought and the only way back once something has been.
          Rendered as a sibling ahead of the sort, never spliced into it, so no
          comparator has to be taught about an item with no price. */}
      <DefaultCard
        kind="glow"
        previewName={previewName}
        equipped={!equippedSku}
        busy={busySku === 'slot:nameGlow'}
        disabled={locked || !!busySku}
        onEquip={() => onEquipDefault('nameGlow')}
      />

      {ordered.map((item) => (
        <GlowCard
          key={item.sku}
          item={item}
          previewName={previewName}
          owned={ownedSkus.has(item.sku)}
          equipped={equippedSku === item.sku}
          affordable={stamps >= item.price}
          busy={busySku === item.sku}
          disabled={locked || (!!busySku && busySku !== item.sku)}
          onBuy={() => onBuy(item)}
          onEquip={(unequip) => onEquip(item, unequip)}
        />
      ))}
    </View>
  );
}

/**
 * A glow on ONE stage. Black. That is the whole preview.
 *
 * THIS USED TO BE TWO CO-EQUAL PLATES — a near-black rectangle with the name on
 * it and a white rectangle with the name on it, stacked — and then one black
 * stage with the white one welded along its bottom edge as an "on light" swatch.
 * Both are the same mistake, and the web card (components/shop/ItemPreview.js)
 * just deleted the same thing for the same reason: two surfaces side by side is
 * a debug view, and the strip was still spending a third of the card's height
 * saying so.
 *
 * The stage is dressed as the surface a glow actually lives on here — the same
 * 135deg black -> green-black wash this screen already paints behind its own
 * header, over a near-black plate. Nothing invented, and no photograph: a
 * full-bleed image per card is a real cost on the phones this app has to stay
 * smooth on, and the wash is the recognisable part anyway.
 *
 * THE LIGHT COLOURS ARE NOT DELETED, ONLY THE LIGHT STAGE IS. Every sku still
 * carries a light hue in src/shared/cosmetics.ts and <PlayerName onLight> still
 * uses it wherever the app draws a name on white — PlayerList's between-rounds
 * cards above all. This screen simply stopped previewing that surface. Do not
 * strip `onLight` out of cosmetics.ts on the strength of this file not calling
 * it.
 *
 * Full-width by default (two-up only where there is genuinely room) because the
 * name has to be legible at display size — a 22px name squeezed into a half
 * card truncates, and a truncated name wearing a halo is not a preview of
 * anything.
 *
 * ONE CARD SIZE. The animated skus used to get a taller stage, a bigger name, a
 * wider halo and a gold frame, on the theory that the expensive tier deserves
 * more room. It bought nothing then (a bigger still frame is a bigger still
 * frame) and it buys nothing now that the cards move: motion is the thing that
 * separates them, and motion does not need a larger box to be seen in.
 *
 * THE STAGE'S CLEARANCE IS WHY THE LAYER TABLE IS CAPPED. 88px tall, 14px of
 * vertical padding around a 32px line box, and `overflow: 'hidden'` — so ~28px
 * of room on each side. Every radius in src/shared/glowKeyframes.ts is under
 * that (the widest is the prism's 22px bloom), which is what keeps these
 * previews from shearing at the stage edge. Raise one and check the other.
 */
function GlowCard({
  item,
  previewName,
  owned,
  equipped,
  affordable,
  busy,
  disabled,
  onBuy,
  onEquip,
}: {
  // Glows are always purchasable, so the sku is always there — GlowSection
  // filters on it before this card ever sees an item.
  item: ShelfItem & { sku: string };
  previewName: string;
  owned: boolean;
  equipped: boolean;
  affordable: boolean;
  busy: boolean;
  disabled: boolean;
  onBuy: () => void;
  onEquip: (unequip: boolean) => void;
}) {
  return (
    <View style={[styles.glowCard, equipped && styles.cardEquipped]}>
      {/* THE STAGE. Fixed height, and the name row owns all of it — ~28px of
          clearance around a 24px name, comfortably past the radius-16 halo. */}
      <View style={styles.stage}>
        {/* The app's own ambient wash, not a new gradient: the identical colour
            stops this screen paints behind its background image. */}
        <LinearGradient
          colors={['rgba(0, 0, 0, 0.95)', 'rgba(0, 30, 15, 0.92)', 'rgba(0, 0, 0, 0.95)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.stageNameRow}>
          <PlayerName
            name={previewName}
            textStyle={styles.stageName}
            glow={item.sku}
            glowRadius={16}
          />
        </View>

        {/* THIS ONE MOVES (on web), and this chip is the ONLY place any card
            says so — the band heading, the gold dot and the band subtitle that
            all said it too are gone. Top-right corner, out of the name's way in
            every locale. A static glow carries no chip at all. */}
        {item.animated ? (
          <View style={styles.motionChip}>
            <View style={styles.motionDot} />
            <Text style={styles.motionText} numberOfLines={1}>
              {t('shopAnimated')}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.cardBottom}>
        <View style={styles.cardTitleWrap}>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.name}
          </Text>
          {/* Under the name, never beside the price: the action column is a
              fixed 104px and a second string in it would either wrap the button
              or truncate itself. */}
          <BuyCount item={item} />
        </View>
        <View style={styles.cardActionWrap}>
          <CardAction
            item={item}
            owned={owned}
            equipped={equipped}
            affordable={affordable}
            busy={busy}
            disabled={disabled}
            onBuy={onBuy}
            onEquip={onEquip}
          />
        </View>
      </View>
    </View>
  );
}

/**
 * THE DEFAULT (BASELINE) CARD — first in every slot-backed section.
 *
 * WHY IT EXISTS. A slot can hold nothing, and until this card there was no way
 * to say so from either client: buy one glow, equip it, wear it forever. The
 * server has always accepted the write (`sku: null` is an explicit unequip in
 * api/stampShop.js); nobody ever sent it.
 *
 * IT IS NOT AN ITEM AND MUST NOT LOOK LIKE ONE. No price, no buy button, not
 * even a zero — "free" implies a transaction, and there is nothing to acquire
 * here. It DOES take the green equipped frame, because that is the invariant
 * this feature turns on — EXACTLY ONE card per section reads as equipped, and
 * "nothing equipped" had no card to own that state before.
 *
 * IT HAS NO QUIETER PLATE ANY MORE, and no note either. The plate existed to
 * demote it below cards that were shouting; the note ("Your name with no glow,
 * exactly as the game ships it") described the preview printed directly above
 * it, on a card already titled Default. Web deleted both for the same reasons.
 * Every card on this screen is now the same quiet dark tile, so "one step
 * quieter than that" was a difference nobody could see.
 *
 * `equipped` is derived from the slot being null, signed in or not: a
 * signed-out player really is wearing the baseline, so the card says so instead
 * of nagging for a sign-in over something that costs nothing.
 *
 * The glow variant reuses the section's own stage verbatim (same plate, same
 * wash) with `glow={null}`, so the plain white name is drawn by the very same
 * <PlayerName> the game draws it with. The marker variant reuses the compact
 * card and the untinted pin, which is literally what the map falls back to.
 */
function DefaultCard({
  kind,
  previewName,
  equipped,
  busy,
  disabled,
  onEquip,
}: {
  kind: Category;
  previewName: string;
  equipped: boolean;
  busy: boolean;
  disabled: boolean;
  onEquip: () => void;
}) {
  const isGlow = kind === 'glow';

  return (
    <View style={[isGlow ? styles.glowCard : styles.card, equipped && styles.cardEquipped]}>
      {isGlow ? (
        <View style={styles.stage}>
          <LinearGradient
            colors={['rgba(0, 0, 0, 0.95)', 'rgba(0, 30, 15, 0.92)', 'rgba(0, 0, 0, 0.95)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          <View style={styles.stageNameRow}>
            {/* glow={null} IS the product of this card. */}
            <PlayerName name={previewName} textStyle={styles.stageName} glow={null} />
          </View>
        </View>
      ) : (
        <View style={styles.cardTop}>
          {/* The literal pin the map falls back to, not a stand-in for it. */}
          <Image source={STOCK_PIN_IMAGE} style={styles.cardPin} resizeMode="contain" />
          <View style={styles.cardTitleWrap}>
            <Text style={styles.cardName} numberOfLines={1}>
              {t('shopDefaultName')}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.cardBottom}>
        {isGlow ? (
          <View style={styles.cardTitleWrap}>
            <Text style={styles.cardName} numberOfLines={1}>
              {t('shopDefaultName')}
            </Text>
          </View>
        ) : null}
        <View style={isGlow ? styles.cardActionWrap : styles.cardActionFill}>
          <Pressable
            onPress={onEquip}
            // Nothing to toggle off: pressing Equipped here would send the same
            // null twice. Disabled, but NOT dimmed — see the style note.
            disabled={disabled || busy || equipped}
            style={({ pressed }) => [
              styles.actionBtn,
              equipped ? styles.actionBtnEquipped : styles.actionBtnOwned,
              // Deliberately excludes `equipped`: dimming there would read as
              // "unavailable" rather than as "on".
              (disabled || busy) && !equipped && styles.actionBtnDisabled,
              pressed && styles.actionBtnPressed,
            ]}
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.actionText}>
                {equipped ? t('shopEquipped') : t('shopEquip')}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** Emotes, markers and passes: one glyph / one pin / one number each. */
function ShopCard({
  item,
  owned,
  equipped,
  inBar,
  affordable,
  busy,
  disabled,
  onBuy,
  onEquip,
  onToggleEmote,
}: {
  item: ShelfItem;
  owned: boolean;
  equipped: boolean;
  // An emote's "equipped": it lights the green frame AND drives the label on the
  // action plate, because half of arranging your wheel happens here now.
  inBar: boolean;
  affordable: boolean;
  busy: boolean;
  disabled: boolean;
  onBuy: () => void;
  onEquip: (unequip: boolean) => void;
  onToggleEmote: () => void;
}) {
  // THE GLYPH RIDES THE ITEM. It used to be derived from the sku by chopping an
  // `emote_` prefix off it, which cannot work for the free emotes that now share
  // this shelf: a free emote has no sku, because there is nothing to buy.
  const emoteGlyph = item.type === 'emote' ? (item.glyph ?? null) : null;
  // A marker's thumbnail IS the pin image the map will draw — same principle as
  // the glow stages, and the same PNG web previews. A sku with no image (one
  // shipped to the server before this build) falls back to the stock pin below,
  // which is exactly what the map does with it too.
  const markerPin = item.type === 'marker' && item.sku ? resolveMarkerPin(item.sku) : null;

  // THE WHOLE CARD IS THE BUTTON, for an emote you own. Tapping a picture of an
  // emote to get that emote is what everybody tries first, and making them find
  // the plate on the right instead was the shop asking them to aim — the same
  // reason web wraps its emote card in one stretched hit target
  // (.shopCard__hit). A card you do NOT own keeps its buy button and nothing
  // else is pressable, because a charge must stay a deliberate press.
  const tapToToggle = item.type === 'emote' && owned;
  const base = [
    styles.card,
    (equipped || (item.type === 'emote' && inBar)) && styles.cardEquipped,
  ];
  const Card: any = tapToToggle ? Pressable : View;
  // A FUNCTION STYLE ONLY WHERE A FUNCTION STYLE IS LEGAL. Pressable calls it
  // with { pressed }; View would take it for a style object and throw. So the
  // two wrappers get the shape each understands, and the card body below is
  // written once rather than duplicated inside a branch.
  const cardProps = tapToToggle
    ? {
      onPress: onToggleEmote,
      disabled: disabled || busy,
      accessibilityRole: 'button' as const,
      accessibilityState: { selected: inBar },
      accessibilityLabel: `${item.name} — ${inBar
        ? t('shopEmoteRemove', undefined, 'Remove')
        : t('shopEmoteAdd', undefined, 'Add to wheel')}`,
      style: ({ pressed }: { pressed: boolean }) => [...base, pressed && styles.cardPressed],
    }
    : { style: base };

  return (
    <Card {...cardProps}>
      <View style={styles.cardTop}>
        {emoteGlyph ? (
          <View style={styles.cardGlyphWrap}>
            {/* The one emote with an effect burns on its card too, so the shelf
                shows what the wheel and the duel will show. */}
            {item.fx === 'ember' ? <EmberGlow size={34} /> : null}
            <Text style={[styles.cardGlyph, item.fx === 'ember' && styles.cardGlyphEmber]}>
              {emoteGlyph}
            </Text>
          </View>
        ) : item.type === 'pass' ? (
          <Ionicons name="shield-checkmark" size={22} color={colors.white} />
        ) : (
          <Image source={markerPin ?? STOCK_PIN_IMAGE} style={styles.cardPin} resizeMode="contain" />
        )}
        <View style={styles.cardTitleWrap}>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.name}
          </Text>
          {item.type === 'pass' && item.durationMs ? (
            // JUST THE DURATION. It used to read "Hides full-screen ads for 15
            // minutes", which is now the section line's job said a second time
            // on every pass card. What is left is the only fact that differs
            // between one pass and the next: how long it lasts.
            <Text style={styles.cardNote}>
              {`${Math.round(item.durationMs / 60000)} ${t('shopPassMinutes')}`}
            </Text>
          ) : null}
          {/* SAME PLACE AS THE PASS DURATION, and the same style: both are the
              small line under a name, so they share one look rather than
              inventing a second muted grey a pixel apart from the first. A pass
              is the one card that can show both — how long it lasts, then how
              many people bought one. */}
          <BuyCount item={item} />
        </View>
      </View>

      <View style={styles.cardBottom}>
        <CardAction
          item={item}
          owned={owned}
          equipped={equipped}
          inBar={inBar}
          affordable={affordable}
          busy={busy}
          disabled={disabled}
          onBuy={onBuy}
          onEquip={onEquip}
        />
      </View>
    </Card>
  );
}


const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  headerTitle: {
    fontFamily: 'JockeyOne',
    fontSize: fontSizes['3xl'],
    color: colors.white,
  },
  wallet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minWidth: 40,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(253, 224, 71, 0.35)',
  },
  walletValue: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.sm,
    color: '#FDE047',
    fontVariant: ['tabular-nums'],
  },
  // Jump row
  jumpBar: {
    paddingBottom: spacing.xs,
  },
  jumpRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  jumpChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  jumpChipPressed: {
    backgroundColor: colors.primaryTransparent,
  },
  // "You are here" is an OUTLINE, deliberately not a filled pill: a filled chip
  // in a row of chips reads as a selected filter, and every section stays
  // mounted here. Mirrors the web shop's treatment.
  jumpChipActive: {
    borderColor: 'rgba(110, 231, 183, 0.85)',
    backgroundColor: 'rgba(16, 84, 56, 0.55)',
  },
  jumpChipText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.xs,
    color: colors.white,
  },
  jumpChipTextActive: {
    color: '#6EE7B7',
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  // Sections
  section: {
    marginBottom: spacing.md,
  },
  // A COLUMN now: title, then the what-this-is line. It was a row because the
  // only thing beside the title was a count pill, and the count is the grid.
  sectionHead: {
    gap: 2,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    fontFamily: 'JockeyOne',
    fontSize: fontSizes.xl,
    color: colors.white,
  },
  sectionDesc: {
    fontFamily: 'Lexend-Medium',
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
  },
  loading: {
    paddingVertical: spacing['3xl'],
    alignItems: 'center',
  },
  notice: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  noticeError: {
    borderColor: 'rgba(239, 68, 68, 0.5)',
  },
  noticeText: {
    fontFamily: 'Lexend-Medium',
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryTransparent,
  },
  retryText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.sm,
    color: colors.white,
  },
  // Grids
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  glowList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // Enough gutter that one card's halo never lands next to another's — which
    // at these one-per-row widths only ever means the VERTICAL gap.
    gap: spacing.sm,
  },
  // The two-band glow structure (glowBand / bandHead / bandTitle / bandDot /
  // bandNote) is DELETED. One list, one card size, animated first, with the
  // platform sentence in the section line above it. See GlowSection.
  card: {
    width: '48%',
    flexGrow: 1,
    // 150 -> 128: three emote/pin tiles now fit across a 390px phone where two
    // used to, and the tile is still wider than its own glyph and button.
    minWidth: 128,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: spacing.sm,
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  glowCard: {
    flexGrow: 1,
    // 300 -> 260. Still one-per-row on every phone (two 260s plus a gutter do
    // not fit inside a 390-430px screen), but a small tablet or a landscape
    // phone now gets two, and the 24px name still has room for its halo at
    // that width.
    minWidth: 260,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: spacing.sm,
    gap: spacing.xs,
  },
  // GONE WITH THE BAND: glowCardFeatured (a gold frame on a deeper plate) and
  // the baseline's two demotion styles (defaultCardPlate / defaultCardFrame).
  // Every tile on this screen is the same quiet dark card now, so the ONE frame
  // colour left that means anything is the green one directly below.
  cardEquipped: {
    borderColor: colors.success,
    backgroundColor: colors.primaryTransparent,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardTitleWrap: {
    flexShrink: 1,
    minWidth: 0,
  },
  cardActionWrap: {
    width: 104,
  },
  // The compact (marker) baseline card has no price beside its button, so the
  // control takes the whole footer rather than leaving 116px of it hanging.
  cardActionFill: {
    flex: 1,
  },
  cardName: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.sm,
    color: colors.white,
  },
  cardNote: {
    fontFamily: 'Lexend-Medium',
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  cardGlyph: {
    fontSize: 22,
  },
  // Only for the emote glyph, and only so EmberGlow has a box to centre in. 34
  // square is the glyph's own row height, so nothing moves for the emotes that
  // have no effect.
  cardGlyphWrap: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The static half of the ember (see EmberGlow for why the moving half is a
  // pair of discs and not an animated shadow).
  cardGlyphEmber: {
    textShadowColor: 'rgba(255, 138, 42, 0.95)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  },
  // The whole card is the button for an owned emote, so it needs the press
  // feedback a button has. Same numbers as actionBtnPressed.
  cardPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  // The pin thumbnail: 22 wide to match the emote glyph and the pass icon that
  // share this row, and 33 tall because that is the art's own 87:131 — declare
  // the ratio rather than letting `contain` letterbox a square box.
  cardPin: {
    width: 22,
    height: 33,
  },
  // THE STAGE. One plate, a fixed height, and the name row owns all of it now
  // that the white check strip is gone. 172 -> 88: the strip was 38 of that
  // plus a 12 gap plus 38 of paddings, and what is left still centres a 32px
  // line box with ~28px of black on each side — well past the radius-16 halo
  // drawn on it. `overflow: hidden` is what keeps the absolutely-filled
  // gradient inside the rounded corners.
  stage: {
    height: 88,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: borderRadius.md,
    backgroundColor: '#05070A',
    overflow: 'hidden',
  },
  stageNameRow: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageName: {
    fontFamily: 'Lexend-Bold',
    fontSize: 24,
    lineHeight: 32,
    color: colors.white,
  },
  // The white "on light" check strip that used to sit at the bottom of every
  // stage is DELETED, along with checkNameRow / checkName / checkLabel. One
  // stage, black, matching the web card. The light COLOURS stay: see the
  // GlowCard doc comment.

  // The web card's gold pill, in React Native. Same job: say in words that this
  // sku moves. It is no longer the only evidence — the stage moves too — but it
  // stays, for the same two reasons web keeps its copy of it: the eye needs a
  // beat to catch a 4.4s sweep, and under Reduce Motion nothing moves at all.
  // Pinned to the stage's top-right corner, and capped at 80%
  // of it, so no locale can grow it across the name underneath (it is absolute,
  // so it would overlap rather than push).
  motionChip: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    maxWidth: '80%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(253, 224, 71, 0.35)',
    backgroundColor: 'rgba(253, 224, 71, 0.08)',
  },
  motionDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#FDE047',
  },
  motionText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#FDE047',
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6,
    borderRadius: borderRadius.md,
    minHeight: 30,
  },
  actionBtnBuy: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(253, 224, 71, 0.35)',
  },
  // EQUIP IS BLUE, EQUIPPED IS LIGHT BLUE — same call as the web shop
  // (.shopCard__btn--equip / --on in styles/shop.css). Buy stays green: it is
  // the only button here that spends. Solid = do it, soft = it is already done.
  //
  // #1e3e9c is --gradBlue's first stop, the site blue the guess and reload
  // buttons are painted with; the tint below is that same gradient's light stop.
  // Flat rather than a gradient because RN needs a LinearGradient element for
  // that and one small button does not justify wrapping the Pressable.
  actionBtnOwned: {
    backgroundColor: '#1e3e9c',
  },
  actionBtnEquipped: {
    backgroundColor: 'rgba(112, 112, 255, 0.24)',
  },
  // NOT ON THE WHEEL: the invitation. Neutral white chrome so it does not claim
  // to be the green buy button, and the ＋ is the same sign the empty cells on
  // the wheel above are drawing — that hole and this card are the two ends of
  // one gesture. Web's .shopCard__tag--add, verbatim.
  actionBtnAdd: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  // ON THE WHEEL: the state, in the light blue every "already on" control in
  // this app wears (it is --gradBlue's own light stop, same as actionBtnEquipped
  // one rule up).
  actionBtnOnWheel: {
    backgroundColor: 'rgba(112, 112, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(112, 112, 255, 0.55)',
  },
  actionTextOnWheel: {
    color: '#b6b6ff',
  },
  actionBtnDisabled: {
    opacity: 0.45,
  },
  actionBtnPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  actionText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.sm,
    color: colors.white,
  },
});
