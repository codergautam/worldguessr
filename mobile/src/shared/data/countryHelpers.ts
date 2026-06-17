import countryNames from './countryNames.json';
import continentMapping from './continentMapping.json';
import countryList from './countries.json';
import countryCoordinates from './countryCoordinates.json';
import * as countries from 'i18n-iso-countries';
import type { LocaleData } from 'i18n-iso-countries';
import enLocale from 'i18n-iso-countries/langs/en.json';
import esLocale from 'i18n-iso-countries/langs/es.json';
import frLocale from 'i18n-iso-countries/langs/fr.json';
import deLocale from 'i18n-iso-countries/langs/de.json';
import ruLocale from 'i18n-iso-countries/langs/ru.json';

const NAMES = countryNames as Record<string, string>;
const CONTINENTS = continentMapping as Record<string, string>;
const COUNTRY_COORDINATES = countryCoordinates as Record<string, { lat: number; lng: number }>;

export const ALL_CONTINENTS = [
  'Africa',
  'Asia',
  'Europe',
  'North America',
  'South America',
  'Oceania',
] as const;

export type Continent = (typeof ALL_CONTINENTS)[number];

export const COUNTRY_POOL: string[] = countryList as string[];

// Shorter/better display names per language for codes where i18n-iso-countries
// uses overly formal names. Ported verbatim from web components/utils/nameFromCode.js.
const BETTER_NAMES: Record<string, Record<string, string>> = {
  US: { en: 'United States', es: 'Estados Unidos', fr: 'États-Unis', de: 'USA', ru: 'США' },
  RU: { en: 'Russia', es: 'Rusia', fr: 'Russie', de: 'Russland', ru: 'Россия' },
  KR: { en: 'South Korea', es: 'Corea del Sur', fr: 'Corée du Sud', de: 'Südkorea', ru: 'Южная Корея' },
  TW: { en: 'Taiwan', es: 'Taiwán', fr: 'Taïwan', de: 'Taiwan', ru: 'Тайвань' },
  IR: { en: 'Iran', es: 'Irán', fr: 'Iran', de: 'Iran', ru: 'Иран' },
  SY: { en: 'Syria', es: 'Siria', fr: 'Syrie', de: 'Syrien', ru: 'Сирия' },
  TZ: { en: 'Tanzania', es: 'Tanzania', fr: 'Tanzanie', de: 'Tansania', ru: 'Танзания' },
  MK: { en: 'North Macedonia', es: 'Macedonia del Norte', fr: 'Macédoine du Nord', de: 'Nordmazedonien', ru: 'Северная Македония' },
  PS: { en: 'Palestine', es: 'Palestina', fr: 'Palestine', de: 'Palästina', ru: 'Палестина' },
  LA: { en: 'Laos', es: 'Laos', fr: 'Laos', de: 'Laos', ru: 'Лаос' },
  MD: { en: 'Moldova', es: 'Moldavia', fr: 'Moldavie', de: 'Moldawien', ru: 'Молдавия' },
  CZ: { en: 'Czech Republic', es: 'Chequia', fr: 'Tchéquie', de: 'Tschechien', ru: 'Чехия' },
  DO: { en: 'Dominican Republic', es: 'República Dominicana', fr: 'Rép. dominicaine', de: 'Dominikanische Republik', ru: 'Доминиканская Респ.' },
  SZ: { en: 'Eswatini', es: 'Esuatini', fr: 'Eswatini', de: 'Eswatini', ru: 'Эсватини' },
  CD: { en: 'DR Congo', es: 'RD del Congo', fr: 'RD Congo', de: 'DR Kongo', ru: 'ДР Конго' },
  CG: { en: 'Congo', es: 'Congo', fr: 'Congo', de: 'Kongo', ru: 'Конго' },
  BN: { en: 'Brunei', es: 'Brunéi', fr: 'Brunei', de: 'Brunei', ru: 'Бруней' },
  AN: { en: 'Netherlands Antilles', es: 'Antillas Neerlandesas', fr: 'Antilles néerlandaises', de: 'Niederländische Antillen', ru: 'Нидерландские Антилы' },
  SX: { en: 'Sint Maarten', es: 'San Martín', fr: 'Saint-Martin', de: 'Sint Maarten', ru: 'Синт-Мартен' },
  BQ: { en: 'Caribbean Netherlands', es: 'Caribe Neerlandés', fr: 'Pays-Bas caribéens', de: 'Karibische Niederlande', ru: 'Карибские Нидерланды' },
  CN: { en: 'China', es: 'China', fr: 'Chine', de: 'China', ru: 'Китай' },
  KP: { en: 'North Korea', es: 'Corea del Norte', fr: 'Corée du Nord', de: 'Nordkorea', ru: 'Северная Корея' },
  GM: { en: 'Gambia', es: 'Gambia', fr: 'Gambie', de: 'Gambia', ru: 'Гамбия' },
  FM: { en: 'Micronesia', es: 'Micronesia', fr: 'Micronésie', de: 'Mikronesien', ru: 'Микронезия' },
  VA: { en: 'Vatican City', es: 'Ciudad del Vaticano', fr: 'Vatican', de: 'Vatikanstadt', ru: 'Ватикан' },
  FK: { en: 'Falkland Islands', es: 'Islas Malvinas', fr: 'Îles Malouines', de: 'Falklandinseln', ru: 'Фолклендские острова' },
  MF: { en: 'Saint Martin', es: 'San Martín', fr: 'Saint-Martin', de: 'Saint-Martin', ru: 'Сен-Мартен' },
};

