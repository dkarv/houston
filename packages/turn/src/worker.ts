// Runs in a worker thread, also straight from source under Node's built-in type stripping:
// keep it (and what it imports) to erasable TypeScript with explicit .ts imports.

import { parentPort, workerData } from 'node:worker_threads';
import { createServer } from 'turn-server';
import { PrefixRateLimiter } from './rate-limit.ts';
import type { TurnServerOptions, TurnWorkerMessage } from './types.ts';

const options = workerData as TurnServerOptions;

function post(message: TurnWorkerMessage) {
  parentPort?.postMessage(message);
}

const server = createServer({
  software: 'houston',
  auth: { mechanism: 'long-term', realm: options.realm, secret: options.secret },
  relay: {
    ip: options.relayIp ?? '0.0.0.0',
    externalIp: options.externalIp,
    portRange: options.relayPortRange,
  },
  maxConnections: 2000,
  // A browser allocates once per ICE transport (UDP and TCP), so a few per user is plenty.
  userQuota: 4,
  totalQuota: 1000,
  idleTimeout: 5 * 60_000,
  // Refuse relaying into private networks unless explicitly allowed (local development).
  // Passed through untyped: the option exists at runtime but is missing from index.d.ts.
  ...({ allowPrivatePeers: options.allowPrivatePeers ?? false } as object),
});

// STUN Binding replies can be abused for reflection attacks with spoofed source addresses.
const bindingLimiter = new PrefixRateLimiter(50);
server.on(
  'beforeBindingResponse',
  (info: { source: { ip: string } }, cb: (ok: boolean) => void) => {
    cb(bindingLimiter.take(info.source.ip));
  },
);
setInterval(() => bindingLimiter.prune(), 60_000).unref();

server.on('auth:failure', (_socket: unknown, info: { username?: string; reason: string }) => {
  post({ type: 'auth-failure', username: info.username ?? null, reason: info.reason });
});

server.on('error', (err: Error) => {
  post({ type: 'error', message: err.message });
});

server.listen(
  [
    { port: options.port, transport: 'udp' },
    { port: options.port, transport: 'tcp' },
  ],
  () => post({ type: 'listening', port: options.port }),
);

parentPort?.on('message', (message: { type: 'stop' }) => {
  if (message.type === 'stop') server.drain(5_000, () => process.exit(0));
});
