import { useSyncExternalStore } from 'react';
import { HoustonApiError } from '@houston/core';
import type { User } from '@houston/protocol';
import { persistent } from './persistent';
import { api } from './server';

export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'signed-out'; user: null }
  | { status: 'signed-in'; user: User };

const TOKEN_KEY = 'houston.authToken';
const USER_KEY = 'houston.user';

let state: AuthState = { status: 'loading', user: null };
const listeners = new Set<() => void>();

function set(next: AuthState) {
  state = next;
  for (const listener of listeners) listener();
}

/** Restores the signed-in Houston on start. Being signed in is optional everywhere. */
async function restore() {
  const [token, cachedUser] = await Promise.all([
    persistent.get(TOKEN_KEY),
    persistent.get(USER_KEY),
  ]);
  if (!token) return set({ status: 'signed-out', user: null });
  api.token = token;
  if (cachedUser) set({ status: 'signed-in', user: JSON.parse(cachedUser) as User });
  try {
    const user = await api.me();
    await persistent.set(USER_KEY, JSON.stringify(user));
    set({ status: 'signed-in', user });
  } catch (error) {
    // Offline keeps the cached account; only a rejected token signs out.
    if (error instanceof HoustonApiError && error.code === 'unauthorized') await forget();
    else if (!cachedUser) set({ status: 'signed-out', user: null });
  }
}

async function forget() {
  api.token = null;
  await Promise.all([persistent.remove(TOKEN_KEY), persistent.remove(USER_KEY)]);
  set({ status: 'signed-out', user: null });
}

void restore();

export const auth = {
  async verify(email: string, code: string) {
    const { token, user } = await api.verifyCode(email, code);
    await Promise.all([
      persistent.set(TOKEN_KEY, token),
      persistent.set(USER_KEY, JSON.stringify(user)),
    ]);
    set({ status: 'signed-in', user });
  },

  async signOut() {
    await api.signOut().catch(() => {});
    await forget();
  },

  /** The server rejected our token somewhere else, e.g. on the events socket. */
  expired: forget,

  async updateName(displayName: string | null) {
    const user = await api.updateMe(displayName);
    await persistent.set(USER_KEY, JSON.stringify(user));
    set({ status: 'signed-in', user });
  },
};

export function useAuth(): AuthState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
