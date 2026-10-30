export interface QuizRound {
  mode: string;
  country: string;
  lat: number;
  long: number;
  /** languages */
  lang?: string;
  text?: string;
  choices?: string[];
  spokenIn?: string[];
  /** manifest (image) modes */
  id?: string;
  label?: string;
  image?: { url: string; credit?: string; license?: string; sourceUrl?: string };
}

export interface ManifestItem {
  id: string;
  country: string;
  lat?: number;
  long?: number;
  label: string;
  image: { url: string; credit?: string; license?: string; sourceUrl?: string };
}

export function seededRng(seed: number): () => number;
export function pickLanguageChoices(
  answerId: string,
  n: number,
  rng: () => number,
  langs?: Array<{ id: string; script: string; family: string; country: string }>,
): string[];
export function generateRounds(args: {
  mode: string;
  count: number;
  region?: string;
  pool?: ManifestItem[];
  rng?: () => number;
  exclude?: Iterable<string>;
}): QuizRound[];
export function choicePoint(mode: string, choiceId: string): { lat: number; long: number } | null;
export function poolSize(args: { mode: string; region?: string; pool?: ManifestItem[] }): number;
