// Localized language names for the Languages quiz buttons and reveal.
// Intl.DisplayNames gives "French" / "Français" / "Французский" for free in
// every browser that ships it; the pool's English names are the fallback.

import { QUIZ_LANGUAGE_BY_ID } from '../../shared/modes/data/languages.js';

const cache = new Map();

function displayNames(uiLang) {
  if (typeof Intl === 'undefined' || typeof Intl.DisplayNames !== 'function') return null;
  const key = uiLang || 'en';
  if (!cache.has(key)) {
    try {
      cache.set(key, new Intl.DisplayNames([key], { type: 'language' }));
    } catch {
      cache.set(key, null);
    }
  }
  return cache.get(key);
}

export function languageName(code, uiLang = 'en') {
  const fallback = QUIZ_LANGUAGE_BY_ID[code]?.name ?? code;
  const dn = displayNames(uiLang);
  let name = null;
  try { name = dn?.of(code) ?? null; } catch { name = null; }
  if (!name || name === code) return fallback;
  // fr / es / ru return lower-case names ("français"); these are button labels.
  return name.charAt(0).toLocaleUpperCase(uiLang) + name.slice(1);
}
