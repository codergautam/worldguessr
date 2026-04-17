// Tiny localStorage shim for instant rendering of daily-challenge UI state.
// We seed React state from this on mount and overwrite it when the real
// /api/dailyChallenge/results response lands.
const KEY_PREFIX = 'wg_daily_status_';
const TTL_MS = 24 * 60 * 60 * 1000;

export function readDailyStatus(date) {
  if (typeof window === 'undefined' || !date) return null;
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + date);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.cachedAt && Date.now() - parsed.cachedAt > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeDailyStatus(date, user) {
  if (typeof window === 'undefined' || !date || !user) return;
  try {
    const payload = { ...user, cachedAt: Date.now() };
    window.localStorage.setItem(KEY_PREFIX + date, JSON.stringify(payload));
  } catch {
    // quota exceeded / private mode — silently skip
  }
}
