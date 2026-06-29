declare module 'countries-code' {
  export function getCountry(code: string): string;
  export function convertAlphaCode(code: string): string;
  export function allCountriesList(): any[];
  export function getAllAlphaTwoCodes(): string[];
  export function getAllAlphaThreeCodes(): string[];
}
