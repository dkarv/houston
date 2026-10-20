import type { CreateSessionResponse } from '@houston/protocol';
import { tabStorage } from './storage';

/**
 * Houston's side of a session, kept so a reload of the session page rejoins it.
 * Sessions Houston started carry the invite; answered rings don't need one.
 */
export interface HoustonSession {
  sessionId: string;
  token: string;
  invite: CreateSessionResponse | null;
}

export function saveHoustonSession(session: HoustonSession) {
  tabStorage.set(`houston:${session.sessionId}`, JSON.stringify(session));
}

export function loadHoustonSession(sessionId: string): HoustonSession | null {
  const raw = tabStorage.get(`houston:${sessionId}`);
  return raw ? (JSON.parse(raw) as HoustonSession) : null;
}

/** Apollo's token for a join code; the code itself can only be used once. */
export function saveApolloToken(code: string, token: string) {
  tabStorage.set(`apollo:${code}`, token);
}

export function loadApolloToken(code: string): string | null {
  return tabStorage.get(`apollo:${code}`);
}

/** Apollo's token for a session from ringing a Houston. */
export function saveApolloSession(sessionId: string, token: string) {
  tabStorage.set(`apollo-session:${sessionId}`, token);
}

export function loadApolloSession(sessionId: string): string | null {
  return tabStorage.get(`apollo-session:${sessionId}`);
}
