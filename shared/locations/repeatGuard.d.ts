export type GuardLoc = { lat: number; long?: number; lng?: number } | null | undefined;

export const ID_LEN: number;
export const DEFAULT_CAP: number;
export const SERVER_CAP: number;

export function isOfficialMapSlug(slug: unknown): boolean;
export function locId(lat: number | string, long: number | string): string;
export function locKey(loc: GuardLoc): string | null;
export function decodeRing(raw: string | null | undefined): string[];
export function encodeRing(ids: string[]): string;
export function pushSeen(ids: string[], id: string | null, cap?: number): string[];
export function pushSeenLoc(ids: string[], loc: GuardLoc, cap?: number): string[];
export function orderByFreshness<T>(locs: T[], ids: string[]): T[];
export function sampleDistinct<T>(pool: T[], count: number, seenIds?: Set<string> | string[] | null): T[];
