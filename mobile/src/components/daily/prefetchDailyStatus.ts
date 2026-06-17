import { api } from '../../services/api';
import { getClientLocalDate } from './dailyDate';
import { ensureGuestId } from './guestId';
import {
  writeDailyStatus,
  writeDailyTop10,
  type DailyUserCache,
  type DailyTop10Entry,
} from './dailyStatusCache';

/**
 * Warm the Daily Challenge cache on app/home load — mirrors what web's
 * home-rendered DailyMenuItem does. By the time the user opens /daily,
 * `useDailyChallenge` seeds instantly from AsyncStorage (no layout shift).
 *
 * Writes BOTH the user status and the top-10 (web only caches status) so the
 * landing's leaderboard panel is also shift-free. Uses `ensureGuestId()` for
 * guests so the warmed cache is keyed to the same id the daily screen will use.
 * Silent on failure — this is a best-effort prefetch.
 */
export async function prefetchDailyStatus(secret?: string | null): Promise<void> {
  const date = getClientLocalDate();
  const gid = secret ? null : await ensureGuestId();
  if (!secret && !gid) return;
  try {
    const data = await api.dailyChallenge.results(date, secret ?? undefined, gid ?? undefined);
    if (data?.user) await writeDailyStatus(date, data.user as DailyUserCache);
    if (Array.isArray(data?.top10)) await writeDailyTop10(date, data.top10 as DailyTop10Entry[]);
  } catch {
    /* best-effort; daily screen will fetch fresh on open */
  }
}
