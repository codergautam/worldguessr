export type ModeId =
  | 'classic'
  | 'flags'
  | 'shapes'
  | 'languages'
  | 'landmarks'
  | 'animals'
  | 'food';

export type Stimulus = 'pano' | 'flag' | 'outline' | 'text' | 'image';
export type Input = 'map' | 'choice';
export type Target = 'point' | 'country' | 'language';
export type Pool = 'countries' | 'shapes' | 'languages' | 'manifest' | null;
export type Region =
  | 'all'
  | 'Africa'
  | 'Asia'
  | 'Europe'
  | 'North America'
  | 'South America'
  | 'Oceania';

export interface ModeSpec {
  id: ModeId;
  stimulus: Stimulus;
  input: Input;
  target: Target;
  pool: Pool;
  choices?: number;
  defaultTimePerRound: number;
  defaultRounds: number;
  timerRequired: boolean;
  supportsRegion: boolean;
  missMaxDist?: number;
  maxXpPerRound: number;
  enabled: boolean;
}

export const DEFAULT_MODE: 'classic';
export const NO_TIMER_SECONDS: number;
export const REGIONS: readonly Region[];
export const MODES: Readonly<Record<ModeId, ModeSpec>>;

export function getMode(id: string | null | undefined): ModeSpec | null;
export function isQuizMode(id: string | null | undefined): boolean;
export function isSelectableMode(id: string | null | undefined): boolean;
export function isRegion(value: unknown): value is Region;
export function effectiveTimePerRound(id: string | null | undefined, seconds: number): number;
