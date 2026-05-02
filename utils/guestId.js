import gameStorage from '../components/utils/localStorage.js';

const KEY = 'wg_guest_id';

// RFC 4122 v4 UUID. Prefers crypto.randomUUID; falls back to crypto.getRandomValues
// for the rare browser that doesn't have randomUUID yet. Never throws on SSR —
// callers that need an id on the server shouldn't use this (there's no identity
// without client-side storage by design).
function generateUuid() {
  if (typeof crypto === 'undefined') return null;
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  if (typeof crypto.getRandomValues !== 'function') return null;
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  const h = [...b].map(x => x.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`;
}

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
