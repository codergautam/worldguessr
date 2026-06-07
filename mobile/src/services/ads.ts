import { Platform } from 'react-native';
import mobileAds, {
  InterstitialAd,
  AdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';
import { useAuthStore } from '../store/authStore';

// Use Google TEST ads only in dev or when explicitly opted in. In a release
// build with no opt-in, we resolve a REAL prod unit id — or, if none is
// configured, DISABLE ads entirely rather than ever serving test ads to real
// users (AdMob policy violation + zero revenue).
const FORCE_TEST = __DEV__ || process.env.EXPO_PUBLIC_ADMOB_TESTING === 'true';

const PROD_INTERSTITIAL_ID = Platform.select({
  ios: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS_ID,
  android: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID,
});

let INTERSTITIAL_UNIT_ID: string | null;
if (FORCE_TEST) {
  INTERSTITIAL_UNIT_ID = TestIds.INTERSTITIAL; // dev / explicit opt-in only
} else if (PROD_INTERSTITIAL_ID) {
  INTERSTITIAL_UNIT_ID = PROD_INTERSTITIAL_ID; // real ads in release
} else {
  INTERSTITIAL_UNIT_ID = null; // misconfigured release -> ads OFF (fail safe)
  console.error(
    '[ads] Missing EXPO_PUBLIC_ADMOB_INTERSTITIAL_{IOS,ANDROID}_ID in a release build — interstitials DISABLED (refusing to serve TEST ads to real users).',
  );
}

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

function ensureInterstitial(): InterstitialAd | null {
  if (!INTERSTITIAL_UNIT_ID) return null;
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
  if (!ad) return;
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
  if (!ad) return false;
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

/** Supporters never see ads — mirrors web gameUI.js:788 (!session?.token?.supporter).
 * Read lazily via getState() so it always reflects current login/logout state. */
function isSupporter(): boolean {
  return !!useAuthStore.getState().user?.supporter;
}

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
  if (isSupporter()) return false; // supporters never see ads (or preload one)
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

/**
 * Show an eligible interstitial (same context-eligibility + 5-minute frequency
 * cap as {@link maybeShowGameInterstitial}) and resolve ONLY once the user has
 * dismissed it. Resolves immediately when no ad is actually displayed —
 * ineligible context, inside the cap window, or nothing preloaded.
 *
 * Use this (instead of the fire-and-forget variant) to gate anything that must
 * not happen *behind* the ad — above all, joining a matchmaking queue. The
 * server matches players and starts the round on its own clock, so queueing
 * while the interstitial still covers the screen lets the duel begin before the
 * player ever sees it. Awaiting CLOSED keeps the player out of the queue until
 * they're actually looking at the game.
 */
export function runGameInterstitial(context: AdGameContext): Promise<void> {
  if (isSupporter()) return Promise.resolve(); // supporters never see ads
  if (!AD_ELIGIBLE_CONTEXTS.has(context)) return Promise.resolve();

  const now = Date.now();
  if (now - lastInterstitialAt < AD_INTERVAL_MS) {
    // Within cap window — no ad this time; keep one warm for the next moment.
    preloadInterstitial();
    return Promise.resolve();
  }

  const ad = ensureInterstitial();
  if (!ad) return Promise.resolve(); // ads disabled (no configured unit id)
  if (!ad.loaded) {
    // Nothing ready — don't stall the player waiting on a load; warm for later.
    preloadInterstitial();
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    let settled = false;
    // CLOSED = user dismissed; ERROR = failed mid-show. Either way the screen is
    // clear and the caller is free to proceed. No timeout fallback on purpose:
    // resolving while the ad is still up would re-introduce the very bug this
    // guards against (queueing behind the ad).
    const finish = () => {
      if (settled) return;
      settled = true;
      unsubClosed();
      unsubError();
      resolve();
    };
    const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, finish);
    const unsubError = ad.addAdEventListener(AdEventType.ERROR, finish);
    try {
      ad.show();
      lastInterstitialAt = now;
    } catch (err) {
      console.warn('[ads] interstitial show failed', err);
      finish();
    }
  });
}
