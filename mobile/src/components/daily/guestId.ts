import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateUuid, GUEST_ID_STORAGE_KEY as KEY } from '@shared/daily/ids';

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
