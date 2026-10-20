import type { AddressInfo } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CloseCode,
  type CreateSessionResponse,
  type JoinSessionResponse,
  type ServerMessage,
} from '@houston/protocol';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

let app: FastifyInstance;
let base: string;

beforeEach(async () => {
  const config = loadConfig({
    HOUSTON_DATA_DIR: mkdtempSync(join(tmpdir(), 'houston-test-')),
    HOUSTON_PUBLIC_URL: 'https://help.example.com',
    HOUSTON_TURN_SECRET: 'test-secret-0123456789',
  });
  app = await buildApp(config, { logger: false });
  await app.listen({ host: '127.0.0.1', port: 0 });
  base = `127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});

afterEach(() => app.close());

async function post<T>(path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const response = await fetch(`http://${base}${path}`, {
    method: 'POST',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: (await response.json()) as T };
}

/** A WebSocket client that queues messages so tests can await them in order. */
async function connect(token: string) {
  const socket = new WebSocket(`ws://${base}/api/ws`);
  const queue: ServerMessage[] = [];
  const waiters: Array<(message: ServerMessage) => void> = [];
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString()) as ServerMessage;
    const waiter = waiters.shift();
    if (waiter) waiter(message);
    else queue.push(message);
  });
  const closed = new Promise<number>((resolve) => socket.on('close', (code) => resolve(code)));
  await new Promise((resolve) => socket.on('open', resolve));
  socket.send(JSON.stringify({ type: 'hello', token }));
  return {
    send: (message: unknown) => socket.send(JSON.stringify(message)),
    next: () =>
      new Promise<ServerMessage>((resolve) => {
        const queued = queue.shift();
        if (queued) resolve(queued);
        else waiters.push(resolve);
      }),
    closed,
    close: () => socket.close(),
  };
}

async function createAndJoin() {
  const created = await post<CreateSessionResponse>('/api/sessions');
  const joined = await post<JoinSessionResponse>('/api/sessions/join', { code: created.body.code });
  return { created: created.body, joined: joined.body };
}

describe('session API', () => {
  it('creates a session with a public join link', async () => {
    const { status, body } = await post<CreateSessionResponse>('/api/sessions');
    expect(status).toBe(200);
    expect(body.joinUrl).toBe(`https://help.example.com/j/${body.code}`);
  });

  it('rejects unknown and reused codes', async () => {
    expect((await post('/api/sessions/join', { code: '000000' })).status).toBe(404);
    expect((await post('/api/sessions/join', { code: 'abc' })).status).toBe(400);
    const { created } = await createAndJoin();
    expect((await post('/api/sessions/join', { code: created.code })).status).toBe(404);
  });
});

describe('signaling', () => {
  it('welcomes both sides with TURN credentials and relays signals', async () => {
    const { created, joined } = await createAndJoin();

    const houston = await connect(created.token);
    const welcome = await houston.next();
    expect(welcome).toMatchObject({ type: 'welcome', role: 'houston', peerPresent: false });
    if (welcome.type !== 'welcome') throw new Error();
    expect(welcome.iceServers[1]?.urls).toContain('turn:help.example.com:3478?transport=udp');
    expect(welcome.iceServers[1]?.username).toMatch(/^\d+:/);

    const apollo = await connect(joined.token);
    expect(await apollo.next()).toMatchObject({
      type: 'welcome',
      role: 'apollo',
      peerPresent: true,
    });
    expect(await houston.next()).toEqual({ type: 'peer-joined' });

    const offer = { description: { type: 'offer', sdp: 'v=0' } };
    houston.send({ type: 'signal', data: offer });
    expect(await apollo.next()).toEqual({ type: 'signal', data: offer });

    apollo.send({ type: 'signal', data: { candidate: null } });
    expect(await houston.next()).toEqual({ type: 'signal', data: { candidate: null } });

    apollo.close();
    expect(await houston.next()).toEqual({ type: 'peer-left' });
    houston.close();
  });

  it('rejects unknown tokens', async () => {
    const client = await connect('nope');
    expect(await client.next()).toEqual({ type: 'error', code: 'unauthorized' });
    expect(await client.closed).toBe(CloseCode.Unauthorized);
  });

  it('reports malformed messages without dropping the connection', async () => {
    const { created } = await createAndJoin();
    const houston = await connect(created.token);
    await houston.next();
    houston.send({ type: 'signal', data: { nonsense: true } });
    expect(await houston.next()).toEqual({ type: 'error', code: 'invalid_message' });
    houston.send({ type: 'ping' });
    expect(await houston.next()).toEqual({ type: 'pong' });
    houston.close();
  });

  it('replaces an older connection of the same participant', async () => {
    const { created } = await createAndJoin();
    const first = await connect(created.token);
    await first.next();
    const second = await connect(created.token);
    expect(await second.next()).toMatchObject({ type: 'welcome', role: 'houston' });
    expect(await first.next()).toEqual({ type: 'error', code: 'replaced' });
    expect(await first.closed).toBe(CloseCode.Replaced);
    second.close();
  });

  it('ends the session for both sides', async () => {
    const { created, joined } = await createAndJoin();
    const houston = await connect(created.token);
    await houston.next();
    const apollo = await connect(joined.token);
    await apollo.next();
    await houston.next();

    apollo.send({ type: 'end' });
    expect(await houston.next()).toEqual({ type: 'ended', reason: 'hangup' });
    expect(await houston.closed).toBe(CloseCode.Ended);
    expect(await apollo.closed).toBe(CloseCode.Ended);

    const again = await connect(created.token);
    expect(await again.next()).toEqual({ type: 'error', code: 'unauthorized' });
  });
});
