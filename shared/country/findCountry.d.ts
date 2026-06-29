interface BordersGeoJson {
  features: Array<{ properties?: { code?: string }; geometry: { type: string; coordinates: any } }>;
}
export interface CountryIndexEntry {
  code: string;
  ring: number[][];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
export function buildCountryIndex(borders: BordersGeoJson): CountryIndexEntry[];
export function lookupCountry(indexed: CountryIndexEntry[] | null, lat: number, lon: number): string;
