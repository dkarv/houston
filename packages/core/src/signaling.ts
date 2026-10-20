import { type ClientMessage, CloseCode, ServerMessage, type SignalData } from '@houston/protocol';

export type SignalingEvent =
  | Extract<ServerMessage, { type: 'welcome' | 'peer-joined' | 'peer-left' | 'signal' | 'ended' }>
  | { type: 'disconnected' }
  /** The server refused us for good (unknown token, replaced, session over). */
  | { type: 'closed'; reason: 'unauthorized' | 'replaced' | 'ended' };

const PING_INTERVAL_MS = 20_000;
const MAX_BACKOFF_MS = 10_000;

/**
 * WebSocket connection to the Houston server. Reconnects with backoff until the server
 * tells us the session is over; every successful (re)connect produces a fresh `welcome`.
 */
export class SignalingClient {
  private socket: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private attempt = 0;
  private stopped = false;
  private readonly url: string;
  private readonly token: string;
  private readonly onEvent: (event: SignalingEvent) => void;

  constructor(url: string, token: string, onEvent: (event: SignalingEvent) => void) {
    this.url = url;
    this.token = token;
    this.onEvent = onEvent;
  }

  connect() {
    this.stopped = false;
    this.open();
  }

  signal(data: SignalData) {
    this.send({ type: 'signal', data });
  }

  /** Ends the session for both participants. */
  end() {
    this.send({ type: 'end' });
  }

  close() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    clearInterval(this.pingTimer);
    this.socket?.close();
    this.socket = null;
  }

  private send(message: ClientMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  private open() {
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.send({ type: 'hello', token: this.token });
      this.pingTimer = setInterval(() => this.send({ type: 'ping' }), PING_INTERVAL_MS);
    };

    socket.onmessage = (event) => {
      let message: ServerMessage;
      try {
        message = ServerMessage.parse(JSON.parse(String(event.data)));
      } catch {
        return;
      }
      if (message.type === 'pong' || message.type === 'error') return;
      this.onEvent(message);
    };

    socket.onclose = (event) => {
      clearInterval(this.pingTimer);
      if (this.socket !== socket || this.stopped) return;
      this.socket = null;

      const final = {
        [CloseCode.Unauthorized]: 'unauthorized',
        [CloseCode.Replaced]: 'replaced',
        [CloseCode.Ended]: 'ended',
      } as const;
      const reason = final[event.code as keyof typeof final];
      if (reason) {
        this.stopped = true;
        this.onEvent({ type: 'closed', reason });
        return;
      }

      this.onEvent({ type: 'disconnected' });
      const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** this.attempt++);
      this.retryTimer = setTimeout(() => this.open(), delay);
    };
  }
}
