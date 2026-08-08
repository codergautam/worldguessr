import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IS_PORTAL_BUILD, backgroundUrlForSku, rememberSiteBackground } from '@/lib/siteBackground';
import { parseAdFreeUntil, useAdFreeCountdown } from '@/lib/adFree';
import {
  entitlementsFrom,
  shopRequest,
  ShopError,
  SLOT_FOR_TYPE,
  withOptimisticBuy,
} from './stampShopClient';

/* ===========================================================================
 *  useStampShop — the ONE owner of shop state for a modal session.
 *
 *  Lifted to components/accountModal.js and passed down, so the wallet chip in
 *  the header and the storefront in the body read the same balance, share the
 *  same catalogue fetch and share ONE countdown interval. Rendering the hook
 *  twice would mean two catalogue fetches and two timers per open, times 2M.
 *
 *  WHERE STATE COMES FROM, IN ORDER:
 *    1. session.token   — googleAuth ships the full entitlement block
 *                         (api/stampShop.js entitlementFields), so the wallet
 *                         paints a real balance on the first frame with no
 *                         network call at all.
 *    2. the catalogue response on open — every catalogue call carries a fresh
 *                         entitlement block, so opening the shop IS the refresh.
 *    3. purchase / equip responses — the authoritative post-write block.
 *
 *  NEVER REFETCH AFTER A WRITE. api/googleAuth caches the auth document for
 *  120s and the purchase endpoint clears that cache, but a client that trusts
 *  a reload instead of the response body is one deploy away from showing a
 *  buyer their old inventory for two minutes. The response is the truth.
 * ======================================================================== */

const EMPTY_STATE = {
  stamps: 0,
  cosmetics: { owned: [], equipped: { background: null, nameGlow: null, markerSkin: null }, emoteOrder: [] },
  adFreeUntil: null,
  stampsEnabled: false,
};

/**
 * Mirror the entitlement block into the optimistic-hydration snapshot.
 *
 * useSession() paints `wg_session_cache` BEFORE the network verify returns
 * (see components/auth/auth.js). Leave it alone and the first frame after a
 * reload shows the pre-purchase balance and the pre-equip cosmetics, then
 * corrects itself a few hundred ms later — a flash of the thing the user just
 * paid to change. Same latch season1NoticeModal.js maintains for its notice.
 */
function patchSessionCache(entitlements) {
  try {
    const raw = window.localStorage.getItem('wg_session_cache');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.secret) return;
    window.localStorage.setItem('wg_session_cache', JSON.stringify({ ...parsed, ...entitlements }));
  } catch (e) {
    // A quota/parse failure costs one stale first frame, which the verify then
    // corrects. Never let it break an equip.
  }
}

/**
 * Repaint the site background for a background equip, right now.
 *
 * pages/_app.js owns this custom property and derives it from the AUTH MODULE's
 * session — which our setSession patch does not touch, so _app's effect will
 * not re-run and will not fight us. This is the same write _app makes, executed
 * early so "equip" means the menu changes under you rather than on the next
 * reload. Portal builds stay pinned to the baked asset
 * (scripts/packageEmbed.mjs rewrites baked refs only), exactly as _app has it.
 *
 * UNEQUIPPING REMOVES THE PROPERTY, it does not write the default URL into it:
 * _document declares `--site-bg` on :root, so removal is what hands the value
 * back to the one place that owns it (see lib/siteBackground.js).
 *
 * The same call records the choice for the pre-paint script, so the equip
 * survives the next reload's first frame instead of flashing the default while
 * auth resolves. Recording it HERE as well as in _app is what makes "equip,
 * refresh" correct even if the user never lets the session settle.
 */
function applyBackground(sku) {
  // The portal guard stays HERE as well as inside the resolver: those builds
  // must not touch the property or the cache at all, and "resolver returned
  // null" would otherwise be indistinguishable from an unequip and clear both.
  if (IS_PORTAL_BUILD || typeof document === 'undefined') return;
  const url = backgroundUrlForSku(sku);
  if (url) document.documentElement.style.setProperty('--site-bg', `url("${url}")`);
  else document.documentElement.style.removeProperty('--site-bg');
  rememberSiteBackground(url);
}

