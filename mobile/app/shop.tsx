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
 *  - ONE PAGE, NO TABS. Every category stays in one continuous storefront,
 *    stacked under its own heading and reached by scrolling — same shape as the
 *    web storefront (components/shop/ShopView.js). The native list virtualizes
 *    those shelves, so off-screen glows, emotes and photographs do not mount on
 *    entry. Categories the server sent nothing for are omitted outright, never
 *    rendered as an empty heading.
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
 *    near-black plate, the name set at display size and weight, and enough quiet
 *    margin that the bloom dies inside its own stage. ONE stage, one size, for
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
 *  - BACKGROUNDS SHIP HERE NOW. They were filtered out server-side for
 *    `platform:'mobile'` for as long as the app bundled one static photograph
 *    and could not read /backgrounds/*.webp — RN's iOS image pipeline does not
 *    decode WebP, so the rows were correctly withheld rather than sold as an
 *    image that would render as nothing. The app loads them over the network
 *    through expo-image now (src/components/SiteBackground.tsx), the catalogue
 *    row says ['web', 'mobile'], and this screen has the section to match.
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
  FlatList,
  Image,
  type LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  Text,
  type ViewStyle,
  type ViewToken,
  useWindowDimensions,
  View,
} from 'react-native';
import SiteBackground from '../src/components/SiteBackground';
import { Pressable } from '../src/components/ui/SfxPressable';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
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
import CountryFlag from '../src/components/CountryFlag';
import EmoteWheel from '../src/components/shop/EmoteWheel';
import EmberGlow from '../src/components/shop/EmberGlow';
import StampMark, {
  STAMP_MARK_SIZE,
  STAMP_MARK_SIZE_BTN,
  STAMP_VALUE_SIZE_BTN,
  STAMP_MARK_BTN_STYLE,
  stampMarkStyle,
} from '../src/components/shop/StampMark';
// Aliased: this file already imports React Native's Image for the bundled pin
// and stock-background art, and only the city photographs need expo-image's
// WebP decoding and disk cache.
import { Image as ExpoImage } from 'expo-image';
import { backgroundUrlForSku } from '../src/services/siteBackground';
import { useSiteAccent } from '../src/store/siteBackgroundStore';
import { GLOW_CLIP_RELIEF } from '../src/shared/glowKeyframes';
// One source for web and native: jump-chip order, FlatList indices and shelf
// lazy mounting all derive from this sequence.
import { CATEGORY_ORDER, type ShopCategory } from '@shared/shop/categoryOrder';

/** The photograph everybody starts with, and the placeholder under every city. */
const STOCK_BACKGROUND = require('../assets/street2.jpg');

// Backgrounds are image products, but a phone does not need a full-width hero
// for every city. This is the same compact floor as the web shop. The column
// count is derived from the current window so rotation, tablets and split view
// recompute the shelf instead of stretching a phone card.
const BACKGROUND_CARD_MIN_WIDTH = 160;
const BACKGROUND_CARD_MAX_COLUMNS = 4;
const GLOW_STAGE_LINE_HEIGHT = 32;
const SHOP_LOADING_SHELVES = [0, 1] as const;
const SHOP_LOADING_CARDS = [0, 1, 2, 3] as const;
const SHOP_LOADING_CHIPS = [64, 84, 76] as const;
const SHOP_WALLET_MARK_SIZE = Math.round(STAMP_MARK_SIZE * 0.8);
const SHOP_WALLET_VALUE_SIZE = Math.round(SHOP_WALLET_MARK_SIZE * 0.62);
const SHOP_WALLET_MARK_STYLE = stampMarkStyle(SHOP_WALLET_MARK_SIZE);
const SHOP_WALLET_HELP_MAX_WIDTH = 260;
const JUMP_CHIP_TRANSITION_MS = 220;
const SHOP_BACKGROUND_BLUR_RADIUS = 2;
const SHOP_CARD_SURFACE_COLOR = 'rgba(0, 0, 0, 0.68)';
const SHOP_VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 10,
  minimumViewTime: 60,
} as const;

interface EquippedAppearance {
  card: ViewStyle;
  action: ViewStyle;
}

function backgroundCardWidthFor(shelfWidth: number): number {
  const columns = Math.max(
    1,
    Math.min(
      BACKGROUND_CARD_MAX_COLUMNS,
      Math.floor(
        (shelfWidth + spacing.xs)
        / (BACKGROUND_CARD_MIN_WIDTH + spacing.xs),
      ),
    ),
  );
  return Math.floor(
    (shelfWidth - (spacing.xs * (columns - 1))) / columns,
  );
}

type Category = ShopCategory;

/**
 * The pinned section control. Selection is a relationship to the shelf below,
 * so its tint travels instead of teleporting when the scroll spy changes.
 * Only color and opacity animate; card layout and the horizontal rail stay
 * completely still on low-end phones.
 */
