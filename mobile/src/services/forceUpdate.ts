import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { SITE_URL } from '../constants/config';
import { fetchWithTimeout } from './fetchWithTimeout';
import { isVersionHigher } from '../utils/versionCompare';

/**
 * Per-platform minimum-supported-version gate for breaking releases.
 *
 * The floor is published as a plain-text file on the website
 * (worldguessr.com/minVersion{Ios,Android}.txt) containing a single semver line,
 * e.g. "2.2.0". Two separate files on purpose: iOS and Android store reviews land
 * at different times, so the floor must be raised per platform — only once THAT
 * platform's build is actually live, otherwise we'd lock out users who literally
 * cannot get the new build yet. Bumping a number in a txt file needs no app
 * release, which is the whole point of a remote gate (we have no OTA).
 */

const MIN_VERSION_PATH = Platform.select({
  ios: '/minVersionIos.txt',
  android: '/minVersionAndroid.txt',
  default: '/minVersionAndroid.txt',
}) as string;

// Where the "Update Now" button sends the user.
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.codergautamyt.worldguessr';
// The iOS App Store numeric ID doesn't exist until the app is first published
// (same gap as services/storeReview.ts). Until it's known, deep-link the App
// Store search for the app by name so the button is never a dead end. Replace
// with the canonical listing URL (apps.apple.com/app/idXXXXXXXXX) once published.
const IOS_STORE_URL = 'itms-apps://itunes.apple.com/search?term=worldguessr';

export const STORE_URL = Platform.select({
  ios: IOS_STORE_URL,
  android: PLAY_STORE_URL,
  default: PLAY_STORE_URL,
}) as string;

/** The installed native binary version (e.g. "2.2.0"), or null if unreadable. */
function getCurrentVersion(): string | null {
  const v = Constants.expoConfig?.version ?? (Constants as any).nativeAppVersion;
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Returns true when the installed app is BELOW the platform's published minimum
 * supported version and must be updated before it can be used.
 *
 * Fail-OPEN by design — every failure path (offline, timeout, non-200, a 200 that
 * isn't a clean version string, or an unreadable local version) returns false.
 * The asymmetry is deliberate: wrongly blocking a paying user over a flaky network
 * is far worse than missing one enforcement window, which we re-check on the next
 * foreground anyway. We only ever block when we're certain installed < required.
 */
export async function isUpdateRequired(): Promise<boolean> {
  try {
    const current = getCurrentVersion();
    if (!current) return false;

    const res = await fetchWithTimeout(`${SITE_URL}${MIN_VERSION_PATH}`, {
      // Always hit the network for the floor; a stale cached value could either
      // miss an enforcement (CDN holding an old low floor) or, worse, hold a high
      // floor after we've lowered it. The file is a few bytes — cost is trivial.
      cache: 'no-store',
      headers: { Accept: 'text/plain' },
    });
    if (!res.ok) return false;

    const raw = (await res.text()).trim();
    // A misconfigured host can return a 200 HTML error/SPA page instead of the
    // file. Only trust a bare "x", "x.y", or "x.y.z" semver line.
    if (!/^\d+(\.\d+){0,2}$/.test(raw)) return false;

    return isVersionHigher(raw, current); // required > installed ⇒ must update
  } catch {
    return false;
  }
}
