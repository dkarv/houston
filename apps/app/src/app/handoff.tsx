import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { saveApolloSession } from '@/lib/sessions';

/**
 * Entry point when the desktop app takes over a call from the browser:
 * /handoff?s=<sessionId>#<Apollo's token>. The token stays in the fragment, so it never
 * reaches server logs. Connecting here replaces the browser's connection.
 */
export default function Handoff() {
  const { s: sessionId } = useLocalSearchParams<{ s: string }>();

  useEffect(() => {
    const token = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
    if (!sessionId || !token) {
      router.replace('/');
      return;
    }
    saveApolloSession(sessionId, token);
    router.replace(`/call/${sessionId}`);
  }, [sessionId]);

  return null;
}
