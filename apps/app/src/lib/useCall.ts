import { useEffect, useState, useSyncExternalStore } from 'react';
import { Call, type CallSnapshot } from '@houston/core';
import { mediaPlatform } from './platform';
import { api } from './server';

const idle = () => null;
const noop = () => () => {};

/**
 * Creates the call once a token is known and starts it right away; callers set the
 * token from a button press, which browsers need before allowing microphone and audio.
 */
export function useCall(token: string | null): { call: Call | null; state: CallSnapshot | null } {
  const [call, setCall] = useState<Call | null>(null);

  useEffect(() => {
    if (!token) return;
    const next = new Call({
      signalingUrl: api.websocketUrl('/api/ws'),
      token,
      platform: mediaPlatform,
    });
    setCall(next);
    void next.start();
    // Leaving the screen is not hanging up: the session stays joinable, e.g. after a reload.
    return () => next.leave();
  }, [token]);

  const state = useSyncExternalStore(call?.subscribe ?? noop, call?.getSnapshot ?? idle);
  return { call, state };
}
