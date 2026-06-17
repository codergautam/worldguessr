import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Localization from 'expo-localization';
import { api, type FeedbackPayload } from './api';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';

/**
 * Builds the rate-us feedback payload (rating + comment + device/locale context)
 * and POSTs it to /api/submitFeedback, which forwards a detailed Discord embed so
 * the team can follow up. Device info comes from Platform.constants + expo-constants
 * + expo-localization — all already bundled, so this needs no extra native module
 * and works in the current build (no rebuild required for the feedback flow).
 */

function deviceMeta() {
  // Platform.constants carries OS/model details cross-platform without expo-device.
  const pc = (Platform.constants ?? {}) as Record<string, any>;
  const locale = Localization.getLocales?.()?.[0];
  const calendar = Localization.getCalendars?.()?.[0];

  const osVersion =
    Platform.OS === 'android'
      ? String(pc.Release ?? Platform.Version ?? '')
      : String(pc.osVersion ?? Platform.Version ?? '');

  const deviceModel =
    Platform.OS === 'android'
      ? [pc.Manufacturer, pc.Model].filter(Boolean).join(' ')
      : String(pc.systemName ?? 'iOS');

  const appVersion = Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? undefined;
  const buildVersion =
    Constants.nativeBuildVersion ??
    Constants.expoConfig?.ios?.buildNumber ??
    (Constants.expoConfig?.android?.versionCode != null
      ? String(Constants.expoConfig.android.versionCode)
      : undefined);

  return {
    platform: Platform.OS,
    osVersion: osVersion || undefined,
    appVersion: appVersion || undefined,
    buildVersion: buildVersion || undefined,
    deviceModel: deviceModel || undefined,
    deviceName: Constants.deviceName ?? undefined,
    deviceLocale: locale?.languageTag ?? undefined,
    deviceRegion: locale?.regionCode ?? undefined,
    timezone: calendar?.timeZone ?? undefined,
  };
}

/** Submit a 1–4★ rating with optional comment. Returns the network promise. */
export function submitAppFeedback(stars: number, comment: string) {
  const { secret, user } = useAuthStore.getState();
  const { language } = useSettingsStore.getState();

  const payload: FeedbackPayload = {
    secret: secret ?? undefined,
    stars,
    comment: comment?.trim() || undefined,
    language,
    accountCountry: user?.countryCode ?? null,
    ...deviceMeta(),
  };

  return api.submitFeedback(payload);
}