function ShopJumpChip({
  label,
  active,
  accent,
  onPress,
}: {
  label: string;
  active: boolean;
  accent: { primary: string; chrome: string };
  onPress: () => void;
}) {
  const selected = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    selected.value = withTiming(active ? 1 : 0, {
      duration: JUMP_CHIP_TRANSITION_MS,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      reduceMotion: ReduceMotion.System,
    });
  }, [active, selected]);

  const selectionStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      selected.value,
      [0, 1],
      ['rgba(0, 0, 0, 0.45)', accent.chrome],
    ),
    borderColor: interpolateColor(
      selected.value,
      [0, 1],
      ['rgba(0, 0, 0, 0)', accent.primary],
    ),
  }), [accent.chrome, accent.primary]);

  const labelStyle = useAnimatedStyle(() => ({
    opacity: 0.78 + (selected.value * 0.22),
  }));

  return (
    <Animated.View style={[styles.jumpChip, selectionStyle]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={({ pressed }) => [
          styles.jumpChipHit,
          pressed && styles.jumpChipPressed,
        ]}
      >
        <Animated.Text style={[styles.jumpChipText, labelStyle]}>
          {label}
        </Animated.Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * The equippable slots, as one name. Mirrors api.equipCosmetic's own union —
 * this union was written out longhand in four places and `background` had to be
 * added to every one of them, which is three chances to have a shelf whose
 * cards cannot equip.
 */
type EquipSlot = 'nameGlow' | 'markerSkin' | 'background';

/** Which equip slot a category writes, or null for items that are not equipped. */
const SLOT_FOR_CATEGORY: Record<Category, EquipSlot | null> = {
  glow: 'nameGlow',
  marker: 'markerSkin',
  background: 'background',
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

interface ShopSection {
  type: Category;
  label: string;
  items: ShelfItem[];
}

// Keep the last successful catalogue in memory across route unmounts. Opening
// the shop again paints useful shelves on frame one, then reconciles quietly in
// the background instead of replaying the whole loading screen.
let shopCatalogItemsCache: ShopItem[] | null = null;

/** Signed-out visitors still get to see a glow on something name-shaped. */
const SAMPLE_NAME = 'WorldGuessr';
/** Display copy only; api/stampShop.js remains authoritative for enforcement. */
const ADFREE_SKU = 'pass_adfree_20m';
const ADFREE_DAILY_CAP = 3;

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
    // Mobile deliberately does not display a public buy count for the
    // consumable pass, so updating that hidden figure only rebuilds the shelf.
    if (item.sku === ADFREE_SKU) return item;
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
 *   "N buys"      for permanent cosmetics, INCLUDING ZERO. The consumable
 *                 ad-free pass uses this slot for its daily limit instead.
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

/**
 * A size-stable first-load state. It occupies the same shelf geometry as the
 * catalogue, so the jump row and content do not teleport when the request wins.
 * One shared opacity breath is considerably cheaper and calmer than a spinner
 * plus dozens of delayed card entrances.
 */
function ShopLoadingState() {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, {
        duration: 900,
        easing: Easing.inOut(Easing.quad),
        reduceMotion: ReduceMotion.System,
      }),
      -1,
      true,
      undefined,
      ReduceMotion.System,
    );
    return () => cancelAnimation(pulse);
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.52 + (pulse.value * 0.32),
  }));

  return (
    <View
      style={styles.loadingState}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('loading')}
    >
      <Animated.View
        entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}
      >
        <Animated.View style={[styles.loadingSkeleton, pulseStyle]}>
          {SHOP_LOADING_SHELVES.map((shelf) => (
            <View key={shelf} style={styles.loadingShelf}>
              <View style={styles.loadingSectionTitle} />
              <View style={styles.loadingGrid}>
                {SHOP_LOADING_CARDS.map((card) => (
                  <View key={card} style={styles.loadingCard}>
                    <View style={styles.loadingPreview} />
                    <View style={styles.loadingLine} />
                    <View style={[styles.loadingLine, styles.loadingLineShort]} />
                  </View>
                ))}
              </View>
            </View>
          ))}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

