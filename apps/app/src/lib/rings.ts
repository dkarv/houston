import { router } from 'expo-router';
import type { Ring } from '@houston/protocol';
import { t } from './i18n';
import { api } from './server';
import { saveHoustonSession } from './sessions';

/** Answers a ring and opens the call. */
export async function answerRing(id: string) {
  const { sessionId, token } = await api.answerRing(id);
  saveHoustonSession({ sessionId, token, invite: null });
  router.push(`/session/${sessionId}`);
}

export function callerName(ring: Ring) {
  return ring.callerName || t.unknownCaller;
}

export const ringStatusText: Record<Ring['status'], string> = {
  ringing: t.ringStatusRinging,
  answered: t.ringStatusAnswered,
  missed: t.ringStatusMissed,
  declined: t.ringStatusDeclined,
};
