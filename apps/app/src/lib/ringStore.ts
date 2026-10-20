import { useEffect, useSyncExternalStore } from 'react';
import { EventsClient } from '@houston/core';
import type { Ring } from '@houston/protocol';
import { auth, useAuth } from './auth';
import { api } from './server';

/** The signed-in Houston's recent rings, kept live over the events socket. */
let rings: Ring[] = [];
const listeners = new Set<() => void>();

function set(next: Ring[]) {
  rings = next;
  for (const listener of listeners) listener();
}

function upsert(ring: Ring) {
  const others = rings.filter((r) => r.id !== ring.id);
  set([ring, ...others].sort((a, b) => b.createdAt - a.createdAt));
}

async function refresh() {
  try {
    set((await api.rings()).rings);
  } catch {
    // Offline: keep what we have; the events socket catches up on reconnect.
  }
}

/** Keeps the store live while signed in; mount once near the root. */
export function useRingEvents() {
  const state = useAuth();
  const userId = state.status === 'signed-in' ? state.user.id : null;

  useEffect(() => {
    if (!userId || !api.token) {
      set([]);
      return;
    }
    void refresh();
    const events = new EventsClient({
      url: api.websocketUrl('/api/events'),
      authToken: api.token,
      onRing: upsert,
      onUnauthorized: () => void auth.expired(),
    });
    events.connect();
    return () => events.close();
  }, [userId]);
}

export function useRings(): Ring[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => rings,
  );
}

export const ringStore = { refresh, upsert };
