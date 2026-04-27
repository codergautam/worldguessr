// Tiny localStorage shim for instant rendering of daily-challenge UI state.
// We seed React state from this on mount and overwrite it when the real
// /api/dailyChallenge/results response lands.
const KEY_PREFIX = 'wg_daily_status_';
const TOP10_KEY_PREFIX = 'wg_daily_top10_';
const TTL_MS = 60 * 1000;

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

export function readDailyStatus(date) {
  if (!date) return null;
  return readJson(KEY_PREFIX + date);
}

export function writeDailyStatus(date, user) {
  if (!date || !user) return;
  writeJson(KEY_PREFIX + date, user);
}

// Top-10 is per-date and shared across all viewers, so it's safe to cache and
// reuse across sessions. Caching it (alongside the user block) is what stops
// the landing leaderboard from flashing the "no winners yet" empty state on
// every navigation in.
export function readDailyTop10(date) {
  if (!date) return [];
  const parsed = readJson(TOP10_KEY_PREFIX + date);
  return Array.isArray(parsed?.entries) ? parsed.entries : [];
}

export function writeDailyTop10(date, top10) {
  if (!date || !Array.isArray(top10)) return;
  writeJson(TOP10_KEY_PREFIX + date, { entries: top10 });
}
