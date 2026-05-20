import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'wg_daily_status_';
const TOP10_KEY_PREFIX = 'wg_daily_top10_';
const TTL_MS = 60 * 1000;

export interface DailyUserCache {
  username?: string;
  streak?: number;
  streakBest?: number;
  graceDay?: boolean;
  playedToday?: boolean;
  disqualifiedToday?: boolean;
  ownScore?: number;
  ownRank?: number;
  ownRounds?: any[];
  ownTotalTime?: number;
  history?: Array<{ date: string; score: number; rank?: number }>;
  personalBest?: number;
  cachedAt?: number;
}

export interface DailyTop10Entry {
  rank: number;
  username: string;
  score: number;
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.cachedAt && Date.now() - parsed.cachedAt > TTL_MS) return null;
    return parsed as T;
  } catch {
    return null;
  }
}

async function writeJson(key: string, payload: any): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ ...payload, cachedAt: Date.now() }));
  } catch {
    /* ignore quota */
  }
}

export function readDailyStatus(date: string): Promise<DailyUserCache | null> {
  if (!date) return Promise.resolve(null);
  return readJson<DailyUserCache>(KEY_PREFIX + date);
}

export function writeDailyStatus(date: string, user: DailyUserCache): Promise<void> {
  if (!date || !user) return Promise.resolve();
  return writeJson(KEY_PREFIX + date, user);
}

export async function readDailyTop10(date: string): Promise<DailyTop10Entry[]> {
  if (!date) return [];
  const parsed = await readJson<{ entries?: DailyTop10Entry[] }>(TOP10_KEY_PREFIX + date);
  return Array.isArray(parsed?.entries) ? parsed!.entries : [];
}

export function writeDailyTop10(date: string, top10: DailyTop10Entry[]): Promise<void> {
  if (!date || !Array.isArray(top10)) return Promise.resolve();
  return writeJson(TOP10_KEY_PREFIX + date, { entries: top10 });
}
