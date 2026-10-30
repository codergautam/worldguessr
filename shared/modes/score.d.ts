import type { CountryIndexEntry } from '../country/findCountry';

export interface QuizGuess {
  lat: number;
  lng: number;
  /** ISO-2 of the clicked country, when the caller already resolved it (client). */
  country?: string;
}

export interface ScoreArgs {
  mode: string | null | undefined;
  location: { lat: number; long: number; country?: string; lang?: string } | null;
  guess?: QuizGuess | null;
  choice?: string | null;
  maxDist?: number;
  timeTakenMs?: number;
  timePerRoundMs?: number;
  usedHint?: boolean;
  countryIndex?: CountryIndexEntry[] | null;
  /** Country targets: the 1-based try this click is (TRY_POINTS on a hit, 0 on a miss). */
  attempt?: number | null;
}

export const MAX_TRIES: number;
export const TRY_POINTS: readonly number[];

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number;
export function pointsForDistance(distKm: number, maxDist: number, usedHint?: boolean): number;
export function choicePoints(correct: boolean, timeTakenMs?: number, timePerRoundMs?: number): number;
export function scoreGuessDetailed(args: ScoreArgs): { points: number; correct: boolean; distKm: number | null };
export function scoreGuess(args: ScoreArgs): number;
