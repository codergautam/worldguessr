import { Platform } from 'react-native';
import mobileAds, {
  InterstitialAd,
  AdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

const TESTING = process.env.EXPO_PUBLIC_ADMOB_TESTING === 'true';

const PROD_INTERSTITIAL_ID = Platform.select({
  ios: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS_ID,
  android: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID,
});

const INTERSTITIAL_UNIT_ID = TESTING
  ? TestIds.INTERSTITIAL
  : PROD_INTERSTITIAL_ID || TestIds.INTERSTITIAL;

let initPromise: Promise<void> | null = null;

export function initAds(): Promise<void> {
  if (!initPromise) {
    initPromise = mobileAds()
      .initialize()
      .then(() => undefined)
      .catch((err) => {
        console.warn('[ads] init failed', err);
      });
  }
  return initPromise;
}

let interstitial: InterstitialAd | null = null;
let interstitialLoading = false;

function ensureInterstitial(): InterstitialAd {
  if (interstitial) return interstitial;
  interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_UNIT_ID, {
    requestNonPersonalizedAdsOnly: false,
  });
  interstitial.addAdEventListener(AdEventType.LOADED, () => {
    interstitialLoading = false;
  });
  interstitial.addAdEventListener(AdEventType.ERROR, (err) => {
    interstitialLoading = false;
    console.warn('[ads] interstitial error', err);
  });
  interstitial.addAdEventListener(AdEventType.CLOSED, () => {
    interstitial = null;
    preloadInterstitial();
  });
  return interstitial;
}

export function preloadInterstitial(): void {
  if (interstitialLoading) return;
  const ad = ensureInterstitial();
  if (ad.loaded) return;
  interstitialLoading = true;
  try {
    ad.load();
  } catch (err) {
    interstitialLoading = false;
    console.warn('[ads] interstitial load failed', err);
  }
}

export function showInterstitial(): boolean {
  const ad = ensureInterstitial();
  if (!ad.loaded) {
    preloadInterstitial();
    return false;
  }
  try {
    ad.show();
    return true;
  } catch (err) {
    console.warn('[ads] interstitial show failed', err);
    return false;
  }
}

// ── Frequency-capped game interstitials ──────────────────────────────────────
// Policy (intentionally minimal & non-intrusive):
//  • NEVER on first app load — the app-open timestamp seeds `lastInterstitialAt`,
//    so the first eligible ad can only fire 5 minutes into the session.
//  • Only shown when *opening* or *replaying* singleplayer / ranked duel /
//    unranked duel (NOT parties, daily challenge, or community maps).
//  • At most one interstitial per AD_INTERVAL_MS (5 min), measured from the last
//    ad shown — or from app open if none has been shown yet.
const AD_INTERVAL_MS = 5 * 60 * 1000;

// Seeded to app-open time: guarantees no ad within the first 5 minutes.
let lastInterstitialAt = Date.now();

/** Game modes that are eligible for interstitials. */
export type AdGameContext = 'singleplayer' | 'rankedDuel' | 'unrankedDuel';

const AD_ELIGIBLE_CONTEXTS: ReadonlySet<AdGameContext> = new Set([
  'singleplayer',
  'rankedDuel',
  'unrankedDuel',
]);

/**
 * Show an interstitial when opening / replaying an eligible game, subject to the
 * 5-minute frequency cap. Safe to call on every game start — gating is internal.
 * Returns true only if an ad was actually displayed.
 */
export function maybeShowGameInterstitial(context: AdGameContext): boolean {
  if (!AD_ELIGIBLE_CONTEXTS.has(context)) return false;

  const now = Date.now();
  if (now - lastInterstitialAt < AD_INTERVAL_MS) {
    // Within cap window — keep one warm for the next eligible moment.
    preloadInterstitial();
    return false;
  }

  const shown = showInterstitial();
  if (shown) {
    lastInterstitialAt = now;
  }
  return shown;
}
