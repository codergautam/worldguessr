import { AppState, Platform } from 'react-native';
import mobileAds, {
  AdsConsent,
  AdsConsentPrivacyOptionsRequirementStatus,
  InterstitialAd,
  AdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';
import {
  getTrackingPermissionsAsync,
  requestTrackingPermissionsAsync,
} from 'expo-tracking-transparency';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

// ── GDPR consent (Google UMP) ────────────────────────────────────────────────
// EEA/UK/CH ad requests without a TCF v2.2 consent string from a Google-certified
// CMP only get "limited ads" (or no fill). gatherConsent() shows the consent
// form configured in AdMob > Privacy & messaging when the user's region needs
// it, and resolves immediately elsewhere. The SDK reads the stored TCF string
// on every request, so no per-request flag is needed.
let canRequestAds = false;

async function gatherAdsConsent(): Promise<void> {
  try {
    // Same active-state requirement as the ATT alert below: the form is a
    // native modal and cold launches briefly report 'inactive'.
    await waitForAppActive();
    await AdsConsent.gatherConsent();
  } catch (err) {
    // Network/form failure: a consent choice cached from a previous session
    // may still allow requests, so fall through to the canRequestAds check.
    console.warn('[ads] consent gathering failed', err);
  }
  try {
    ({ canRequestAds } = await AdsConsent.getConsentInfo());
  } catch (err) {
    console.warn('[ads] consent info failed', err);
  }
}

/** Whether Settings must offer the "ad privacy choices" entry (EEA users). */
export async function isAdPrivacyOptionsRequired(): Promise<boolean> {
  try {
    const info = await AdsConsent.getConsentInfo();
    return info.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
  } catch {
    return false;
  }
}

/** Re-open the consent form so the user can change their GDPR choices. */
export async function showAdPrivacyOptions(): Promise<void> {
  try {
    ({ canRequestAds } = await AdsConsent.showPrivacyOptionsForm());
    // A preloaded interstitial was requested under the old choices.
    interstitial = null;
    interstitialLoading = false;
    preloadInterstitial();
  } catch (err) {
    console.warn('[ads] privacy options form failed', err);
  }
}

// ── App Tracking Transparency (iOS) ──────────────────────────────────────────
// App Store Guideline 2.1/5.1.2: the ATT prompt must be shown BEFORE any data
// that could be used to track the user is collected. The Google Mobile Ads SDK
// reads the IDFA the moment it initializes, so initAds() awaits the ATT
// resolution before calling mobileAds().initialize(). A denial needs no ad
// request flag: the SDK simply gets no IDFA (forcing non-personalized requests
// on top of that cut iOS eCPM for every non-consenting user).
// Shown after the UMP form, per Google's recommended order.

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
    const { status } = await getTrackingPermissionsAsync();
    if (status === 'undetermined') {
      // iOS silently refuses to present the ATT alert unless the app is in the
      // active state — cold launches briefly report 'inactive'/'unknown', and a
      // request fired in that window resolves denied WITHOUT ever showing the
      // dialog. Wait for 'active' before asking.
      await waitForAppActive();
      await requestTrackingPermissionsAsync();
    }
  } catch (err) {
    // Never let an ATT failure block ads entirely.
    console.warn('[ads] ATT request failed', err);
  }
}

let initPromise: Promise<void> | null = null;

export function initAds(): Promise<void> {
  if (!initPromise) {
    void loadFirstSessionFlag();
    initPromise = gatherAdsConsent()
      .then(() => requestTrackingConsent())
      .then(() => (canRequestAds ? mobileAds().initialize() : undefined))
      .then(() => undefined)
      .catch((err) => {
        console.warn('[ads] init failed', err);
      });
  }
  return initPromise;
}

let interstitial: InterstitialAd | null = null;
let interstitialLoading = false;
let interstitialLoadedAt = 0;
// True while an ad is on screen: an ad click backgrounds the app, and the
// return to 'active' must not discard the instance the caller is awaiting.
let interstitialShowing = false;