export default function ShopScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const safeWindowWidth = windowWidth - insets.left - insets.right;
  const headerSideWidth = Math.min(140, Math.max(104, Math.round(safeWindowWidth * 0.3)));
  const walletHelpWidth = Math.min(
    SHOP_WALLET_HELP_MAX_WIDTH,
    safeWindowWidth - (spacing.md * 2),
  );

  const estimatedBackgroundShelfWidth = Math.max(
    BACKGROUND_CARD_MIN_WIDTH,
    safeWindowWidth - (spacing.md * 2),
  );
  const backgroundLayoutKey = `${windowWidth}:${insets.left}:${insets.right}`;
  const [backgroundGridMeasurement, setBackgroundGridMeasurement] = useState<{
    key: string;
    width: number;
  } | null>(null);
  const backgroundShelfWidth = backgroundGridMeasurement?.key === backgroundLayoutKey
    ? backgroundGridMeasurement.width
    : estimatedBackgroundShelfWidth;
  const backgroundCardWidth = backgroundCardWidthFor(backgroundShelfWidth);

  const onBackgroundGridLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const measuredWidth = Math.floor(event.nativeEvent.layout.width);
      if (measuredWidth <= 0) return;
      setBackgroundGridMeasurement((current) => (
        current?.key === backgroundLayoutKey && current.width === measuredWidth
          ? current
          : { key: backgroundLayoutKey, width: measuredWidth }
      ));
    },
    [backgroundLayoutKey],
  );

  const secret = useAuthStore((s) => s.secret);
  const user = useAuthStore((s) => s.user);
  const applyCosmetics = useAuthStore((s) => s.applyCosmetics);

  // THE STOREFRONT WEARS WHAT YOU BOUGHT FROM IT. A player looking at a purple
  // New York photograph through a green shop was the loudest version of the
  // mismatch this fixes — the thing being sold is right there behind the chrome
  // that refuses to match it. The washes and the two chrome fills come from here
  // rather than from `colors` because a StyleSheet cannot follow an equip.
  //
  const accent = useSiteAccent();
  // Equipped is a selected state inside theme-aware menu chrome. One restrained
  // outline marks the card; the small action carries the solid accent. Tinting
  // both entire surfaces the same color flattened them into one large blob.
  const equippedAppearance = useMemo<EquippedAppearance>(() => ({
    card: { borderColor: accent.primary },
    action: { backgroundColor: accent.primary },
  }), [accent.primary]);

  const [items, setItems] = useState<ShopItem[] | null>(() => shopCatalogItemsCache);
  const [loading, setLoading] = useState(shopCatalogItemsCache === null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** sku currently in flight — disables just that card, not the whole page. */
  const [busySku, setBusySku] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [walletHelpOpen, setWalletHelpOpen] = useState(false);
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
      const nextItems = Array.isArray(res.items) ? res.items : [];
      shopCatalogItemsCache = nextItems;
      setItems(nextItems);
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
      // into a heading that does not exist. Nothing hits this today — every
      // catalogue type has a shelf now that backgrounds do — so it is the
      // landing spot for a category added server-side before the app knows it.
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

  // Jump-to-section. The vertical storefront is a FlatList so only nearby
  // shelves exist. That matters here: a plain ScrollView mounted all 35 priced
  // products, 20 emotes, every live glow and every city photograph in one
  // commit before the navigation transition could finish.
  const scrollRef = useRef<FlatList<ShopSection>>(null);
  // The emote GRID's offset inside its section. The section starts with the
  // wheel you are standing on, so "Get more" has to aim past it.
  const emoteGridY = useRef(0);
  const firstSection = sections[0]?.type ?? null;
  const [activeSection, setActiveSection] = useState<Category | null>(() => firstSection);
  const activeRef = useRef<Category | null>(firstSection);
  // Raised by a chip tap, dropped the moment a finger touches the list. This
  // client gets to be blunter than web about it: RN says outright whether a
  // scroll came from a drag, so "the reader took over" needs no guessing at
  // positions the way the browser's does.
  const jumpLatch = useRef(false);
  const pendingScroll = useRef<{
    index: number;
    animated: boolean;
    viewOffset: number;
  } | null>(null);

  // A catalog fetched after mount used to leave every chip unselected until
  // the first scroll event. Seed from the first real shelf instead: Pins in the
  // normal catalog, or whichever category actually leads when one is absent.
  useEffect(() => {
    const currentStillExists = sections.some((section) => section.type === activeRef.current);
    if (currentStillExists || !firstSection) return;
    activeRef.current = firstSection;
    setActiveSection(firstSection);
  }, [firstSection, sections]);

  const onViewableItemsChanged = useRef(({
    viewableItems,
  }: {
    viewableItems: Array<ViewToken<ShopSection>>;
  }) => {
    // A chip tap owns the highlight until the reader takes the list back. This
    // prevents a long animated jump from lighting each shelf it passes.
    if (jumpLatch.current) return;
    const firstVisible = viewableItems
      .filter((token) => token.isViewable && token.item)
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))[0]?.item;
    if (firstVisible && firstVisible.type !== activeRef.current) {
      activeRef.current = firstVisible.type;
      setActiveSection(firstVisible.type);
    }
  }).current;

  const scrollToSection = useCallback((
    type: Category,
    animated = true,
    viewOffset = spacing.sm,
  ) => {
    const index = sections.findIndex((section) => section.type === type);
    if (index < 0) return;
    pendingScroll.current = { index, animated, viewOffset };
    scrollRef.current?.scrollToIndex({
      index,
      animated,
      viewPosition: 0,
      viewOffset,
    });
  }, [sections]);

  const onScrollToIndexFailed = useCallback((info: {
    index: number;
    averageItemLength: number;
  }) => {
    // Dynamic shelves cannot provide getItemLayout. Move near the unmeasured
    // target so FlatList mounts it, then repeat the exact index jump next frame.
    scrollRef.current?.scrollToOffset({
      offset: Math.max(0, info.averageItemLength * info.index),
      animated: false,
    });
    requestAnimationFrame(() => {
      const pending = pendingScroll.current;
      if (!pending || pending.index !== info.index) return;
      scrollRef.current?.scrollToIndex({
        index: info.index,
        animated: pending.animated,
        viewPosition: 0,
        viewOffset: pending.viewOffset,
      });
    });
  }, []);

  const jumpTo = useCallback((type: Category) => {
    setWalletHelpOpen(false);
    haptics.selection();
    // Set it immediately so the chip responds on tap rather than waiting for
    // the smooth scroll to settle — and LATCH it, so the scroll it starts cannot
    // walk the highlight through the shelves it passes on the way, or leave it
    // on whichever one the list happened to stop under.
    jumpLatch.current = true;
    activeRef.current = type;
    setActiveSection(type);
    scrollToSection(type);
  }, [scrollToSection]);

  // The reader taking the list back. One line, and it is the ONLY way the latch
  // above comes down: no timer to tune, and no window in which a tap is ignored.
  const onScrollBeginDrag = useCallback(() => {
    jumpLatch.current = false;
    setWalletHelpOpen(false);
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
    // Negative viewOffset moves into the virtualized cell by the wheel's own
    // measured height, landing the first sellable card just under the jump row.
    scrollToSection('emote', true, spacing.sm - emoteGridY.current);
  }, [scrollToSection]);

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
          setItems((prev) => {
            if (!prev) return prev;
            const next = bumpBuyCount(prev, item.sku!);
            shopCatalogItemsCache = next;
            return next;
          });
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
        scrollToSection('emote');
        assignEmote(landing.index, landing.id, { bar: landing.bar, owned: landing.owned });
      }
    },
    [secret, busySku, ownedList, emoteOrder, applyCosmetics, entitlementPatch, load, assignEmote, scrollToSection],
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
      slot: EquipSlot | null,
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
    (slot: EquipSlot) => {
      // Already the baseline. The button is disabled in that state; this is the
      // belt to its braces, so a stray press can never spend a write saying
      // "null" to a slot that is already null. Web guards the same way.
      if (!(equipped as any)[slot]) return;
      handleEquip(slot, null, `slot:${slot}`);
    },
    [handleEquip, equipped],
  );

  const initialLoading = loading && items === null;

  const renderShopSection = ({ item: section }: { item: ShopSection }) => {
    // The slot this section writes, or null for emotes and passes — which is
    // exactly the test for "does this section have a baseline to go back to".
    const sectionSlot = SLOT_FOR_CATEGORY[section.type];
    const defaultBusyKey = sectionSlot ? `slot:${sectionSlot}` : '';

    return (
      <Animated.View
        // Each shelf gets one cheap opacity reveal when FlatList brings it into
        // the render window. There are no staggered card entrances to block JS.
        entering={FadeIn.duration(240).reduceMotion(ReduceMotion.System)}
        style={styles.section}
      >
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{section.label}</Text>
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
            equippedAppearance={equippedAppearance}
            onBuy={handleBuy}
            onEquip={equipItem}
            onEquipDefault={equipDefault}
          />
        ) : (
          <>
            {section.type === 'emote' && secret ? (
              <EmoteWheel
                bar={bar}
                isDefault={barIsDefault}
                busy={busySku === 'emoteOrder'}
                onRemove={removeEmoteCell}
                onReset={resetEmoteBar}
                onAddMore={scrollToEmoteShelf}
              />
            ) : null}
            <View
              style={styles.grid}
              onLayout={section.type === 'emote'
                ? (e) => { emoteGridY.current = e.nativeEvent.layout.y; }
                : section.type === 'background'
                  ? onBackgroundGridLayout
                  : undefined}
            >
              {sectionSlot ? (
                <DefaultCard
                  kind={section.type}
                  previewName={previewName}
                  backgroundCardWidth={section.type === 'background' ? backgroundCardWidth : undefined}
                  equipped={!(equipped as any)[sectionSlot]}
                  busy={busySku === defaultBusyKey}
                  disabled={!secret || (!!busySku && busySku !== defaultBusyKey)}
                  equippedAppearance={equippedAppearance}
                  onEquip={() => equipDefault(sectionSlot)}
                />
              ) : null}
              {section.items.map((item) => {
                const key = item.sku ?? `emote:${item.emoteId}`;
                if (section.type === 'background') {
                  return (
                    <BackgroundCard
                      key={key}
                      item={item}
                      cardWidth={backgroundCardWidth}
                      owned={!!item.sku && owned.has(item.sku)}
                      equipped={equipped.background === item.sku}
                      affordable={stamps >= item.price}
                      busy={busySku === key}
                      disabled={!secret || (!!busySku && busySku !== key)}
                      equippedAppearance={equippedAppearance}
                      onBuy={() => handleBuy(item)}
                      onEquip={(unequip) => equipItem(item, unequip)}
                    />
                  );
                }
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
                    equippedAppearance={equippedAppearance}
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
  };

  return (
    <View style={styles.root}>
      <SiteBackground
        style={StyleSheet.absoluteFill}
        blurRadius={SHOP_BACKGROUND_BLUR_RADIUS}
      >
        <LinearGradient
          // Match the profile's stronger theme-aware wash: the background still
          // identifies the equipped city, but the catalogue owns the contrast.
          colors={accent.modalWash}
          style={StyleSheet.absoluteFill}
        />
      </SiteBackground>

      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <Animated.View
          entering={FadeIn.duration(220).reduceMotion(ReduceMotion.System)}
          style={styles.header}
        >
          <View style={[styles.headerSide, { width: headerSideWidth }]}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel={t('close')}
            >
              <Ionicons name="close" size={26} color={colors.white} />
            </Pressable>
          </View>
          <Text
            style={styles.headerTitle}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {t('shop')}
          </Text>
          {/* Wallet. Outside the scroller, so the balance is on screen at the
              moment of every buy decision no matter how far down the page. */}
          <View style={[styles.headerSide, styles.headerSideRight, { width: headerSideWidth }]}>
            <View style={styles.walletAnchor}>
              <Pressable
                onPress={() => {
                  haptics.selection();
                  setWalletHelpOpen((open) => !open);
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityState={{ expanded: walletHelpOpen }}
                accessibilityLabel={`${t('shopStampsBalance', { count: stamps })}. ${t('shopStampsHowTitle')}`}
                style={({ pressed }) => [styles.wallet, pressed && styles.walletPressed]}
              >
                <StampMark style={SHOP_WALLET_MARK_STYLE} />
                <Text
                  style={styles.walletValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                >
                  {formatCompact(stamps)}
                </Text>
              </Pressable>

              {walletHelpOpen ? (
                <Animated.View
                  entering={FadeIn.duration(150).reduceMotion(ReduceMotion.System)}
                  exiting={FadeOut.duration(120).reduceMotion(ReduceMotion.System)}
                  style={[
                    styles.walletHelp,
                    { width: walletHelpWidth, backgroundColor: accent.deep },
                  ]}
                  accessible
                >
                  <Text style={styles.walletHelpTitle}>{t('shopStampsHowTitle')}</Text>
                  <Text style={styles.walletHelpBody}>{t('shopStampsHowBody')}</Text>
                </Animated.View>
              ) : null}
            </View>
          </View>
        </Animated.View>

        {/* Jump row — pinned with the wallet, not scrolled with the content. */}
        {initialLoading ? (
          <View style={styles.jumpBar} accessibilityElementsHidden>
            <View style={[styles.jumpRow, styles.loadingJumpRow]}>
              {SHOP_LOADING_CHIPS.map((width) => (
                <View key={width} style={[styles.loadingJumpChip, { width }]} />
              ))}
            </View>
          </View>
        ) : sections.length > 1 ? (
          <View style={styles.jumpBar}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.jumpRow}
              accessibilityLabel={t('shopJumpTo')}
            >
              {sections.map((section) => (
                <ShopJumpChip
                  key={section.type}
                  label={section.label}
                  active={activeSection === section.type}
                  accent={accent}
                  onPress={() => jumpTo(section.type)}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        <FlatList<ShopSection>
          ref={scrollRef}
          data={initialLoading ? [] : sections}
          keyExtractor={(section) => section.type}
          renderItem={renderShopSection}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + spacing['3xl'] },
          ]}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={onScrollBeginDrag}
          onTouchStart={() => setWalletHelpOpen(false)}
          directionalLockEnabled
          initialNumToRender={1}
          maxToRenderPerBatch={1}
          updateCellsBatchingPeriod={50}
          windowSize={3}
          // Android defaults this to true, which clips text-shadow halos at the
          // virtual cell boundary. Windowing still unmounts distant shelves.
          removeClippedSubviews={false}
          viewabilityConfig={SHOP_VIEWABILITY_CONFIG}
          onViewableItemsChanged={onViewableItemsChanged}
          onScrollToIndexFailed={onScrollToIndexFailed}
          ListHeaderComponent={(
            <>
              {!secret ? (
                <View style={styles.notice}>
                  <Text style={styles.noticeText}>{t('shopSignInRequired')}</Text>
                </View>
              ) : null}
              {actionError ? (
                <View style={[styles.notice, styles.noticeError]}>
                  <Text style={styles.noticeText}>{actionError}</Text>
                </View>
              ) : null}
              {loadError && items !== null ? (
                <View style={styles.notice}>
                  <Text style={styles.noticeText}>{loadError}</Text>
                  <Pressable
                    onPress={load}
                    style={[styles.retryBtn, { backgroundColor: accent.primaryTransparent }]}
                  >
                    <Text style={styles.retryText}>{t('retry')}</Text>
                  </Pressable>
                </View>
              ) : null}
              {initialLoading ? <ShopLoadingState /> : null}
              {loadError && items === null ? (
                <View style={styles.notice}>
                  <Text style={styles.noticeText}>{loadError}</Text>
                  <Pressable
                    onPress={load}
                    style={[styles.retryBtn, { backgroundColor: accent.primaryTransparent }]}
                  >
                    <Text style={styles.retryText}>{t('retry')}</Text>
                  </Pressable>
                </View>
              ) : null}
            </>
          )}
          ListEmptyComponent={!initialLoading && !(loadError && items === null) ? (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>{t('shopEmpty')}</Text>
            </View>
          ) : null}
        />
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
    case 'background':
      return t('shopCategoryBackgrounds');
    case 'pass':
      return t('shopCategoryPasses');
  }
}

/* categoryDesc IS DELETED — the one-liner under each heading, with its five
 * locale keys (web's CATEGORY_DESC_KEY table went in the same pass). Subtitle
 * furniture, five times down one page. A heading, then goods. */

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
  equippedAppearance,
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
  equippedAppearance: EquippedAppearance;
  onBuy: () => void;
  onEquip: (unequip: boolean) => void;
}) {
  const slot = SLOT_FOR_CATEGORY[item.type as Category];
  const rejectOffset = useSharedValue(0);
  const rejectStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: rejectOffset.value }],
  }));

  const handleBuyPress = () => {
    if (affordable) {
      onBuy();
      return;
    }

    haptics.warning();
    cancelAnimation(rejectOffset);
    rejectOffset.value = 0;
    rejectOffset.value = withSequence(
      ReduceMotion.System,
      withTiming(-5, { duration: 40, easing: Easing.out(Easing.quad) }),
      withTiming(5, { duration: 45, easing: Easing.inOut(Easing.quad) }),
      withTiming(-3, { duration: 40, easing: Easing.inOut(Easing.quad) }),
      withTiming(3, { duration: 35, easing: Easing.inOut(Easing.quad) }),
      withTiming(0, { duration: 45, easing: Easing.out(Easing.quad) }),
    );
  };

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
          equipped ? equippedAppearance.action : styles.actionBtnOwned,
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
    <Animated.View style={[styles.buyButtonMotionWrap, rejectStyle]}>
      <Pressable
        onPress={handleBuyPress}
        sfx={affordable ? 'click' : 'none'}
        // In-flight lockout. Every press mints its own idempotency key, so two
        // presses would be two DIFFERENT keys and therefore two real charges.
        // An unaffordable button remains pressable solely to acknowledge the
        // attempt with a shake; handleBuyPress blocks the purchase itself.
        disabled={disabled || busy}
        style={({ pressed }) => [
          styles.actionBtn,
          styles.actionBtnBuy,
          (disabled || busy || !affordable) && styles.actionBtnBuyUnavailable,
          pressed && affordable && styles.actionBtnPressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : (
          <>
            {/* THE ACTION ROW'S MARK, not the wallet's — this button has to be the
                same control as the Equip button on the next card, so it wears
                STAMP_MARK_SIZE_BTN. Web does this in CSS on `.shopCard__btn
                .stampMark`; the reasoning lives in StampMark.tsx. */}
            <StampMark style={STAMP_MARK_BTN_STYLE} />
            {/* priceText, not actionText: this is a stamps FIGURE and it is sized
                against the mark beside it. The word labels on the other variants
                of this button (Owned, Equip, Sign in) stay at actionText. Web
                scopes it the same way, on .shopCard__btn--buy. */}
            <Text style={styles.priceText}>{item.price.toLocaleString()}</Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

/**
 * The Glows section: ONE LIST, one card size, animated skus first.
 *
 * IT WAS TWO BANDS AND IT IS NOT ANY MORE — the same deletion web made
 * (components/shop/ItemPreview.js). The animated tier used to be promoted into
 * a band with its own heading, a gold dot, a subtitle, a bigger plate, a bigger
 * name, a wider halo and a gold frame. Seven mechanisms, and on THIS platform
 * they once sold motion the app could not render. The app animates now
 * (src/components/NameGlowHalo.tsx), and nothing on the card says "animated"
 * in words any more — the section line and the gold chip both went in the
 * Aug 11 de-slop pass. The moving ones move; that is the label.
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
  equippedAppearance,
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
  equippedAppearance: EquippedAppearance;
  onBuy: (item: ShelfItem) => void;
  onEquip: (item: ShelfItem, unequip: boolean) => void;
  onEquipDefault: (slot: EquipSlot) => void;
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
        equippedAppearance={equippedAppearance}
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
          equippedAppearance={equippedAppearance}
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
 * The stage is a RECESSED DARK PLATE — the owner's second ruling on this box,
 * reversing the "no stage at all" pass, in step with the web card handing its
 * glow preview the shared .shopPrev well back (styles/shop.css): a glow is
 * sold by CONTRAST, every radius in src/shared/glowKeyframes.ts is tuned
 * against near-black, and on the card's own mid plate the pale wide layers
 * washed out. The tone is bgThumb's #05070A — the recess this screen already
 * uses — not a wash, not a photograph, and no dressing on top of it.
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
 * THE STAGE'S CLEARANCE IS THE SHARED GLOW CONTRACT, NOT AN EYEBALLED HEIGHT.
 * The old 80px stage left 24px around a 32px line and counted only shadow radius;
 * animated layers also travel off-centre, so the bloom reached the plate edge
 * and appeared to stop on a rectangle. GLOW_CLIP_RELIEF is the app-wide reach
 * allowance, applied on all four sides here so every halo dies on the same dark
 * surface before the card begins.
 */
function GlowCard({
  item,
  previewName,
  owned,
  equipped,
  affordable,
  busy,
  disabled,
  equippedAppearance,
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
  equippedAppearance: EquippedAppearance;
  onBuy: () => void;
  onEquip: (unequip: boolean) => void;
}) {
  return (
    <View style={[styles.glowCard, equipped && equippedAppearance.card]}>
      {/* THE PLATE IS BACK — second ruling. The de-slop pass stripped the
          plate, the wash and the gold "Animated" chip together; the wash and
          the chip STAY dead, but a glow needs dark behind it to read, so the
          stage wears the same #05070A recess bgThumb uses. The animated skus
          still say "animated" by moving. Web made the identical change to
          .shopPrev--glow (styles/shop.css) in the same pass. */}
      <View style={styles.stage}>
        <View style={styles.stageNameRow}>
          <PlayerName
            name={previewName}
            style={styles.stagePlayerName}
            textStyle={styles.stageName}
            glow={item.sku}
            glowMotion="always"
            glowRadius={16}
          />
        </View>
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
            equippedAppearance={equippedAppearance}
            onBuy={onBuy}
            onEquip={onEquip}
          />
        </View>
      </View>
    </View>
  );
}

/**
 * One bounded photographic stage for every background card.
 *
 * The stock London card used React Native Image while purchased cities used
 * expo-image. More importantly, both images owned `width: '100%'` directly
 * inside a padded fixed-width card. At two columns that percentage could resolve
 * against the card's outer width, spill through the padding, and paint over the
 * next tile. The View owns geometry now; the image is absolutely contained and
 * cannot influence or escape layout.
 */
function BackgroundThumb({ url = null }: { url?: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const remoteUrl = url && url !== failedUrl ? url : null;

  return (
    <View style={styles.bgThumb}>
      <ExpoImage
        source={remoteUrl ? { uri: remoteUrl } : STOCK_BACKGROUND}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        placeholder={remoteUrl ? STOCK_BACKGROUND : undefined}
        placeholderContentFit="cover"
        transition={0}
        onError={remoteUrl ? () => setFailedUrl(remoteUrl) : undefined}
      />
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
 * The glow variant reuses the section's own stage verbatim with `glow={null}`,
 * so the plain white name is drawn by the very same
 * <PlayerName> the game draws it with. The marker variant reuses the compact
 * card and the untinted pin, which is literally what the map falls back to.
 */
function DefaultCard({
  kind,
  previewName,
  backgroundCardWidth,
  equipped,
  busy,
  disabled,
  equippedAppearance,
  onEquip,
}: {
  kind: Category;
  previewName: string;
  backgroundCardWidth?: number;
  equipped: boolean;
  busy: boolean;
  disabled: boolean;
  equippedAppearance: EquippedAppearance;
  onEquip: () => void;
}) {
  const isGlow = kind === 'glow';
  const isBackground = kind === 'background';

  // THE STOCK BACKGROUND IS A PLACE AND IT SAYS SO. It is a photograph of
  // Trafalgar Square at dusk (lib/siteBackground.js), sitting in a grid of ten
  // named, flagged cities — calling it "Default" made the one city everybody
  // already owns the only card that would not tell you where it was. The other
  // two baselines keep the locale label, because there is no city behind "no
  // glow" or "the stock pin". Same two literals as web's DEFAULT_ITEMS, and
  // deliberately untranslated for the same reason: it is a proper noun in a
  // shelf of proper nouns.
  if (isBackground) {
    return (
      <View
        style={[
          styles.bgCard,
          backgroundCardWidth !== undefined && { width: backgroundCardWidth },
          equipped && equippedAppearance.card,
        ]}
      >
        <BackgroundThumb />
        <View style={styles.bgCardBottom}>
          <View style={styles.cardTitleWrap}>
            <View style={styles.bgNameRow}>
              <Text style={[styles.cardName, styles.bgNameText]} numberOfLines={1}>London</Text>
              <CountryFlag countryCode="gb" size={11} />
            </View>
            <Text style={styles.cardNote} numberOfLines={1}>{t('shopDefaultName')}</Text>
          </View>
          <View style={styles.bgActionWrap}>
            <Pressable
              onPress={onEquip}
              disabled={disabled || busy || equipped}
              style={({ pressed }) => [
                styles.actionBtn,
                equipped ? equippedAppearance.action : styles.actionBtnOwned,
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

  return (
    <View style={[isGlow ? styles.glowCard : styles.card, equipped && equippedAppearance.card]}>
      {isGlow ? (
        <View style={styles.stage}>
          <View style={styles.stageNameRow}>
            {/* glow={null} IS the product of this card. */}
            <PlayerName
              name={previewName}
              style={styles.stagePlayerName}
              textStyle={styles.stageName}
              glow={null}
            />
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
              equipped ? equippedAppearance.action : styles.actionBtnOwned,
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

/**
 * A city. THE PHOTOGRAPH IS THE PITCH, which is why this is its own card shape
 * rather than a row in ShopCard: a background is the only thing on this shelf
 * whose entire product is an image, and a 22px thumbnail beside a name would be
 * selling a picture nobody can see. Same reasoning as the glow stages above.
 *
 * THE IMAGE IS THE REAL FILE, over the network, at the same URL the menu will
 * paint (src/services/siteBackground.ts). Bundling ten preview thumbnails would
 * be 2.5MB in the download and a second set of art to keep in sync with the
 * first. expo-image caches to disk, so scrolling the shelf twice costs one
 * fetch — and it is the same cache the equip then reads from, so buying a
 * background you have already looked at paints instantly.
 */
function BackgroundCard({
  item,
  cardWidth,
  owned,
  equipped,
  affordable,
  busy,
  disabled,
  equippedAppearance,
  onBuy,
  onEquip,
}: {
  item: ShelfItem;
  cardWidth: number;
  owned: boolean;
  equipped: boolean;
  affordable: boolean;
  busy: boolean;
  disabled: boolean;
  equippedAppearance: EquippedAppearance;
  onBuy: () => void;
  onEquip: (unequip: boolean) => void;
}) {
  const url = item.sku ? backgroundUrlForSku(item.sku) : null;

  return (
    <View style={[styles.bgCard, { width: cardWidth }, equipped && equippedAppearance.card]}>
      {/* The stock photo holds this frame while a city downloads, and remains
          the fallback for an unknown sku or failed request. */}
      <BackgroundThumb url={url} />

      <View style={styles.bgCardBottom}>
        <View style={styles.cardTitleWrap}>
          <View style={styles.bgNameRow}>
            <Text style={[styles.cardName, styles.bgNameText]} numberOfLines={1}>{item.name}</Text>
            {/* THE FLAG IS AN IMAGE, NEVER AN EMOJI — flagcdn through
                CountryFlag, the same one every username on the site draws.
                Backgrounds are the only shelf carrying `cc`. */}
            {item.cc ? <CountryFlag countryCode={item.cc} size={11} /> : null}
          </View>
          <BuyCount item={item} />
        </View>
        <View style={styles.bgActionWrap}>
          <CardAction
            item={item}
            owned={owned}
            equipped={equipped}
            affordable={affordable}
            busy={busy}
            disabled={disabled}
            equippedAppearance={equippedAppearance}
            onBuy={onBuy}
            onEquip={onEquip}
          />
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
  equippedAppearance,
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
  equippedAppearance: EquippedAppearance;
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
    (equipped || (item.type === 'emote' && inBar)) && equippedAppearance.card,
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
            <Text
              style={[
                styles.cardGlyph,
                item.emoteId === 'gg' && styles.cardGlyphGg,
                item.fx === 'ember' && styles.cardGlyphEmber,
              ]}
            >
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
          {/* The consumable pass uses this line for the decision-changing daily
              limit. Public buy counts add no useful context here and made the
              actual restriction invisible until the server refused a buy. */}
          {item.sku === ADFREE_SKU ? (
            <Text style={[styles.cardNote, styles.passLimit]} numberOfLines={2}>
              {t('shopPassDailyCap', { count: ADFREE_DAILY_CAP })}
            </Text>
          ) : (
            <BuyCount item={item} />
          )}
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
          equippedAppearance={equippedAppearance}
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
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    zIndex: 10,
  },
  // Equal side reservations keep the title physically centred even though the
  // wallet is wider than the close button. Their width is window-derived at the
  // call site, so split view and rotation recompute rather than squeeze.
  headerSide: {
    flexShrink: 0,
    alignItems: 'flex-start',
  },
  headerSideRight: {
    alignItems: 'flex-end',
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
    flex: 1,
    minWidth: 0,
    fontFamily: 'Lexend-Bold',
    fontSize: fontSizes['3xl'],
    color: colors.white,
    textAlign: 'center',
  },
  walletAnchor: {
    position: 'relative',
    alignItems: 'flex-end',
    zIndex: 20,
  },
  wallet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: '100%',
    minHeight: 44,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    // The dark fill and the gold figures ARE the pill — the 1px gold ring it
    // wore was the border-on-everything habit, gone shop-wide Aug 11.
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  walletPressed: {
    opacity: 0.82,
  },
  walletValue: {
    flexShrink: 1,
    minWidth: 0,
    fontFamily: 'Lexend-SemiBold',
    fontSize: SHOP_WALLET_VALUE_SIZE,
    color: '#FDE047',
    fontVariant: ['tabular-nums'],
  },
  walletHelp: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    borderRadius: borderRadius.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  walletHelpTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.sm,
    color: '#FDE047',
  },
  walletHelpBody: {
    fontFamily: 'Lexend',
    fontSize: fontSizes.xs,
    lineHeight: 18,
    color: 'rgba(255, 255, 255, 0.84)',
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
    minHeight: 44,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    // Reserved, transparent: the active chip paints the accent primary into
    // this slot (see the inline style at the call site) — the game's own
    // active-pill recipe. At rest the fill is the whole chip.
    borderWidth: 1,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  jumpChipHit: {
    minHeight: 42,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jumpChipPressed: {
    opacity: 0.82,
  },
  /* jumpChipPressed is GONE from here: its one property follows the equipped
     background, and a StyleSheet is frozen at module load. Inline at the chip. */
  // "You are here" is an OUTLINE, deliberately not a filled pill: a filled chip
  // in a row of chips reads as a selected filter, while this row is navigation
  // through one continuous storefront. Mirrors the web shop's treatment.
  jumpChipText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.sm,
    lineHeight: 18,
    color: colors.white,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  // Sections
  section: {
    marginBottom: spacing.md,
  },
  // The heading alone — the what-this-is line under it went with web's, same
  // ruling. A size up now that it carries the section by itself.
  sectionHead: {
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    fontFamily: 'Lexend-Bold',
    fontSize: fontSizes['2xl'],
    color: colors.white,
  },
  loadingJumpRow: {
    minHeight: 44,
    alignItems: 'center',
  },
  loadingJumpChip: {
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  loadingState: {
    flex: 1,
    paddingTop: spacing.sm,
  },
  loadingSkeleton: {
    gap: spacing.xl,
  },
  loadingShelf: {
    gap: spacing.sm,
  },
  loadingSectionTitle: {
    width: 112,
    height: 26,
    borderRadius: borderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  loadingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  loadingCard: {
    width: '48%',
    minWidth: 128,
    flexGrow: 1,
    height: 132,
    padding: spacing.sm,
    gap: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: SHOP_CARD_SURFACE_COLOR,
  },
  loadingPreview: {
    height: 68,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  loadingLine: {
    width: '74%',
    height: 10,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  loadingLineShort: {
    width: '46%',
    opacity: 0.72,
  },
  notice: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: borderRadius.lg,
    // Reserved for noticeError's red — a stroke only ever speaks state.
    borderWidth: 1,
    borderColor: 'transparent',
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
    // backgroundColor is applied inline at the call site — it follows the
    // equipped background and a StyleSheet cannot.
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
    backgroundColor: SHOP_CARD_SURFACE_COLOR,
    borderRadius: borderRadius.lg,
    // Transparent at rest — the width is reserved so cardEquipped's green can
    // land without a layout shift, and the tone step against the screen is
    // what makes it a card. Same call as web's .shopCard.
    borderWidth: 1.5,
    borderColor: 'transparent',
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
    backgroundColor: SHOP_CARD_SURFACE_COLOR,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
    padding: spacing.sm,
    gap: spacing.xs,
  },
  // Equipped card colors are resolved from useSiteAccent at the screen root and
  // passed down as one appearance object. Keeping them in this static sheet is
  // what left purple, blue and red backgrounds wearing stock green selection.
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
  passLimit: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 11,
    color: colors.textSecondary,
  },
  cardGlyph: {
    fontSize: 22,
  },
  // GG is the catalogue's only text glyph. Native emoji keep their own colour,
  // but plain text otherwise inherits the platform default and turns black.
  cardGlyphGg: {
    fontFamily: 'Lexend-Bold',
    color: colors.white,
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
  // The pin thumbnail. The PNG canvas is 150x163 — the 87x131 art plus glow
  // headroom (see lib/markerIcons.js) — so the box declares the CANVAS ratio
  // and is sized to render the ART at the same ~22x33 it was shown at when the
  // art filled the file edge-to-edge. Any glow painted in the headroom shows
  // on the card instead of being cropped by a tight box.
  cardPin: {
    width: 38,
    height: 41,
    // Canvas arithmetic, mirrored from web's .shopPrev--marker img: every pin
    // ships on the 150x163 spec (lib/markerIcons.js) — 87x131 art, about 32px glow
    // headroom above and beside it, none below (the needle tip IS the map
    // anchor) — so centring the canvas hangs the art (32/2)/163 = 9.8% low.
    // Lift = height x 0.098 = 4.02 -> 4.
    transform: [{ translateY: -4 }],
  },
  // A CITY, AT THE SHAPE IT WILL BE SEEN IN. The screen computes an exact width
  // from the current safe window: two-up on ordinary phones, up to four-up on
  // tablets/landscape, and one-up only when two honest 160px previews cannot fit.
  bgCard: {
    backgroundColor: SHOP_CARD_SURFACE_COLOR,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
    padding: spacing.sm,
    gap: spacing.sm,
    // The preview frame below is already bounded, and this is the final safety
    // boundary: a native image must never paint into the neighbouring tile.
    overflow: 'hidden',
  },
  // One stable stage shape for every city. The source art varies from 16:9 to
  // 4:3, so `cover` makes a restrained centre crop without stretching it.
  // `overflow: hidden` keeps the image inside the radius.
  bgThumb: {
    alignSelf: 'stretch',
    aspectRatio: 16 / 9,
    borderRadius: borderRadius.md,
    backgroundColor: '#05070A',
    overflow: 'hidden',
  },
  // Name and flag on one baseline. The flag never shrinks the name off the row:
  // the name takes the slack and ellipsises, the flag is 11px of fixed width.
  bgNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  bgNameText: {
    flexShrink: 1,
  },
  // Compact background cards stack their caption and action. Keeping the old
  // 104px action beside the title is what forced every city into a phone-width
  // banner even though the photograph itself is legible at this shelf's floor.
  bgCardBottom: {
    alignSelf: 'stretch',
    gap: spacing.xs,
  },
  bgActionWrap: {
    alignSelf: 'stretch',
  },
  // THE PLATE IS BACK (second ruling — see GlowCard's doc). Tone and radius
  // are bgThumb's recess, so the shop keeps ONE recessed-dark treatment
  // rather than growing a second. Still NO CLIP: GLOW_CLIP_RELIEF is real paint
  // room on all four sides, so even the animated layers' radius PLUS travel dies
  // inside the dark plate instead of crossing its rectangular colour boundary.
  stage: {
    minHeight: GLOW_STAGE_LINE_HEIGHT + (GLOW_CLIP_RELIEF * 2),
    paddingHorizontal: GLOW_CLIP_RELIEF,
    paddingVertical: GLOW_CLIP_RELIEF,
    backgroundColor: '#05070A',
    borderRadius: borderRadius.md,
    overflow: 'visible',
  },
  stageNameRow: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  // Give PlayerName an explicit row width so a long account name ellipsises
  // inside the 34px safety area instead of pushing the halo toward a plate edge.
  stagePlayerName: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    overflow: 'visible',
  },
  stageName: {
    fontFamily: 'Lexend-Bold',
    fontSize: 24,
    lineHeight: GLOW_STAGE_LINE_HEIGHT,
    color: colors.white,
  },
  // The white "on light" check strip that used to sit at the bottom of every
  // stage is DELETED, along with checkNameRow / checkName / checkLabel. One
  // stage, black, matching the web card. The light COLOURS stay: see the
  // GlowCard doc comment.

  // motionChip / motionDot / motionText ARE DELETED — the gold "Animated"
  // micro-pill, called complete AI slop by name. An animated glow says so by
  // moving; web deleted its copy (.shopPrev__motion) in the same pass.
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
    // ONE HEIGHT FOR EVERY VARIANT. Buy is the only one carrying a picture, so
    // without a floor it is as tall as the mark while Equip is as tall as its
    // word, and the two sit side by side across a grid row. 14 is this style's
    // own vertical chrome: 6px padding twice plus the 1px border twice below.
    minHeight: STAMP_MARK_SIZE_BTN + 14,
    // The border is reserved HERE, transparent, so every variant is the same box
    // whether or not it colours one in. Only actionBtnBuy used to declare it,
    // which made buy 2px taller than Equip on top of everything else.
    borderWidth: 1,
    borderColor: 'transparent',
  },
  buyButtonMotionWrap: {
    flexGrow: 1,
    flexShrink: 1,
    alignSelf: 'stretch',
    minHeight: STAMP_MARK_SIZE_BTN + 14,
  },
  actionBtnBuy: {
    // Green is reserved for the action that spends stamps, matching web. The
    // brighter edge separates the control from the now-opaque card surface.
    backgroundColor: colors.primary,
    borderColor: colors.success,
  },
  actionBtnBuyUnavailable: {
    // Affordability changes whether the action is available, never whether its
    // price is legible. Keep the whole price row at full opacity and neutralise
    // only the button chrome while it cannot be pressed.
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderColor: 'rgba(255, 255, 255, 0.22)',
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
  // The equipped action uses the same dynamic appearance as its card frame.
  // NOT ON THE WHEEL: the invitation. Neutral white chrome so it does not claim
  // to be the green buy button, and the ＋ is the same sign the empty cells on
  // the wheel above are drawing — that hole and this card are the two ends of
  // one gesture. Web's .shopCard__tag--add, verbatim.
  actionBtnAdd: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  // ON THE WHEEL: the state, in the light blue every "already on" control in
  // this app wears (it is --gradBlue's own light stop, same as actionBtnEquipped
  // one rule up).
  actionBtnOnWheel: {
    backgroundColor: 'rgba(112, 112, 255, 0.24)',
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
  priceText: {
    fontFamily: 'Lexend-Bold',
    // Sized against the mark it sits beside, and that is the ACTION ROW's mark
    // (STAMP_VALUE_SIZE_BTN === 14 === fontSizes.sm, the size the word "Equip"
    // beside it runs at). NOT STAMP_VALUE_SIZE — that is 28, tuned for the 45px
    // mark in the header wallet, and it is what made this button a giant.
    fontSize: STAMP_VALUE_SIZE_BTN,
    color: colors.white,
    fontVariant: ['tabular-nums'],
  },
});
