import * as StoreReview from 'expo-store-review';
import { logEvent } from './analytics';

/**
 * Fires the native App Store / Play Store review flow (iOS SKStoreReviewController,
 * Android In-App Review). Called only when the user already picked 5 stars in our
 * own prompt, so the native sheet appears at a high-intent moment.
 *
 * CALL-SITE CONTRACT (iOS): dispatch this while the rating card is still on
 * screen and no native transition is running. iOS presents the sheet into OUR
 * window and silently discards the request if a view-controller transition
 * (modal dismissal, navigation, interstitial) is in flight at that moment —
 * no error, no signal. See the 5-star order contract in useReviewPrompt.
 *
 * If the native flow is unavailable (Expo Go / stale dev client, TestFlight —
 * Apple suppresses the sheet there), this is a deliberate NO-OP (user ruling
 * Aug 23): never bounce the user out of the app to a store page. The thanks
 * card is the whole experience in those builds. Production store builds always
 * have the API, so nothing is lost where it counts.
 *
 * Every exit logs which path ran (app_review_store_path) — the only ground
 * truth production can give us, since the native call reports nothing.
 *
 * Returns which path ran so the caller can pace the thanks card: 'native'
 * means the sheet is (as far as the API can tell) on its way; 'unavailable'
 * means the thanks card is the entire experience.
 */
export type StoreReviewPath = 'native' | 'unavailable';

// Availability never changes mid-session, so one check serves the whole run.
let availability: Promise<boolean> | null = null;

function checkAvailability(): Promise<boolean> {
  if (!availability) {
    availability = StoreReview.isAvailableAsync().catch(() => false);
  }
  return availability;
}

/**
 * Start the availability check early — call when the rating card appears. The
 * result is cached, so the later 5★ tap skips the native round trip and goes
 * straight to requestReview(). Shaving latency there matters: the sheet
 * landing fast, while the user's intent is hot, is the conversion moment.
 */
export function prewarmStoreReview(): void {
  void checkAvailability();
}

export async function requestStoreReview(): Promise<StoreReviewPath> {
  try {
    if (await checkAvailability()) {
      await StoreReview.requestReview();
      console.log('[storeReview] native review flow requested');
      logEvent('app_review_store_path', { path: 'native' });
      return 'native';
    }
  } catch {
    // Native module missing or threw — treated the same as unavailable.
  }
  console.log('[storeReview] native review unavailable — no-op by design');
  logEvent('app_review_store_path', { path: 'unavailable' });
  return 'unavailable';
}