// A failed load (no fill, flaky cold-start network) is retried with backoff
// instead of waiting for the next eligible game start to notice nothing's ready.
const RETRY_BASE_MS = 30 * 1000;
const RETRY_MAX_MS = 5 * 60 * 1000;
let retryDelayMs = RETRY_BASE_MS;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

// Preloaded full-screen ads expire about an hour after loading (Google
// guidance); a stale one can fail to show or earn less, so reload before then.
const STALE_AD_MS = 50 * 60 * 1000;

function ensureInterstitial(): InterstitialAd | null {
  if (!INTERSTITIAL_UNIT_ID || !canRequestAds) return null;
  if (interstitial) return interstitial;
  interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_UNIT_ID);
  interstitial.addAdEventListener(AdEventType.LOADED, () => {
    interstitialLoading = false;
    interstitialLoadedAt = Date.now();
    retryDelayMs = RETRY_BASE_MS;
  });
  interstitial.addAdEventListener(AdEventType.ERROR, (err) => {
    interstitialLoading = false;
    console.warn('[ads] interstitial error', err);
    if (!retryTimer) {
      retryTimer = setTimeout(() => {
        retryTimer = null;
        preloadInterstitial();
      }, retryDelayMs);
      retryDelayMs = Math.min(retryDelayMs * 2, RETRY_MAX_MS);
    }
  });
  interstitial.addAdEventListener(AdEventType.CLOSED, () => {
    interstitial = null;
    preloadInterstitial();
  });
  return interstitial;
}

/** Drop the current instance (stale or broken) and start a fresh load. */
function replaceInterstitial(): void {
  interstitial?.removeAllListeners();
  interstitial = null;
  interstitialLoading = false;
  preloadInterstitial();
}

function discardIfStale(): void {
  if (!interstitialShowing && interstitial?.loaded && Date.now() - interstitialLoadedAt > STALE_AD_MS) {
    replaceInterstitial();
  }
}

export function preloadInterstitial(): void {
  if (interstitialLoading) return;
  const ad = ensureInterstitial();
  if (!ad) return;
  if (ad.loaded) return;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  interstitialLoading = true;
  try {
    ad.load();
  } catch (err) {
    interstitialLoading = false;
    console.warn('[ads] interstitial load failed', err);
  }
}

// NOTE: every show path lives in runGameInterstitial below — it wraps the
// show in duckAudio(true/false) (web crazyMidgame parity). Never add a bare
// show helper without the duck: an undocked ad plays over full-volume music.

// ── Frequency-capped game interstitials ──────────────────────────────────────
// Policy (non-intrusive):
//  • NEVER before the player has finished a game this session
//    (markGameFinished, called by the results screen).
//  • A new user's first session is also ad-free for its first 5 minutes.
//  • Only shown when *opening* or *replaying* singleplayer / ranked duel /
//    unranked duel / 2v2 (NOT parties, daily challenge, or community maps).
//  • At most one interstitial per AD_INTERVAL_MS (4 min) after the last one.
const AD_INTERVAL_MS = 4 * 60 * 1000;
const FIRST_SESSION_GRACE_MS = 5 * 60 * 1000;
const FIRST_OPEN_KEY = 'wg_ads_first_open_done';

let lastInterstitialAt = 0;
let sessionStartedAt = Date.now();
let gamesFinishedThisSession = 0;
// Assume a first session until storage says otherwise: fail toward fewer ads.
let isFirstSession = true;

async function loadFirstSessionFlag(): Promise<void> {
  try {
    if (await AsyncStorage.getItem(FIRST_OPEN_KEY)) {
      isFirstSession = false;
    } else {
      await AsyncStorage.setItem(FIRST_OPEN_KEY, '1');
    }
  } catch (err) {
    console.warn('[ads] first-open flag failed', err);
  }
}

/** Results screen hook: a finished game unlocks this session's ads. */
export function markGameFinished(): void {
  gamesFinishedThisSession += 1;
}

