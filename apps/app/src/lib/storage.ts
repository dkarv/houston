import { Platform } from 'react-native';

const memory = new Map<string, string>();

/**
 * Per-tab storage for session tokens, so a reload rejoins the same call. Browser storage
 * can be unavailable (private mode, blocked site data); then it only lasts in memory.
 */
export const tabStorage = {
  get(key: string): string | null {
    if (Platform.OS === 'web') {
      try {
        return window.sessionStorage.getItem(key);
      } catch {}
    }
    return memory.get(key) ?? null;
  },
  set(key: string, value: string) {
    memory.set(key, value);
    if (Platform.OS === 'web') {
      try {
        window.sessionStorage.setItem(key, value);
      } catch {}
    }
  },
  remove(key: string) {
    memory.delete(key);
    if (Platform.OS === 'web') {
      try {
        window.sessionStorage.removeItem(key);
      } catch {}
    }
  },
};
