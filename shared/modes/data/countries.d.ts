export interface QuizCountry {
  code: string;
  lat: number;
  long: number;
  continent: 'Africa' | 'Asia' | 'Europe' | 'North America' | 'South America' | 'Oceania';
  tier: 1 | 2 | 3;
  shapeOk: boolean;
}
export const QUIZ_COUNTRIES: QuizCountry[];
export const QUIZ_COUNTRY_BY_CODE: Record<string, QuizCountry>;
