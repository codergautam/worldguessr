/**
 * Distance units (metric / imperial), matching the web app exactly.
 *
 * Web reference: components/roundOverScreen.js `formatDistance` (full breakdown)
 * and components/endBanner.js (the in-game "your guess was Nkm away" line, which
 * uses the guessDistanceKm / guessDistanceMi locale keys + KM_TO_MILES).
 *
 * The first-run default is auto-detected from the device locale's measurement
 * system (expo-localization), so US/UK users get imperial without touching
 * settings — the rest of the world gets metric.
 */

import * as Localization from 'expo-localization';

export type Units = 'metric' | 'imperial';

/** km → miles, identical constant to the web app. */
export const KM_TO_MILES = 0.621371;
/** km → feet (km → m → ft). */
const KM_TO_FEET = 1000 * 3.28084;

/**
 * Format a distance (in km) for the current units. Mirrors the web thresholds
 * (ft below 0.1mi, 1-decimal mi under 10, rounded above; m below 1km, 1-decimal
 * km under 10, rounded above) but keeps the mobile presentation style — a space
 * before the unit and grouped thousands — to match the existing results UI.
 */
export function formatDistance(km: number, units: Units): string {
  if (units === 'imperial') {
    const miles = km * KM_TO_MILES;
    if (miles < 0.1) return `${Math.round(km * KM_TO_FEET).toLocaleString()} ft`;
    if (miles < 10) return `${miles.toFixed(1)} mi`;
    return `${Math.round(miles).toLocaleString()} mi`;
  }
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}

/** The device's preferred units. US/UK → imperial (matches web), else metric. */
export function getDeviceUnits(): Units {
  try {
    const locale = Localization.getLocales()?.[0];
    const system = locale?.measurementSystem; // 'metric' | 'us' | 'uk' | null
    if (system === 'us' || system === 'uk') return 'imperial';
    if (system === 'metric') return 'metric';
    // Fallback when the measurement system is unavailable: region heuristic.
    const region = locale?.regionCode?.toUpperCase();
    if (region && ['US', 'GB', 'MM', 'LR'].includes(region)) return 'imperial';
  } catch {
    // Localization can throw on some platforms/test envs — default to metric.
  }
  return 'metric';
}
