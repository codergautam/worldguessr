import { Capacitor } from '@capacitor/core';

let initializePromise = null;
let interstitialInFlight = false;
let interstitialReady = false;
let interstitialPreparePromise = null;
let lastInterstitialAt = 0;
let lastPrepareAttemptAt = 0;

const MIN_INTERSTITIAL_INTERVAL_MS = 90 * 1000;
const MIN_PREPARE_RETRY_MS = 15 * 1000;
const INTERSTITIAL_SHOW_TIMEOUT_MS = 2 * 60 * 1000;

function getInterstitialOptions() {
  return {
    adId: process.env.NEXT_PUBLIC_ADMOB_INTERSTITIAL_MAIN_ID,
    isTesting: process.env.NEXT_PUBLIC_ADMOB_TESTING === 'true',
  };
}

export function isNativeAdMobConfigured() {
  return !!(
    typeof window !== 'undefined' &&
    Capacitor?.isNativePlatform?.() &&
    process.env.NEXT_PUBLIC_ADMOB_INTERSTITIAL_MAIN_ID
  );
}

export async function initializeNativeAds() {
  if (!isNativeAdMobConfigured()) return false;
  if (initializePromise) return initializePromise;

  initializePromise = (async () => {
    const { AdMob, AdmobConsentStatus } = await import('@capacitor-community/admob');

    await AdMob.initialize({
      initializeForTesting: process.env.NEXT_PUBLIC_ADMOB_TESTING === 'true',
    });

    try {
      const [trackingInfo, consentInfo] = await Promise.all([
        AdMob.trackingAuthorizationStatus(),
        AdMob.requestConsentInfo(),
      ]);
      if (trackingInfo?.status === 'notDetermined') {
        await AdMob.requestTrackingAuthorization();
      }

      if (
        consentInfo?.isConsentFormAvailable &&
        consentInfo?.status === AdmobConsentStatus.REQUIRED &&
        !consentInfo?.canRequestAds
      ) {
        await AdMob.showConsentForm();
      }
    } catch (error) {
      console.warn('[AdMob] Consent flow skipped:', error?.message || error);
    }

    return true;
  })().catch((error) => {
    initializePromise = null;
    throw error;
  });

  return initializePromise;
}

export async function preloadNativeInterstitial(placement = 'main', { force = false } = {}) {
  if (!isNativeAdMobConfigured() || interstitialReady) return interstitialReady;
  if (interstitialPreparePromise) return interstitialPreparePromise;

  const now = Date.now();
  if (!force && now - lastPrepareAttemptAt < MIN_PREPARE_RETRY_MS) {
    return false;
  }
  lastPrepareAttemptAt = now;

  interstitialPreparePromise = (async () => {
    try {
      await initializeNativeAds();
      const { AdMob } = await import('@capacitor-community/admob');
      await AdMob.prepareInterstitial(getInterstitialOptions());
      interstitialReady = true;
      return true;
    } catch (error) {
      interstitialReady = false;
      console.warn(`[AdMob] Interstitial preload failed (${placement}):`, error?.message || error);
      return false;
    } finally {
      interstitialPreparePromise = null;
    }
  })();

  return interstitialPreparePromise;
}

export async function showNativeInterstitial(placement = 'main') {
  if (!isNativeAdMobConfigured() || interstitialInFlight) return false;

  const now = Date.now();
  if (now - lastInterstitialAt < MIN_INTERSTITIAL_INTERVAL_MS) return false;

  if (!interstitialReady) {
    preloadNativeInterstitial(placement).catch(() => {});
    return false;
  }

  interstitialInFlight = true;
  let dismissedListener = null;
  let failedToShowListener = null;
  let timeoutId = null;
  try {
    const { AdMob, InterstitialAdPluginEvents } = await import('@capacitor-community/admob');
    const closedPromise = new Promise((resolve) => {
      let settled = false;
      const finish = (shown) => {
        if (settled) return;
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        resolve(shown);
      };

      dismissedListener = AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => finish(true));
      failedToShowListener = AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, () => finish(false));
      timeoutId = setTimeout(() => finish(true), INTERSTITIAL_SHOW_TIMEOUT_MS);
    });
    dismissedListener = await dismissedListener;
    failedToShowListener = await failedToShowListener;

    await AdMob.showInterstitial();
    const shown = await closedPromise;
    interstitialReady = false;
    if (shown) {
      lastInterstitialAt = Date.now();
    }
    preloadNativeInterstitial(`${placement}:next`, { force: true }).catch(() => {});
    return shown;
  } catch (error) {
    interstitialReady = false;
    preloadNativeInterstitial(`${placement}:retry`, { force: true }).catch(() => {});
    console.warn(`[AdMob] Interstitial skipped (${placement}):`, error?.message || error);
    return false;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    await dismissedListener?.remove?.();
    await failedToShowListener?.remove?.();
    interstitialInFlight = false;
  }
}
