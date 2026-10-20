import { createHmac, randomBytes } from 'node:crypto';
import type {
  AnswerRingResponse,
  Ring,
  RingRequest,
  RingResponse,
  RingStatus,
} from '@houston/protocol';
import type { AccountUser, Accounts } from './accounts';
import type { Database } from './db';
import type { EventsHub } from './events';
import type { Mailer } from './mailer';
import { messages } from './messages';
import type { Push } from './push';
import type { SessionStore } from './sessions';
import type { SignalingHub } from './signaling';

/** How long Apollo waits for an answer. */
export const RING_TIMEOUT_MS = 3 * 60_000;
/** More rings than this per hour to one Houston are dropped silently. */
const MAX_RINGS_PER_HOUR = 20;
const HISTORY_LIMIT = 50;

interface RingRow {
  id: string;
  user_id: string;
  session_id: string;
  caller_name: string | null;
  caller_device_hash: string;
  caller_ip_hash: string;
  status: RingStatus;
  created_at: number;
}

function toRing(row: RingRow): Ring {
  return {
    id: row.id,
    callerName: row.caller_name,
    createdAt: row.created_at,
    status: row.status,
  };
}

export interface RingsDeps {
  db: Database;
  accounts: Accounts;
  sessions: SessionStore;
  hub: SignalingHub;
  events: EventsHub;
  push: Push;
  mailer: Mailer | null;
  publicUrl: URL;
  secret: string;
  log: (message: string, details?: object) => void;
  now?: () => number;
}

/**
 * Apollo rings a Houston by email address. Apollo always gets a session to wait in,
 * whether or not the address belongs to anyone, is blocked or over its limit; so the
 * response never reveals who is registered. Unanswered rings end after RING_TIMEOUT_MS.
 */
export class Rings {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly deps: RingsDeps;
  private readonly now: () => number;

  constructor(deps: RingsDeps) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
    // Sessions live in memory, so rings that were ringing before a restart are lost.
    deps.db.prepare("UPDATE rings SET status = 'missed' WHERE status = 'ringing'").run();
    deps.hub.onEnded = (sessionId) => this.onSessionEnded(sessionId);
  }

  ring(request: RingRequest, ip: string): RingResponse {
    const { db, accounts, sessions, hub } = this.deps;
    const { session, token } = sessions.createJoined();
    this.timers.set(
      session.id,
      setTimeout(() => hub.endSession(session.id, 'unanswered'), RING_TIMEOUT_MS),
    );

    const user = accounts.findByEmail(request.email);
    const deviceHash = this.hash(`device:${request.deviceId}`);
    const ipHash = this.hash(`ip:${ip}`);
    if (user && !this.isBlocked(user.id, deviceHash, ipHash) && !this.overLimit(user.id)) {
      const row: RingRow = {
        id: randomBytes(12).toString('base64url'),
        user_id: user.id,
        session_id: session.id,
        caller_name: request.callerName || null,
        caller_device_hash: deviceHash,
        caller_ip_hash: ipHash,
        status: 'ringing',
        created_at: this.now(),
      };
      db.prepare(
        `INSERT INTO rings (id, user_id, session_id, caller_name, caller_device_hash, caller_ip_hash, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        row.id,
        row.user_id,
        row.session_id,
        row.caller_name,
        row.caller_device_hash,
        row.caller_ip_hash,
        row.status,
        row.created_at,
      );
      this.deps.events.publish(user.id, { type: 'ring', ring: toRing(row) });
      // Not awaited: the response must not take longer for registered addresses.
      void this.notify(user, row);
    }
    return { sessionId: session.id, token };
  }

  answer(userId: string, ringId: string): AnswerRingResponse | 'not_found' | 'gone' {
    const row = this.find(userId, ringId);
    if (!row) return 'not_found';
    const session = this.deps.sessions.get(row.session_id);
    if (row.status !== 'ringing' || !session) return 'gone';
    this.setStatus(row, 'answered');
    clearTimeout(this.timers.get(session.id));
    this.timers.delete(session.id);
    return { sessionId: session.id, token: session.houstonToken };
  }

  decline(userId: string, ringId: string): 'ok' | 'not_found' {
    const row = this.find(userId, ringId);
    if (!row) return 'not_found';
    if (row.status === 'ringing') {
      this.setStatus(row, 'declined');
      // Looks the same to Apollo as nobody answering.
      this.deps.hub.endSession(row.session_id, 'unanswered');
    }
    return 'ok';
  }

  /** Blocks the caller's device and IP address from ringing this Houston again. */
  block(userId: string, ringId: string): 'ok' | 'not_found' {
    const row = this.find(userId, ringId);
    if (!row) return 'not_found';
    this.deps.db
      .prepare('INSERT INTO blocks (user_id, device_hash, ip_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(userId, row.caller_device_hash, row.caller_ip_hash, this.now());
    return this.decline(userId, ringId);
  }

  list(userId: string): Ring[] {
    const rows = this.deps.db
      .prepare('SELECT * FROM rings WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(userId, HISTORY_LIMIT) as unknown as RingRow[];
    return rows.map(toRing);
  }

  close() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private onSessionEnded(sessionId: string) {
    clearTimeout(this.timers.get(sessionId));
    this.timers.delete(sessionId);
    // Apollo gave up or nobody answered in time.
    const row = this.deps.db
      .prepare("SELECT * FROM rings WHERE session_id = ? AND status = 'ringing'")
      .get(sessionId) as RingRow | undefined;
    if (row) this.setStatus(row, 'missed');
  }

  private async notify(user: AccountUser, row: RingRow) {
    const text = messages(user.language);
    const url = new URL(`/ring/${row.id}`, this.deps.publicUrl).toString();
    const results = await Promise.allSettled([
      this.deps.push.notify(user.id, {
        title: text.ringTitle,
        body: text.ringBody(row.caller_name),
        data: { type: 'ring', ringId: row.id, callerName: row.caller_name, url },
      }),
      this.deps.mailer?.send({
        to: user.email,
        subject: text.ringSubject(row.caller_name),
        text: text.ringText(row.caller_name, url),
      }),
    ]);
    for (const result of results) {
      if (result.status === 'rejected') {
        this.deps.log('ring notification failed', { error: String(result.reason) });
      }
    }
  }

  private find(userId: string, ringId: string): RingRow | null {
    const row = this.deps.db
      .prepare('SELECT * FROM rings WHERE id = ? AND user_id = ?')
      .get(ringId, userId) as RingRow | undefined;
    return row ?? null;
  }

  private setStatus(row: RingRow, status: RingStatus) {
    this.deps.db.prepare('UPDATE rings SET status = ? WHERE id = ?').run(status, row.id);
    this.deps.events.publish(row.user_id, { type: 'ring', ring: toRing({ ...row, status }) });
  }

  private isBlocked(userId: string, deviceHash: string, ipHash: string) {
    return Boolean(
      this.deps.db
        .prepare(
          'SELECT 1 FROM blocks WHERE user_id = ? AND (device_hash = ? OR ip_hash = ?) LIMIT 1',
        )
        .get(userId, deviceHash, ipHash),
    );
  }

  private overLimit(userId: string) {
    const { count } = this.deps.db
      .prepare('SELECT COUNT(*) AS count FROM rings WHERE user_id = ? AND created_at > ?')
      .get(userId, this.now() - 60 * 60_000) as { count: number };
    return count >= MAX_RINGS_PER_HOUR;
  }

  /** Callers are only stored as keyed hashes; enough to block, useless if leaked. */
  private hash(value: string) {
    return createHmac('sha256', this.deps.secret).update(value).digest('hex');
  }
}
