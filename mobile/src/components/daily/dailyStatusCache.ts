import AsyncStorage from '@react-native-async-storage/async-storage';
import { DAILY_CACHE_TTL_MS as TTL_MS } from '@shared/daily/constants';

const KEY_PREFIX = 'wg_daily_status_';
const DIST_KEY_PREFIX = 'wg_daily_dist_';
// Written by old builds (landing top-10 panel, since replaced by the
// distribution + top-100 sheet). No reader remains — always purge.
const LEGACY_TOP10_PREFIX = 'wg_daily_top10_';

// Keys are per-date and the TTL check below makes any previous day's entry
// permanently unreadable — without a purge they pile up per-day forever
// (each status blob also embeds the full history array, so old installs can
// carry a lot of dead weight). Sweep every non-current date once per date;
// this also retroactively clears keys accumulated before the purge existed.
// Fire-and-forget: only removes non-current dates, so it can never race the
// current date's read/write.
let purgedFor: string | null = null;
async function purgeStaleEntries(currentDate: string): Promise<void> {
  if (!currentDate || purgedFor === currentDate) return;
  purgedFor = currentDate;
  try {
    const keys = await AsyncStorage.getAllKeys();
    const stale = keys.filter((key) => {
      if (key.startsWith(LEGACY_TOP10_PREFIX)) return true;
      const prefix = key.startsWith(KEY_PREFIX) ? KEY_PREFIX
        : key.startsWith(DIST_KEY_PREFIX) ? DIST_KEY_PREFIX
        : null;
      return prefix !== null && key.slice(prefix.length) !== currentDate;
    });
    if (stale.length) await AsyncStorage.multiRemove(stale);
  } catch {
    /* storage unavailable — nothing to purge */
  }
}

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

export interface DailyDistributionCache {
  totalPlays: number;
  avgScore: number;
  buckets: number[];
  roundAverages?: number[];
  cachedAt?: number;
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

export async function readDailyStatus(date: string, ownerId: string | null = null): Promise<DailyUserCache | null> {
  if (!date) return null;
  void purgeStaleEntries(date);
  const parsed = await readJson<DailyUserCache & { _owner?: string | null }>(KEY_PREFIX + date);
  if (!parsed) return null;
  // Scope the cached block to the identity that wrote it (logged-in secret,
  // else guestId). The key is per-date, not per-user — so on a SHARED device a
  // different account must never read the previous user's cached name/streak/
  // score. Owner mismatch → treat as a miss.
  if ((parsed._owner ?? null) !== (ownerId ?? null)) return null;
  delete parsed._owner;
  return parsed;
}

export function writeDailyStatus(date: string, user: DailyUserCache, ownerId: string | null = null): Promise<void> {
  if (!date || !user) return Promise.resolve();
  void purgeStaleEntries(date);
  return writeJson(KEY_PREFIX + date, { ...user, _owner: ownerId ?? null });
}

// The distribution (totalPlays/avgScore/buckets) is per-date and shared across
// all viewers, so it's safe to cache and reuse across sessions. Caching it
// (alongside the user block) is what keeps the landing's "How you compare"
// chart shift-free while the API is in flight.
export async function readDailyDistribution(date: string): Promise<DailyDistributionCache | null> {
  if (!date) return null;
  void purgeStaleEntries(date);
  const parsed = await readJson<DailyDistributionCache>(DIST_KEY_PREFIX + date);
  return parsed && typeof parsed.totalPlays === 'number' ? parsed : null;
}

export function writeDailyDistribution(date: string, distribution: DailyDistributionCache): Promise<void> {
  if (!date || !distribution || typeof distribution !== 'object') return Promise.resolve();
  void purgeStaleEntries(date);
  return writeJson(DIST_KEY_PREFIX + date, distribution);
}
