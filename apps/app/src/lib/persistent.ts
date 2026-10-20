import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Storage that survives restarts: the keychain/keystore on phones, localStorage in the
 * browser. Browser storage can be unavailable (private mode, blocked site data); then
 * values only last until the page closes.
 */
const memory = new Map<string, string>();

export const persistent = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS !== 'web') return SecureStore.getItemAsync(key);
    try {
      return window.localStorage.getItem(key) ?? memory.get(key) ?? null;
    } catch {
      return memory.get(key) ?? null;
    }
  },
  async set(key: string, value: string) {
    if (Platform.OS !== 'web') return SecureStore.setItemAsync(key, value);
    memory.set(key, value);
    try {
      window.localStorage.setItem(key, value);
    } catch {}
  },
  async remove(key: string) {
    if (Platform.OS !== 'web') return SecureStore.deleteItemAsync(key);
    memory.delete(key);
    try {
      window.localStorage.removeItem(key);
    } catch {}
  },
};

/** Random id for this device, so a Houston can block a caller who misbehaves. */
export async function deviceId(): Promise<string> {
  const existing = await persistent.get('houston.deviceId');
  if (existing) return existing;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  await persistent.set('houston.deviceId', id);
  return id;
}
