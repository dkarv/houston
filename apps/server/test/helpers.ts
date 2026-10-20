import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

export interface TestServer {
  app: FastifyInstance;
  base: string;
  mailDir: string;
  request<T>(
    method: string,
    path: string,
    options?: { body?: unknown; token?: string },
  ): Promise<{ status: number; body: T }>;
  mails(): Array<{ to: string; subject: string; text: string }>;
}

export async function startServer(env: Record<string, string> = {}): Promise<TestServer> {
  const dir = mkdtempSync(join(tmpdir(), 'houston-test-'));
  const mailDir = join(dir, 'mail');
  const config = loadConfig({
    HOUSTON_DATA_DIR: dir,
    HOUSTON_PUBLIC_URL: 'https://help.example.com',
    HOUSTON_TURN_SECRET: 'test-secret-0123456789',
    HOUSTON_MAIL_DIR: mailDir,
    HOUSTON_RATE_LIMIT_PER_MINUTE: '1000',
    ...env,
  });
  const app = await buildApp(config, { logger: false });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const base = `127.0.0.1:${(app.server.address() as AddressInfo).port}`;

  return {
    app,
    base,
    mailDir,
    async request(method, path, { body, token } = {}) {
      const headers: Record<string, string> = {};
      if (body !== undefined) headers['content-type'] = 'application/json';
      if (token) headers.authorization = `Bearer ${token}`;
      const response = await fetch(`http://${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    },
    mails() {
      let files: string[] = [];
      try {
        files = readdirSync(mailDir).sort();
      } catch {}
      return files.map((file) => JSON.parse(readFileSync(join(mailDir, file), 'utf8')));
    },
  };
}

/** A WebSocket client that queues messages so tests can await them in order. */
export async function connectSocket<T>(url: string, hello: unknown) {
  const socket = new WebSocket(url);
  const queue: T[] = [];
  const waiters: Array<(message: T) => void> = [];
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString()) as T;
    const waiter = waiters.shift();
    if (waiter) waiter(message);
    else queue.push(message);
  });
  const closed = new Promise<number>((resolve) => socket.on('close', (code) => resolve(code)));
  await new Promise((resolve) => socket.on('open', resolve));
  socket.send(JSON.stringify(hello));
  return {
    send: (message: unknown) => socket.send(JSON.stringify(message)),
    next: () =>
      new Promise<T>((resolve) => {
        const queued = queue.shift();
        if (queued) resolve(queued);
        else waiters.push(resolve);
      }),
    closed,
    close: () => socket.close(),
  };
}