export default function useStampShop({ session, setSession }) {
  const secret = session?.token?.secret || null;

  // Entitlements straight off the session. Recomputed only when the session
  // token object identity changes, which is rare and cheap.
  const sessionEntitlements = useMemo(
    () => entitlementsFrom(session?.token),
    [session?.token],
  );

  // Everything we have learned since mount (catalogue refresh, purchases,
  // equips). Null until the first response, so the session block shows through.
  const [patch, setPatch] = useState(null);
  const state = patch || sessionEntitlements || EMPTY_STATE;

  // FAIL CLOSED. Falsy at any layer means the whole surface renders nothing:
  // no wallet, no nav entry, no storefront. The flag is server-delivered
  // (api/stampShop.js entitlementFields) precisely so it can be switched off in
  // prod without a deploy, so an absent/unknown value must read as OFF.
  const enabled = state.stampsEnabled === true;

  const [catalog, setCatalog] = useState({ status: 'idle', items: [], emotes: [], error: null });
  const [busySku, setBusySku] = useState(null);

  // Refs, not deps: every callback below stays referentially stable so the
  // memoised card list is not thrown away on each balance change.
  const stateRef = useRef(state);
  stateRef.current = state;
  const sessionEntitlementsRef = useRef(sessionEntitlements);
  sessionEntitlementsRef.current = sessionEntitlements;
  // undefined = "we have not looked yet"; null = "no background equipped".
  const paintedBackgroundRef = useRef(undefined);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /**
   * Adopt an entitlement block as the new truth: local state, the in-page
   * session (so the navbar pill and the rest of the tree update), the
   * localStorage snapshot, and the live background.
   */
  const applyEntitlements = useCallback((entitlements) => {
    if (!entitlements) return;

    // Repaint only when the equipped background actually changed. This runs on
    // every catalogue refresh too, and re-asserting the same URL on <html> per
    // open is pointless work. Kept out of the state updater on purpose — a
    // reducer must stay a pure function.
    const nextBackground = entitlements.cosmetics.equipped.background;
    if (paintedBackgroundRef.current === undefined) {
      paintedBackgroundRef.current = sessionEntitlementsRef.current?.cosmetics?.equipped?.background ?? null;
    }
    if (paintedBackgroundRef.current !== nextBackground) {
      paintedBackgroundRef.current = nextBackground;
      applyBackground(nextBackground);
    }

    setPatch(entitlements);
    if (setSession) {
      setSession((prev) => (prev ? { ...prev, token: { ...prev.token, ...entitlements } } : prev));
    }
    patchSessionCache(entitlements);
  }, [setSession]);

  /**
   * Fetch the catalogue. Called ONCE per storefront open (the storefront only
   * mounts while its tab is selected), never per render.
   */
  const refreshCatalog = useCallback(() => {
    setCatalog((prev) => ({ ...prev, status: 'loading', error: null }));
    // The token is optional here by design — a signed-out browse still gets
    // prices, just no balance and nothing owned.
    shopRequest('catalog', secret ? { token: secret } : {})
      .then((data) => {
        if (!mountedRef.current) return;
        if (data.enabled === false) {
          // Kill switch flipped since sign-in. Drop the whole surface.
          applyEntitlements({ ...EMPTY_STATE, stampsEnabled: false });
          setCatalog({ status: 'ready', items: [], emotes: [], error: null });
          return;
        }
        applyEntitlements(entitlementsFrom(data));
        setCatalog({
          status: 'ready',
          items: Array.isArray(data.items) ? data.items : [],
          emotes: Array.isArray(data.emotes) ? data.emotes : [],
          error: null,
        });
      })
      .catch((error) => {
        if (!mountedRef.current) return;
        setCatalog((prev) => ({ ...prev, status: 'error', error }));
      });
  }, [secret, applyEntitlements]);

  /**
   * Buy one sku.
   *
   * `purchaseKey` is minted by the CALLER, once per button press, and passed in
   * unchanged for every retry of that press (see stampShopClient). Resolves
   * with the server response; `duplicate: true` is a success — our retry landed
   * on a charge that already happened. Rejects with a ShopError to render.
   */
  const purchase = useCallback(async (sku, purchaseKey) => {
    if (!secret) throw new ShopError('not_authenticated', 'Signed out', 401, null);
    setBusySku(sku);
    try {
      const data = await shopRequest(
        'purchase',
        { token: secret, sku, purchaseKey },
        { retryOnNetworkError: true },
      );
      applyEntitlements(entitlementsFrom(data));
      // The buy count on that one card, moved on the spot. Nothing is refetched:
      // a catalogue call to move one number by one is a round trip for a label.
      //
      // NOT ON A DUPLICATE. `duplicate: true` is our own network retry landing
      // on a charge that already went through, and the server counted it the
      // first time — bumping here would show one purchase as two.
      //
      // THIS IS THE ONLY LOCAL COPY OF A BUY COUNT, and it lives exactly as long
      // as the open storefront does. The server invalidates its own count cache
      // on the write (api/stampShop.js), so the next open reads the real figure
      // rather than needing this bump remembered anywhere.
      //
      // withOptimisticBuy hands back the SAME array when there is nothing to
      // move, so this setState is a no-op re-render in that case.
      if (!data?.duplicate) {
        setCatalog((prev) => {
          const items = withOptimisticBuy(prev.items, sku);
          return items === prev.items ? prev : { ...prev, items };
        });
      }
      return data;
    } catch (error) {
      // A 402 body carries the CURRENT balance. Adopting it turns "not enough
      // stamps" from a dead end into a corrected number on screen.
      applyEntitlements(entitlementsFrom(error?.payload));
      throw error;
    } finally {
      if (mountedRef.current) setBusySku(null);
    }
  }, [secret, applyEntitlements]);

  /**
   * Equip (or unequip, with sku null) an owned cosmetic.
   *
   * OPTIMISTIC, THEN RECONCILED. The click paints the new equipped state on the
   * spot — an equip that waits on a round trip feels broken — and the server's
   * block replaces it verbatim on success. On failure we put the previous state
   * back, so a rejected equip never leaves a lie on screen. Nothing is
   * refetched either way.
   *
   * `busyKey` is the sku whose BUTTON should lock while this is in flight. It
   * is separate from `sku` because an unequip sends null, and locking on null
   * would leave the card the user just clicked fully live.
   */
  const equip = useCallback(async (type, sku, busyKey = sku) => {
    const slot = SLOT_FOR_TYPE[type];
    if (!slot || !secret) return;

    const before = stateRef.current;
    setBusySku(busyKey || `slot:${slot}`);
    applyEntitlements({
      ...before,
      cosmetics: { ...before.cosmetics, equipped: { ...before.cosmetics.equipped, [slot]: sku || null } },
    });

    try {
      const data = await shopRequest('equip', { token: secret, slot, sku: sku || null });
      applyEntitlements(entitlementsFrom(data));
    } catch (error) {
      applyEntitlements(before);
      throw error;
    } finally {
      if (mountedRef.current) setBusySku(null);
    }
  }, [secret, applyEntitlements]);

  /**
   * Same optimistic/reconcile contract, for the emote bar order.
   *
   * `busyKey` NAMES THE ONE CONTROL THAT SHOULD LOCK, and defaults to the whole
   * bar. It used to be unconditionally 'emoteOrder', which every emote card in
   * the grid also tested — so adding a single emote greyed out all twenty cards
   * for the length of the round trip. One press, twenty dead buttons: it read as
   * the shop breaking, which is exactly what it was reported as. Callers now
   * pass the emote id they are toggling, and only that card dims.
   */
  const equipEmotes = useCallback(async (emoteOrder, busyKey = 'emoteOrder') => {
    if (!secret) return;

    const before = stateRef.current;
    setBusySku(busyKey);
    applyEntitlements({ ...before, cosmetics: { ...before.cosmetics, emoteOrder } });

    try {
      const data = await shopRequest('equip', { token: secret, emoteOrder });
      applyEntitlements(entitlementsFrom(data));
    } catch (error) {
      applyEntitlements(before);
      throw error;
    } finally {
      if (mountedRef.current) setBusySku(null);
    }
  }, [secret, applyEntitlements]);

  // --- Ad-free countdown -------------------------------------------------
  // ONE interval for the whole shop, owned here and handed down. A chip per card
  // with its own timer would be dozens of intervals all re-rendering on
  // different frames. The clock itself lives in lib/adFree.js, which is the one
  // file that knows when a pass ends — the home-screen chip drives the same hook
  // off the session rather than keeping a second copy of the expiry.
  const adFreeMsLeft = useAdFreeCountdown(parseAdFreeUntil(state.adFreeUntil));

  // Owned lookups are hot (every card, every render pass) — a Set beats
  // Array.includes over a list that grows with every purchase.
  const ownedSkus = useMemo(() => new Set(state.cosmetics.owned), [state.cosmetics.owned]);

  return {
    enabled,
    signedIn: !!secret,
    stamps: state.stamps,
    cosmetics: state.cosmetics,
    ownedSkus,
    adFreeMsLeft,
    catalog,
    busySku,
    refreshCatalog,
    purchase,
    equip,
    equipEmotes,
  };
}
