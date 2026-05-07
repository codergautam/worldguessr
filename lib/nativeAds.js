import { Capacitor } from '@capacitor/core';

let initializePromise = null;
let interstitialInFlight = false;
let lastInterstitialAt = 0;

const MIN_INTERSTITIAL_INTERVAL_MS = 90 * 1000;

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

export async function showNativeInterstitial(placement = 'main') {
  if (!isNativeAdMobConfigured() || interstitialInFlight) return false;

  const now = Date.now();
  if (now - lastInterstitialAt < MIN_INTERSTITIAL_INTERVAL_MS) return false;

  interstitialInFlight = true;
  try {
    await initializeNativeAds();
    const { AdMob } = await import('@capacitor-community/admob');
    await AdMob.prepareInterstitial({
      adId: process.env.NEXT_PUBLIC_ADMOB_INTERSTITIAL_MAIN_ID,
      isTesting: process.env.NEXT_PUBLIC_ADMOB_TESTING === 'true',
    });
    await AdMob.showInterstitial();
    lastInterstitialAt = Date.now();
    return true;
  } catch (error) {
    console.warn(`[AdMob] Interstitial skipped (${placement}):`, error?.message || error);
    return false;
  } finally {
    interstitialInFlight = false;
  }
}
