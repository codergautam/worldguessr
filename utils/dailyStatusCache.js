// Tiny localStorage shim for instant rendering of daily-challenge UI state.
// We seed React state from this on mount and overwrite it when the real
// /api/dailyChallenge/results response lands.
import { DAILY_CACHE_TTL_MS as TTL_MS } from '../shared/daily/constants.js';

const KEY_PREFIX = 'wg_daily_status_';
const DIST_KEY_PREFIX = 'wg_daily_dist_';

function readJson(key) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.cachedAt && Date.now() - parsed.cachedAt > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeJson(key, payload) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ ...payload, cachedAt: Date.now() }));
  } catch {
    // quota exceeded / private mode — silently skip
  }
}

export function readDailyStatus(date, ownerId = null) {
  if (!date) return null;
  const parsed = readJson(KEY_PREFIX + date);
  if (!parsed) return null;
  // Scope the cached block to the identity that wrote it (logged-in secret,
  // else guestId). The key is per-date, not per-user, and sign-out doesn't
  // clear it — so on a SHARED browser a different account must never read the
  // previous user's cached name/streak/score. Owner mismatch → treat as a miss.
  if ((parsed._owner ?? null) !== (ownerId ?? null)) return null;
  delete parsed._owner;
  return parsed;
}

export function writeDailyStatus(date, user, ownerId = null) {
  if (!date || !user) return;
  writeJson(KEY_PREFIX + date, { ...user, _owner: ownerId ?? null });
}

// The distribution (totalPlays/avgScore/buckets) is per-date and shared
// across all viewers, so it's safe to cache and reuse across sessions.
// Caching it (alongside the user block) is what stops the landing's
// "How you compare" chart from flashing the empty state on every
// navigation in.
export function readDailyDistribution(date) {
  if (!date) return null;
  const parsed = readJson(DIST_KEY_PREFIX + date);
  return parsed && typeof parsed.totalPlays === 'number' ? parsed : null;
}

export function writeDailyDistribution(date, distribution) {
  if (!date || !distribution || typeof distribution !== 'object') return;
  writeJson(DIST_KEY_PREFIX + date, distribution);
}
