/**
 * Tiny i18n helper. Strings come from the WEB app's translation files
 * (`public/locales/<lang>/common.json`) — the single source of truth, shared
 * verbatim via the `@locales` Metro alias — merged with a small set of
 * mobile-only overrides (`localeOverrides.json`) for genuinely platform-specific
 * wording (e.g. "backgrounded the app" instead of web's "switched tabs") and
 * keys web doesn't have (ad / streak-restore strings).
 *
 * All five web languages are bundled and the active one is swappable at runtime
 * via `setLocaleLanguage()` (driven by the settings store). `t()`/`localeString()`
 * read the *current* table, so they always reflect the selected language — but
 * already-mounted screens only pick up a change when they re-render, so the
 * (tabs) navigator is keyed by language to remount on change (see (tabs)/_layout).
 *
 * `t()` interpolates `{{var}}` placeholders. Falls back to the given `fallback`
 * or the key itself rather than rendering empty.
 *
 *   t('gameStartingIn', { t: 4 })  → "Game starting in 4s"
 */

import * as Localization from 'expo-localization';
import enCommon from '@locales/en/common.json';
import esCommon from '@locales/es/common.json';
import frCommon from '@locales/fr/common.json';
import deCommon from '@locales/de/common.json';
import ruCommon from '@locales/ru/common.json';
import overrides from './localeOverrides.json';

export type SupportedLanguage = 'en' | 'es' | 'fr' | 'de' | 'ru';

/** Order shown in the settings picker; `en` first as the canonical fallback. */
export const SUPPORTED_LANGUAGES: SupportedLanguage[] = ['en', 'es', 'fr', 'de', 'ru'];

/** Native display names for the language picker (not translated, matches web). */
export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  ru: 'Русский',
};

const BASE_TABLES: Record<SupportedLanguage, Record<string, string>> = {
  en: enCommon as Record<string, string>,
  es: esCommon as Record<string, string>,
  fr: frCommon as Record<string, string>,
  de: deCommon as Record<string, string>,
  ru: ruCommon as Record<string, string>,
};

// Mobile-only overrides are authored in English. They win over the base locale
// so platform-specific wording is consistent; the handful of keys that also
// exist (translated) on web therefore render in English on non-English locales —
// an accepted tradeoff, as no mobile-specific translations exist for them.
const OVERRIDES = overrides as Record<string, string>;

// Layer the active language on top of English so any key missing from a
// non-English locale (e.g. `dailyLandingGraceDay` that only exists in en/common.json)
// falls back to the English string instead of rendering the raw key — matching the
// web app's per-key English fallback (see components/useTranslations.js). Overrides
// win last.
function buildTable(lang: SupportedLanguage): Record<string, string> {
  if (lang === 'en') return { ...BASE_TABLES.en, ...OVERRIDES };
  return { ...BASE_TABLES.en, ...BASE_TABLES[lang], ...OVERRIDES };
}

let currentLang: SupportedLanguage = 'en';
let TABLE: Record<string, string> = buildTable(currentLang);

/**
 * Swap the active language. Returns the language actually applied (falls back to
 * `en` for unsupported codes). Synchronous — `t()` reflects it immediately, so
 * callers can re-render to update strings.
 */
export function setLocaleLanguage(lang: string): SupportedLanguage {
  const next: SupportedLanguage = SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)
    ? (lang as SupportedLanguage)
    : 'en';
  currentLang = next;
  TABLE = buildTable(next);
  return next;
}

export function getCurrentLanguage(): SupportedLanguage {
  return currentLang;
}

/** The device's language if we support it, else `en`. Used for the first-run default. */
export function getDeviceLanguage(): SupportedLanguage {
  try {
    const code = Localization.getLocales()?.[0]?.languageCode?.toLowerCase();
    if (code && SUPPORTED_LANGUAGES.includes(code as SupportedLanguage)) {
      return code as SupportedLanguage;
    }
  } catch {
    // Localization can throw on some platforms/test envs — default to English.
  }
  return 'en';
}

export function t(
  key: string,
  vars?: Record<string, string | number | undefined | null>,
  fallback?: string,
): string {
  const template = TABLE[key] ?? fallback ?? key;
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, varName: string) => {
    const value = vars[varName];
    return value === undefined || value === null ? `{{${varName}}}` : String(value);
  });
}

/** Direct key access for callers that don't need interpolation. */
export function localeString(key: string, fallback?: string): string {
  return TABLE[key] ?? fallback ?? key;
}
