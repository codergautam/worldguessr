import { api } from '../../services/api';
import { getClientLocalDate } from './dailyDate';
import { ensureGuestId } from './guestId';
import {
  writeDailyStatus,
  writeDailyDistribution,
  type DailyUserCache,
  type DailyDistributionCache,
} from './dailyStatusCache';

/**
 * Warm the Daily Challenge cache on app/home load — mirrors what web's
 * home-rendered DailyMenuItem does. By the time the user opens /daily,
 * `useDailyChallenge` seeds instantly from AsyncStorage (no layout shift).
 *
 * Writes BOTH the user status and the distribution so the landing's
 * "How you compare" chart is also shift-free. Uses `ensureGuestId()` for
 * guests so the warmed cache is keyed to the same id the daily screen will use.
 * Silent on failure — this is a best-effort prefetch.
 */
export async function prefetchDailyStatus(secret?: string | null): Promise<void> {
  const date = getClientLocalDate();
  const gid = secret ? null : await ensureGuestId();
  if (!secret && !gid) return;
  try {
    const data = await api.dailyChallenge.results(date, secret ?? undefined, gid ?? undefined);
    if (data?.user) await writeDailyStatus(date, data.user as DailyUserCache, secret ?? gid ?? null);
    if (data?.distribution) await writeDailyDistribution(date, data.distribution as DailyDistributionCache);
  } catch {
    /* best-effort; daily screen will fetch fresh on open */
  }
}
