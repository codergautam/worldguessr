import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useMemo } from 'react';
import { create } from 'zustand';
import { getBackground } from '../shared/cosmetics';
import { backgroundUrlForSku, siteAccentFor, type SiteAccent } from '../services/siteBackground';
import { useAuthStore } from './authStore';

/* ===========================================================================
 *  WHICH BACKGROUND THIS DEVICE SHOULD PAINT, INCLUDING BEFORE IT KNOWS.
 *
 *  The equipped sku lives on the account, and the account is a network
 *  round-trip: authStore keeps only the SECRET in SecureStore and rebuilds
 *  `user` by calling the server on every cold start. So an owner who has paid
 *  for New York would launch the app, see the stock London photograph under a
 *  green menu, and watch both change a second later once auth resolved.
 *
 *  The device is the only place a per-device answer can live before the network
 *  answers, so the last equipped sku is remembered here and replayed at
 *  startup. This is the same contract lib/siteBackground.js documents for web's
 *  `wg_site_bg` localStorage key, and it has the same rule: THE CACHE IS NEVER
 *  THE TRUTH. The moment the session resolves — signed in, signed out, or
 *  signed in with nothing equipped — its answer replaces this one and is
 *  written back.
 *
 *  COST TO EVERYBODY ELSE, which is what shapes it: one AsyncStorage read at
 *  startup that returns null. No request, no decode, no component.
 * ======================================================================== */

const STORAGE_KEY = 'wg_bg_sku';

interface SiteBackgroundState {
  /** Best known equipped sku: the remembered one until auth resolves, then the real one. */
  sku: string | null;
}

export const useSiteBackgroundStore = create<SiteBackgroundState>(() => ({ sku: null }));

/**
 * The VIEWER's menu chrome colours for whatever they have equipped.
 *
 * MENUS ONLY, and that is a decision rather than an oversight — it is just a
 * wider one than it used to be. This was home-only, which left an owner of the
 * New York background looking at a purple photograph through a green storefront,
 * a green settings sheet and a green profile. The tint now reaches every menu a
 * player can open. It still stops dead at gameplay: the HUD, the map, the
 * results and every win/loss, +XP and health colour stay green, because green
 * there means GOOD and a cosmetic does not get to argue with that. Web draws the
 * same line as a named list of selectors in styles/globals.scss; here the scope
 * is simply which files call this.
 *
 * A PUBLIC PROFILE DOES NOT USE THIS ONE. It shows somebody else, so its colours
 * come from THEIR sku via siteAccentFor() directly — see ProfileView. This hook
 * is the reader's own and nothing else.
 *
 * Memoised on the sku, so the components reading it re-render on an equip and on
 * nothing else.
 */
export function useSiteAccent(): SiteAccent {
  const sku = useSiteBackgroundStore((s) => s.sku);
  return useMemo(() => siteAccentFor(sku), [sku]);
}

/**
 * True once the session has given a real answer. Until then the remembered sku
 * stands; after it, the remembered sku is stale by definition and the startup
 * read must not be allowed to overwrite the live one if it lands late.
 */
let authoritative = false;
let subscribed = false;

function warm(sku: string | null): void {
  const url = backgroundUrlForSku(sku);
  // Fire and forget. A failed prefetch costs nothing — SiteBackground still
  // renders, and falls back to the bundled image if the load itself fails.
  if (url) Image.prefetch(url, 'memory-disk').catch(() => {});
}

function adopt(next: string | null): void {
  authoritative = true;
  if (useSiteBackgroundStore.getState().sku === next) return;
  useSiteBackgroundStore.setState({ sku: next });
  warm(next);
  // A sku the catalogue does not know is stored as "nothing" rather than
  // written through: it would only be read back and rejected next launch.
  const toStore = getBackground(next) ? next : null;
  const write = toStore
    ? AsyncStorage.setItem(STORAGE_KEY, toStore)
    : AsyncStorage.removeItem(STORAGE_KEY);
  write.catch(() => { /* storage full / unavailable: one frame of the default */ });
}

/**
 * Read back the last equipped sku and start tracking the session.
 *
 * Called once from app/_layout.tsx during startup. It is deliberately NOT
 * awaited before the splash hides: this decides which photograph is prettier,
 * not whether the app works, and a stalled storage read must never hold the
 * app closed.
 */
export async function hydrateSiteBackground(): Promise<void> {
  if (!subscribed) {
    subscribed = true;
    // isLoading is authStore's "still resolving" flag — the mobile equivalent
    // of web's `session !== false` check in pages/_app.js. Adopting while it is
    // true would read a null user as "signed out" and clear a real background.
    useAuthStore.subscribe((state) => {
      if (state.isLoading) return;
      adopt(state.user?.cosmetics?.equipped?.background ?? null);
    });
    // subscribe() only fires on CHANGES, so a session that had already resolved
    // before this ran would never be picked up.
    const now = useAuthStore.getState();
    if (!now.isLoading) adopt(now.user?.cosmetics?.equipped?.background ?? null);
  }

  if (authoritative) return;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    // Re-checked after the await: the session can resolve while this read is in
    // flight, and the live answer always wins over the remembered one.
    if (authoritative || !getBackground(stored)) return;
    useSiteBackgroundStore.setState({ sku: stored });
    warm(stored);
  } catch {
    /* private mode / unavailable storage: the stock background stands */
  }
}