// The JS process survives backgrounding, so a long background stint must count
// as a fresh session (and get a fresh finish-a-game-first grace). Short hops
// (notification peek, quick app switch) keep the session running.
const BACKGROUND_RESEED_MS = 30 * 60 * 1000;
let backgroundedAt: number | null = null;
AppState.addEventListener('change', (state) => {
  if (state === 'background') {
    backgroundedAt = Date.now();
  } else if (state === 'active') {
    if (backgroundedAt !== null && Date.now() - backgroundedAt >= BACKGROUND_RESEED_MS) {
      sessionStartedAt = Date.now();
      gamesFinishedThisSession = 0;
      isFirstSession = false;
    }
    backgroundedAt = null;
    discardIfStale();
  }
});

function interstitialAllowedNow(now: number): boolean {
  if (gamesFinishedThisSession < 1) return false;
  if (isFirstSession && now - sessionStartedAt < FIRST_SESSION_GRACE_MS) return false;
  return now - lastInterstitialAt >= AD_INTERVAL_MS;
}

/**
 * Does the signed-in account hold a live Ad-Free Pass?
 *
 * Read through `getState()` at CALL TIME, never a hook: both call sites are
 * plain functions outside React, and a snapshot captured at module load would
 * freeze the pass at whatever it was when the bundle evaluated.
 *
 * FRESHNESS TRAP: `adFreeUntil` only changes when something writes it into
 * authStore — an auth refetch, refreshAccount(), the ws `cosmetics` push, or
 * the shop's own purchase response. The purchase path writes it back directly
 * (see the shop screen) precisely so a pass bought mid-session suppresses the
 * very next interstitial instead of waiting for a relaunch.
 *
 * An unparseable date yields an Invalid Date, whose every comparison is false —
 * i.e. garbage in means ads stay ON, which is the correct fail-open direction
 * for us and the honest one for the user (they can see the ad and complain,
 * rather than silently losing a pass they paid for... which they cannot, since
 * the server is the authority on expiry and a refresh restores the truth).
 */
function isAdFree(): boolean {
  const u = useAuthStore.getState().user;
  return !!u?.adFreeUntil && new Date(u.adFreeUntil) > new Date();
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
 * session/frequency rules above. Safe to call on every game start — gating is internal.
 * Returns true only if an ad was actually displayed.
 */
export function maybeShowGameInterstitial(context: AdGameContext): boolean {
  // Delegate to the awaitable path fire-and-forget: it carries the identical
  // ad-free/eligibility/cap gating PLUS the audio duck around the show
  // (web crazyMidgame parity) — a second show-path without the duck let
  // singleplayer interstitials play over full-volume game audio. Callers of
  // this variant ignore the return by design, so the fire-and-forget shape
  // is safe; the boolean now only reports "an attempt was dispatched".
  if (isAdFree()) return false;
  if (!AD_ELIGIBLE_CONTEXTS.has(context)) return false;
  void runGameInterstitial(context);
  return true;
}

/**
 * Show an eligible interstitial (same context-eligibility + session/frequency
 * rules as {@link maybeShowGameInterstitial}) and resolve ONLY once the user has
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
  if (isAdFree()) return Promise.resolve(); // ad-free pass holders never see ads
  if (!AD_ELIGIBLE_CONTEXTS.has(context)) return Promise.resolve();

  const now = Date.now();
  if (!interstitialAllowedNow(now)) {
    // Not yet eligible — no ad this time; keep one warm for the next moment.
    preloadInterstitial();
    return Promise.resolve();
  }

  discardIfStale(); // a stale ad is skipped this time and reloaded
  const ad = ensureInterstitial();
  if (!ad) return Promise.resolve(); // ads disabled (no unit id or no consent)
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
      interstitialShowing = false;
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
    // show() can also reject asynchronously with no ERROR event (no
    // activity / view controller, native side not ready). Without the catch
    // the caller's await never settles and the Play tap / queue join hangs.
    // A failed show doesn't use up the cap.
    const prevAt = lastInterstitialAt;
    const failShow = (err: unknown) => {
      console.warn('[ads] interstitial show failed', err);
      lastInterstitialAt = prevAt;
      finish();
      replaceInterstitial();
    };
    lastInterstitialAt = now;
    interstitialShowing = true;
    try {
      ad.show().catch(failShow);
    } catch (err) {
      failShow(err);
    }
  });
}
