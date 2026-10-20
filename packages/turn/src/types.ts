export interface TurnServerOptions {
  /** Shared secret for the time-limited credentials, see createTurnCredentials. */
  secret: string;
  realm: string;
  /** Port for STUN/TURN over UDP and TCP. */
  port: number;
  /** Public IP clients reach the relay on; required when the host sits behind NAT. */
  externalIp?: string;
  relayIp?: string;
  relayPortRange: [number, number];
  /** Only for local development, where both peers are on a private network. */
  allowPrivatePeers?: boolean;
}

export type TurnWorkerMessage =
  | { type: 'listening'; port: number }
  | { type: 'auth-failure'; username: string | null; reason: string }
  | { type: 'error'; message: string };