// Lazily register the i18n-iso-countries locales the first time a non-English
// name is requested. The mobile bundle resolves the package's `browser` entry
// (index.js), which — unlike the Node entry — does NOT auto-register locales,
// so we register them ourselves. Guarded by a boolean so registration is
// idempotent (single-threaded JS, no double-register) and startup stays cheap.
let localesRegistered = false;
function ensureLocales(): void {
  if (localesRegistered) return;
  localesRegistered = true;
  countries.registerLocale(enLocale as LocaleData);
  countries.registerLocale(esLocale as LocaleData);
  countries.registerLocale(frLocale as LocaleData);
  countries.registerLocale(deLocale as LocaleData);
  countries.registerLocale(ruLocale as LocaleData);
}

// `lang` defaults to 'en', whose path is byte-identical to the previous
// English-only implementation, so the country-game callers stay unchanged.
export function nameFromCode(code?: string | null, lang: string = 'en'): string {
  if (!code) return '???';
  const up = code.toUpperCase();
  if (lang === 'en') return NAMES[up] || code;
  const better = BETTER_NAMES[up];
  if (better && better[lang]) return better[lang];
  ensureLocales();
  return countries.getName(up, lang) || NAMES[up] || code;
}

export function continentFromCode(code?: string | null): string {
  if (!code) return 'Unknown';
  return CONTINENTS[code.toUpperCase()] || 'Unknown';
}

export function countryCenterFromCode(code?: string | null): { lat: number; lng: number } | null {
  if (!code) return null;
  return COUNTRY_COORDINATES[code.toUpperCase()] ?? null;
}

export function flagUrl(code: string, size: 'w40' | 'w80' | 'w160' | 'w320' = 'w160'): string {
  return `https://flagcdn.com/${size}/${code.toLowerCase()}.png`;
}

export function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pickDistractors(correct: string, count: number): string[] {
  const pool = COUNTRY_POOL.filter((c) => c !== correct);
  const picked: string[] = [];
  while (picked.length < count && pool.length > picked.length) {
    const choice = pool[Math.floor(Math.random() * pool.length)];
    if (!picked.includes(choice)) picked.push(choice);
  }
  return picked;
}
