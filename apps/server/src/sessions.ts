import { randomBytes, randomInt } from 'node:crypto';
import type { Role } from '@houston/protocol';

export interface Session {
  id: string;
  code: string;
  houstonToken: string;
  apolloToken: string | null;
  createdAt: number;
  /** Apollo has to join before this. */
  joinBefore: number;
  /** Hard limit for the whole session. */
  expiresAt: number;
}

export interface SessionStoreOptions {
  joinWindowMs: number;
  maxLifetimeMs: number;
  now?: () => number;
}

const DEFAULTS: SessionStoreOptions = {
  joinWindowMs: 30 * 60_000,
  maxLifetimeMs: 6 * 60 * 60_000,
};

function token(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Sessions only live as long as a call, so they are kept in memory.
 * A join code is single-use: once Apollo joined, it is released again.
 */
export class SessionStore {
  private readonly sessions = new Map<string, Session>();
  private readonly byCode = new Map<string, string>();
  private readonly byToken = new Map<string, { sessionId: string; role: Role }>();
  private readonly options: SessionStoreOptions;
  private readonly now: () => number;

  constructor(options: Partial<SessionStoreOptions> = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.now = options.now ?? Date.now;
  }

  create(): Session {
    this.prune();
    const now = this.now();
    const session: Session = {
      id: randomBytes(12).toString('base64url'),
      code: this.unusedCode(),
      houstonToken: token(),
      apolloToken: null,
      createdAt: now,
      joinBefore: now + this.options.joinWindowMs,
      expiresAt: now + this.options.maxLifetimeMs,
    };
    this.sessions.set(session.id, session);
    this.byCode.set(session.code, session.id);
    this.byToken.set(session.houstonToken, { sessionId: session.id, role: 'houston' });
    return session;
  }

  join(code: string): { session: Session; token: string } | 'not_found' | 'already_joined' {
    const sessionId = this.byCode.get(code);
    const session = sessionId ? this.sessions.get(sessionId) : undefined;
    if (!session || this.now() > session.joinBefore) return 'not_found';
    if (session.apolloToken) return 'already_joined';

    session.apolloToken = token();
    this.byCode.delete(code);
    this.byToken.set(session.apolloToken, { sessionId: session.id, role: 'apollo' });
    return { session, token: session.apolloToken };
  }

  /** A session Apollo is already part of: used when Apollo rings a Houston. */
  createJoined(): { session: Session; token: string } {
    const session = this.create();
    const joined = this.join(session.code);
    if (typeof joined === 'string') throw new Error(`Unexpected ${joined}`);
    return joined;
  }

  get(sessionId: string): Session | null {
    return this.sessions.get(sessionId) ?? null;
  }

  resolve(token: string): { session: Session; role: Role } | null {
    const entry = this.byToken.get(token);
    const session = entry ? this.sessions.get(entry.sessionId) : undefined;
    if (!entry || !session || this.now() > session.expiresAt) return null;
    return { session, role: entry.role };
  }

  end(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.delete(sessionId);
    if (this.byCode.get(session.code) === sessionId) this.byCode.delete(session.code);
    this.byToken.delete(session.houstonToken);
    if (session.apolloToken) this.byToken.delete(session.apolloToken);
  }

  /** Drops expired sessions and returns their ids. */
  prune(): string[] {
    const now = this.now();
    const expired: string[] = [];
    for (const session of this.sessions.values()) {
      const unjoined = !session.apolloToken && now > session.joinBefore;
      if (unjoined || now > session.expiresAt) expired.push(session.id);
    }
    for (const id of expired) this.end(id);
    return expired;
  }

  get size() {
    return this.sessions.size;
  }

  private unusedCode(): string {
    // With 10^6 codes and a 30 minute window, collisions only matter at a scale
    // where this would need persistent storage anyway.
    for (let attempt = 0; attempt < 100; attempt++) {
      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      if (!this.byCode.has(code)) return code;
    }
    throw new Error('No free session code');
  }
}
