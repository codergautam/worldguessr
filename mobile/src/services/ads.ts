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
