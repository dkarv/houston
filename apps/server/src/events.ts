import type { WebSocket } from 'ws';
import { CloseCode, EventsClientMessage, type EventsServerMessage } from '@houston/protocol';
import type { Accounts } from './accounts';

const HELLO_TIMEOUT_MS = 10_000;

function send(socket: WebSocket, message: EventsServerMessage) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

/** Live updates for signed-in Houstons whose app is open, e.g. incoming rings. */
export class EventsHub {
  private readonly sockets = new Map<string, Set<WebSocket>>();

  constructor(private readonly accounts: Accounts) {}

  handle(socket: WebSocket) {
    let userId: string | null = null;
    const helloTimer = setTimeout(() => socket.close(CloseCode.Unauthorized), HELLO_TIMEOUT_MS);

    socket.on('message', (raw, isBinary) => {
      let message: EventsClientMessage;
      try {
        if (isBinary) throw new Error('binary');
        message = EventsClientMessage.parse(JSON.parse(raw.toString()));
      } catch {
        return;
      }
      if (message.type === 'ping') {
        send(socket, { type: 'pong' });
        return;
      }
      if (userId) return;
      clearTimeout(helloTimer);
      const user = this.accounts.authenticate(message.authToken);
      if (!user) {
        socket.close(CloseCode.Unauthorized);
        return;
      }
      userId = user.id;
      const sockets = this.sockets.get(userId) ?? new Set();
      sockets.add(socket);
      this.sockets.set(userId, sockets);
      send(socket, { type: 'ready' });
    });

    socket.on('close', () => {
      clearTimeout(helloTimer);
      if (!userId) return;
      const sockets = this.sockets.get(userId);
      sockets?.delete(socket);
      if (sockets?.size === 0) this.sockets.delete(userId);
    });
  }

  publish(userId: string, message: EventsServerMessage) {
    for (const socket of this.sockets.get(userId) ?? []) send(socket, message);
  }
}
