import * as StoreReview from 'expo-store-review';
import { Linking, Platform } from 'react-native';

/**
 * Fires the native App Store / Play Store review flow (iOS SKStoreReviewController,
 * Android In-App Review). Called only when the user already picked 5 stars in our
 * own modal, so the native sheet appears at a high-intent moment.
 *
 * Defensive on purpose: the native module is unavailable in Expo Go / before a
 * fresh dev-client build, and the OS may legitimately decline to show the sheet
 * (iOS rate-limits to a few prompts per year). In any of those cases we fall back
 * to opening the public store listing so the tap is never a dead end.
 */

// Play Store deep link (we know the Android package). The iOS App Store fallback
// URL needs the numeric App Store ID, which doesn't exist until the app is
// published — until then iOS relies on the native in-app prompt only.
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.codergautamyt.worldguessr';
const IOS_STORE_URL: string | null = null; // TODO: set once the App Store ID is known

export async function requestStoreReview(): Promise<void> {
  try {
    if ((await StoreReview.isAvailableAsync()) && (await StoreReview.hasAction())) {
      await StoreReview.requestReview();
      return;
    }
  } catch {
    // Native module missing or threw — fall through to the store listing.
  }

  // Prefer a store-provided URL if one is configured, else our known fallback.
  let url: string | null = null;
  try {
    url = StoreReview.storeUrl();
  } catch {
    url = null;
  }
  if (!url) url = Platform.select({ android: PLAY_STORE_URL, ios: IOS_STORE_URL ?? undefined }) ?? null;
  if (url) Linking.openURL(url).catch(() => {});
}
