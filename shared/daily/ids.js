// Guest-id primitives shared by web and mobile. The storage glue (sync
// localStorage on web vs async AsyncStorage on mobile) stays per-platform;
// only the pure UUID generation + the storage key live here.

const KEY = 'wg_guest_id';

/**
 * RFC 4122 v4 UUID. Prefers Web Crypto (browser, and RN if polyfilled);
 * falls back to Math.random where crypto is unavailable (e.g. Hermes).
 * Always returns a string.
 */
export function generateUuid() {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(b);
  } else {
    for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  }
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  const h = [];
  for (let i = 0; i < 16; i++) h.push(b[i].toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`;
}

export const GUEST_ID_STORAGE_KEY = KEY;
