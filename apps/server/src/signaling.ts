import type { FastifyBaseLogger } from 'fastify';
import type { WebSocket } from 'ws';
import {
  ClientMessage,
  CloseCode,
  type EndReason,
  type IceServer,
  type Role,
  type ServerMessage,
} from '@houston/protocol';
import type { Session, SessionStore } from './sessions';

const HELLO_TIMEOUT_MS = 10_000;

type Room = Partial<Record<Role, WebSocket>>;

function send(socket: WebSocket | undefined, message: ServerMessage) {
  if (socket && socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function other(role: Role): Role {
  return role === 'houston' ? 'apollo' : 'houston';
}

/**
 * Relays WebRTC signaling between the two participants of a session. The server
 * never interprets SDP or candidates; it only checks that messages are well-formed.
 */
export class SignalingHub {
  private readonly rooms = new Map<string, Room>();
  /** Called whenever a session ends, for whatever reason. */
  onEnded: (sessionId: string, reason: EndReason) => void = () => {};

  constructor(
    private readonly sessions: SessionStore,
    private readonly iceServers: (session: Session, role: Role) => IceServer[],
    private readonly log: FastifyBaseLogger,
  ) {}

  handle(socket: WebSocket) {
    let joined: { session: Session; role: Role } | null = null;
    const helloTimer = setTimeout(() => socket.close(CloseCode.Unauthorized), HELLO_TIMEOUT_MS);

    socket.on('message', (raw, isBinary) => {
      let message: ClientMessage;
      try {
        if (isBinary) throw new Error('binary');
        message = ClientMessage.parse(JSON.parse(raw.toString()));
      } catch {
        send(socket, { type: 'error', code: 'invalid_message' });
        return;
      }

      if (!joined) {
        if (message.type !== 'hello') {
          socket.close(CloseCode.Unauthorized);
          return;
        }
        clearTimeout(helloTimer);
        joined = this.sessions.resolve(message.token);
        if (!joined) {
          send(socket, { type: 'error', code: 'unauthorized' });
          socket.close(CloseCode.Unauthorized);
          return;
        }
        this.attach(joined.session, joined.role, socket);
        return;
      }

      const { session, role } = joined;
      switch (message.type) {
        case 'signal':
          send(this.rooms.get(session.id)?.[other(role)], { type: 'signal', data: message.data });
          break;
        case 'end':
          this.log.info({ sessionId: session.id, role }, 'session ended by participant');
          this.endSession(session.id, 'hangup');
          break;
        case 'ping':
          send(socket, { type: 'pong' });
          break;
        case 'hello':
          break;
      }
    });

    socket.on('close', () => {
      clearTimeout(helloTimer);
      if (!joined) return;
      const { session, role } = joined;
      const room = this.rooms.get(session.id);
      if (room?.[role] !== socket) return;
      delete room[role];
      send(room[other(role)], { type: 'peer-left' });
      if (!room.houston && !room.apollo) this.rooms.delete(session.id);
    });
  }

  endSession(sessionId: string, reason: EndReason) {
    const room = this.rooms.get(sessionId);
    this.rooms.delete(sessionId);
    this.sessions.end(sessionId);
    for (const socket of Object.values(room ?? {})) {
      send(socket, { type: 'ended', reason });
      socket.close(CloseCode.Ended);
    }
    this.onEnded(sessionId, reason);
  }

  private attach(session: Session, role: Role, socket: WebSocket) {
    const room = this.rooms.get(session.id) ?? {};
    this.rooms.set(session.id, room);

    const previous = room[role];
    room[role] = socket;
    if (previous) {
      send(previous, { type: 'error', code: 'replaced' });
      previous.close(CloseCode.Replaced);
    }

    const peer = room[other(role)];
    send(socket, {
      type: 'welcome',
      sessionId: session.id,
      role,
      iceServers: this.iceServers(session, role),
      peerPresent: Boolean(peer),
    });
    send(peer, { type: 'peer-joined' });
    this.log.info(
      { sessionId: session.id, role, peerPresent: Boolean(peer) },
      'participant connected',
    );
  }
}
