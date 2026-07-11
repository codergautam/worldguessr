import { AppState, Platform } from 'react-native';
import mobileAds, {
  InterstitialAd,
  AdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';
import {
  getTrackingPermissionsAsync,
  requestTrackingPermissionsAsync,
} from 'expo-tracking-transparency';
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

// ── App Tracking Transparency (iOS) ──────────────────────────────────────────
// App Store Guideline 2.1/5.1.2: the ATT prompt must be shown BEFORE any data
// that could be used to track the user is collected. The Google Mobile Ads SDK
// reads the IDFA the moment it initializes, so initAds() awaits the ATT
// resolution before calling mobileAds().initialize(). Until (and unless) the
// user grants tracking, every ad request is flagged non-personalized.
// Android has no ATT — personalized ads are allowed there by default.
let personalizedAdsAllowed = Platform.OS !== 'ios';

function waitForAppActive(): Promise<void> {
  if (AppState.currentState === 'active') return Promise.resolve();
  return new Promise((resolve) => {
    // Poll alongside the listener: at cold launch AppState.currentState can be
    // a stale 'unknown'/'inactive' snapshot, and if the inactive→active event
    // slipped past before we subscribed, no further 'change' would ever fire —
    // hanging ATT and, behind it, all ad init. The poll self-heals that.
    const finish = () => {
      sub.remove();
      clearInterval(poll);
      resolve();
    };
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') finish();
    });
    const poll = setInterval(() => {
      if (AppState.currentState === 'active') finish();
    }, 500);
  });
}

async function requestTrackingConsent(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    let { status } = await getTrackingPermissionsAsync();
    if (status === 'undetermined') {
      // iOS silently refuses to present the ATT alert unless the app is in the
      // active state — cold launches briefly report 'inactive'/'unknown', and a
      // request fired in that window resolves denied WITHOUT ever showing the
      // dialog. Wait for 'active' before asking.
      await waitForAppActive();
      ({ status } = await requestTrackingPermissionsAsync());
    }
    personalizedAdsAllowed = status === 'granted';
  } catch (err) {
    // Never let a consent failure block ads entirely — fall through with
    // personalizedAdsAllowed still false (non-personalized requests only).
    console.warn('[ads] ATT request failed', err);
  }
}

let initPromise: Promise<void> | null = null;

export function initAds(): Promise<void> {
  if (!initPromise) {
    initPromise = requestTrackingConsent()
      .then(() => mobileAds().initialize())
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
    // Personalized only with explicit ATT consent on iOS (always ok on
    // Android). Interstitials are recreated after every CLOSED, so a request
    // built before consent resolves self-corrects on the next ad.
    requestNonPersonalizedAdsOnly: !personalizedAdsAllowed,
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
export type AdGameContext = 'singleplayer' | 'rankedDuel' | 'unrankedDuel' | '2v2';

const AD_ELIGIBLE_CONTEXTS: ReadonlySet<AdGameContext> = new Set([
  'singleplayer',
  'rankedDuel',
  'unrankedDuel',
  '2v2',
]);

/**
 * Show an interstitial when opening / replaying an eligible game, subject to the
 * 5-minute frequency cap. Safe to call on every game start — gating is internal.
 * Returns true only if an ad was actually displayed.
 */
export function maybeShowGameInterstitial(context: AdGameContext): boolean {
  // Delegate to the awaitable path fire-and-forget: it carries the identical
  // supporter/eligibility/cap gating PLUS the audio duck around the show
  // (web crazyMidgame parity) — a second show-path without the duck let
  // singleplayer interstitials play over full-volume game audio. Callers of
  // this variant ignore the return by design, so the fire-and-forget shape
  // is safe; the boolean now only reports "an attempt was dispatched".
  if (isSupporter()) return false;
  if (!AD_ELIGIBLE_CONTEXTS.has(context)) return false;
  void runGameInterstitial(context);
  return true;
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
      unduck();
      unsubClosed();
      unsubError();
      resolve();
    };
    const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, finish);
    const unsubError = ad.addAdEventListener(AdEventType.ERROR, finish);
    // Collapse game audio around the full-screen interstitial (web
    // crazyMidgame parity; AdMob may already silence the app — this
    // guarantees it either way). Lazy import: ads.ts must not become part of
    // the sound module's import graph at startup.
    const unduck = () => {
      import('./sound').then(({ duckAudio }) => duckAudio(false)).catch(() => {});
    };
    import('./sound').then(({ duckAudio }) => duckAudio(true)).catch(() => {});
    try {
      ad.show();
      lastInterstitialAt = now;
    } catch (err) {
      console.warn('[ads] interstitial show failed', err);
      finish();
    }
  });
}
