import {
  CloseCode,
  type EventsClientMessage,
  EventsServerMessage,
  type Ring,
} from '@houston/protocol';

const PING_INTERVAL_MS = 20_000;
const MAX_BACKOFF_MS = 30_000;

/**
 * Live events for a signed-in Houston (incoming rings). Reconnects with backoff until
 * closed or the auth token is rejected.
 */
export class EventsClient {
  private socket: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private attempt = 0;
  private stopped = false;
  private readonly url: string;
  private readonly authToken: string;
  private readonly onRing: (ring: Ring) => void;
  private readonly onUnauthorized: () => void;

  constructor(options: {
    url: string;
    authToken: string;
    onRing: (ring: Ring) => void;
    onUnauthorized?: () => void;
  }) {
    this.url = options.url;
    this.authToken = options.authToken;
    this.onRing = options.onRing;
    this.onUnauthorized = options.onUnauthorized ?? (() => {});
  }

  connect() {
    this.stopped = false;
    this.open();
  }

  close() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    clearInterval(this.pingTimer);
    this.socket?.close();
    this.socket = null;
  }

  private send(message: EventsClientMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  private open() {
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.onopen = () => {
      this.send({ type: 'hello', authToken: this.authToken });
      this.pingTimer = setInterval(() => this.send({ type: 'ping' }), PING_INTERVAL_MS);
    };
    socket.onmessage = (event) => {
      let message: EventsServerMessage;
      try {
        message = EventsServerMessage.parse(JSON.parse(String(event.data)));
      } catch {
        return;
      }
      if (message.type === 'ready') this.attempt = 0;
      if (message.type === 'ring') this.onRing(message.ring);
    };
    socket.onclose = (event) => {
      clearInterval(this.pingTimer);
      if (this.socket !== socket || this.stopped) return;
      this.socket = null;
      if (event.code === CloseCode.Unauthorized) {
        this.stopped = true;
        this.onUnauthorized();
        return;
      }
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt++);
      this.retryTimer = setTimeout(() => this.open(), delay);
    };
  }
}
