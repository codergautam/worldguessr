import gameStorage from '../components/utils/localStorage.js';
import { generateUuid, GUEST_ID_STORAGE_KEY as KEY } from '../shared/daily/ids.js';

export function getGuestId() {
  if (typeof window === 'undefined') return null;
  try { return gameStorage.getItem(KEY) || null; } catch { return null; }
}

// Read-or-create. Returns null on SSR or if storage + crypto are both absent.
export function ensureGuestId() {
  if (typeof window === 'undefined') return null;
  const existing = getGuestId();
  if (existing) return existing;
  const fresh = generateUuid();
  if (!fresh) return null;
  try { gameStorage.setItem(KEY, fresh); } catch { /* ignore */ }
  return fresh;
}

export function clearGuestId() {
  if (typeof window === 'undefined') return;
  try { gameStorage.removeItem(KEY); } catch { /* ignore */ }
}

export const GUEST_ID_STORAGE_KEY = KEY;
