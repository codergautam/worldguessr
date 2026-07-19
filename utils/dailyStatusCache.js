// Tiny localStorage shim for instant rendering of daily-challenge UI state.
// We seed React state from this on mount and overwrite it when the real
// /api/dailyChallenge/results response lands.
import { DAILY_CACHE_TTL_MS as TTL_MS } from '../shared/daily/constants.js';

const KEY_PREFIX = 'wg_daily_status_';
const DIST_KEY_PREFIX = 'wg_daily_dist_';
// Written by old builds (landing top-10 panel, since replaced by the
// distribution + top-100 modal). No reader remains — always purge.
const LEGACY_TOP10_PREFIX = 'wg_daily_top10_';

// Keys are per-date and the TTL check below makes any previous day's entry
// permanently unreadable — without a purge they pile up per-day forever
// (each status blob also embeds the full history array, so old installs can
// carry a lot of dead weight). Sweep every non-current date once per date;
// this also retroactively clears keys accumulated before the purge existed.
let purgedFor = null;
function purgeStaleEntries(currentDate) {
  if (typeof window === 'undefined' || !currentDate || purgedFor === currentDate) return;
  purgedFor = currentDate;
  try {
    const stale = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(LEGACY_TOP10_PREFIX)) { stale.push(key); continue; }
      const prefix = key.startsWith(KEY_PREFIX) ? KEY_PREFIX
        : key.startsWith(DIST_KEY_PREFIX) ? DIST_KEY_PREFIX
        : null;
      if (prefix && key.slice(prefix.length) !== currentDate) stale.push(key);
    }
    for (const key of stale) window.localStorage.removeItem(key);
  } catch {
    // storage unavailable — nothing to purge
  }
}

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
  purgeStaleEntries(date);
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
  purgeStaleEntries(date);
  writeJson(KEY_PREFIX + date, { ...user, _owner: ownerId ?? null });
}

// The distribution (totalPlays/avgScore/buckets) is per-date and shared
// across all viewers, so it's safe to cache and reuse across sessions.
// Caching it (alongside the user block) is what stops the landing's
// "How you compare" chart from flashing the empty state on every
// navigation in.
export function readDailyDistribution(date) {
  if (!date) return null;
  purgeStaleEntries(date);
  const parsed = readJson(DIST_KEY_PREFIX + date);
  return parsed && typeof parsed.totalPlays === 'number' ? parsed : null;
}

export function writeDailyDistribution(date, distribution) {
  if (!date || !distribution || typeof distribution !== 'object') return;
  purgeStaleEntries(date);
  writeJson(DIST_KEY_PREFIX + date, distribution);
}
