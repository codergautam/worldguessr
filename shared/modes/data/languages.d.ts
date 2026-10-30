export interface QuizLanguage {
  id: string;
  name: string;
  script: string;
  family: string;
  country: string;
  spokenIn: string[];
  tier: 1 | 2 | 3;
  text: string;
}
export const QUIZ_LANGUAGES: QuizLanguage[];
export const QUIZ_LANGUAGE_BY_ID: Record<string, QuizLanguage>;
