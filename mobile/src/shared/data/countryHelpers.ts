import countryNames from './countryNames.json';
import continentMapping from './continentMapping.json';
import countryList from './countries.json';
import countryCoordinates from './countryCoordinates.json';

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

export function nameFromCode(code?: string | null): string {
  if (!code) return '???';
  return NAMES[code.toUpperCase()] || code;
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
