import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'wg_guest_id';

function generateUuid(): string {
  const hex = '0123456789abcdef';
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h: string[] = [];
  for (let i = 0; i < 16; i++) h.push(hex[(b[i] >> 4) & 0xf] + hex[b[i] & 0xf]);
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`;
}

export async function getGuestId(): Promise<string | null> {
  try {
    return (await AsyncStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}

export async function ensureGuestId(): Promise<string | null> {
  const existing = await getGuestId();
  if (existing) return existing;
  const fresh = generateUuid();
  try {
    await AsyncStorage.setItem(KEY, fresh);
  } catch {
    /* ignore */
  }
  return fresh;
}

export async function clearGuestId(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
