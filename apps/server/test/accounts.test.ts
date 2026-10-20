import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  AnswerRingResponse,
  AuthResponse,
  EventsServerMessage,
  RingList,
  RingResponse,
  ServerMessage,
} from '@houston/protocol';
import { connectSocket, startServer, type TestServer } from './helpers';

let server: TestServer;
beforeEach(async () => {
  server = await startServer();
});
afterEach(() => server.app.close());

async function signIn(email: string): Promise<AuthResponse> {
  const requested = await server.request('POST', '/api/auth/code', { body: { email } });
  expect(requested.status).toBe(204);
  const mail = server.mails().findLast((m) => m.to === email.toLowerCase())!;
  const code = mail.subject.match(/\d{6}/)![0];
  const verified = await server.request<AuthResponse>('POST', '/api/auth/verify', {
    body: { email, code },
  });
  expect(verified.status).toBe(200);
  return verified.body;
}

const deviceId = 'device-0123456789abcdef';

describe('sign-in', () => {
  it('creates the account on first sign-in and keeps it afterwards', async () => {
    const first = await signIn('Helper@Example.com');
    expect(first.user.email).toBe('helper@example.com');

    const me = await server.request('GET', '/api/me', { token: first.token });
    expect(me.body).toEqual(first.user);

    // A new code for the same address signs into the same account.
    const again = await server.request('POST', '/api/auth/code', {
      body: { email: 'helper@example.com' },
    });
    expect(again.status).toBe(204);
  });

  it('rejects wrong codes and locks the code after five attempts', async () => {
    await server.request('POST', '/api/auth/code', { body: { email: 'a@example.com' } });
    const code = server.mails()[0]!.subject.match(/\d{6}/)![0];
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const result = await server.request('POST', '/api/auth/verify', {
        body: { email: 'a@example.com', code: wrong },
      });
      expect(result.body).toEqual({ error: 'invalid_code' });
    }
    const right = await server.request('POST', '/api/auth/verify', {
      body: { email: 'a@example.com', code },
    });
    expect(right.status).toBe(400);
  });

  it('signs out', async () => {
    const { token } = await signIn('b@example.com');
    await server.request('POST', '/api/auth/signout', { token });
    expect((await server.request('GET', '/api/me', { token })).status).toBe(401);
  });

  it('is unavailable without a mail server', async () => {
    const bare = await startServer({ HOUSTON_MAIL_DIR: '' });
    const result = await bare.request('POST', '/api/auth/code', {
      body: { email: 'c@example.com' },
    });
    expect(result.status).toBe(503);
    await bare.app.close();
  });
});

describe('rings', () => {
  it('rings a Houston, who answers and joins the call', async () => {
    const houston = await signIn('houston@example.com');
    const events = await connectSocket<EventsServerMessage>(`ws://${server.base}/api/events`, {
      type: 'hello',
      authToken: houston.token,
    });
    expect(await events.next()).toEqual({ type: 'ready' });

    const ring = await server.request<RingResponse>('POST', '/api/rings', {
      body: { email: 'HOUSTON@example.com', callerName: 'Oma', deviceId },
    });
    expect(ring.status).toBe(200);

    const incoming = await events.next();
    expect(incoming).toMatchObject({
      type: 'ring',
      ring: { callerName: 'Oma', status: 'ringing' },
    });
    if (incoming.type !== 'ring') throw new Error();

    const mail = server.mails().findLast((m) => m.to === 'houston@example.com')!;
    expect(mail.subject).toContain('Oma');
    expect(mail.text).toContain(`https://help.example.com/ring/${incoming.ring.id}`);

    const answered = await server.request<AnswerRingResponse>(
      'POST',
      `/api/rings/${incoming.ring.id}/answer`,
      { token: houston.token },
    );
    expect(answered.body.sessionId).toBe(ring.body.sessionId);
    expect(await events.next()).toMatchObject({ type: 'ring', ring: { status: 'answered' } });

    const apollo = await connectSocket<ServerMessage>(`ws://${server.base}/api/ws`, {
      type: 'hello',
      token: ring.body.token,
    });
    expect(await apollo.next()).toMatchObject({ type: 'welcome', role: 'apollo' });
    const houstonCall = await connectSocket<ServerMessage>(`ws://${server.base}/api/ws`, {
      type: 'hello',
      token: answered.body.token,
    });
    expect(await houstonCall.next()).toMatchObject({
      type: 'welcome',
      role: 'houston',
      peerPresent: true,
    });

    // Answering twice doesn't work.
    const twice = await server.request('POST', `/api/rings/${incoming.ring.id}/answer`, {
      token: houston.token,
    });
    expect(twice.status).toBe(409);
    events.close();
    apollo.close();
    houstonCall.close();
  });

  it('answers unknown addresses exactly like known ones', async () => {
    const ring = await server.request<RingResponse>('POST', '/api/rings', {
      body: { email: 'nobody@example.com', deviceId },
    });
    expect(ring.status).toBe(200);
    expect(Object.keys(ring.body).sort()).toEqual(['sessionId', 'token']);
    expect(server.mails()).toHaveLength(0);

    const apollo = await connectSocket<ServerMessage>(`ws://${server.base}/api/ws`, {
      type: 'hello',
      token: ring.body.token,
    });
    expect(await apollo.next()).toMatchObject({
      type: 'welcome',
      role: 'apollo',
      peerPresent: false,
    });
    apollo.close();
  });

  it('tells Apollo "unanswered" when the Houston declines', async () => {
    const houston = await signIn('d@example.com');
    const ring = await server.request<RingResponse>('POST', '/api/rings', {
      body: { email: 'd@example.com', deviceId },
    });
    const apollo = await connectSocket<ServerMessage>(`ws://${server.base}/api/ws`, {
      type: 'hello',
      token: ring.body.token,
    });
    await apollo.next();

    const { body } = await server.request<RingList>('GET', '/api/rings', { token: houston.token });
    await server.request('POST', `/api/rings/${body.rings[0]!.id}/decline`, {
      token: houston.token,
    });
    expect(await apollo.next()).toEqual({ type: 'ended', reason: 'unanswered' });

    const after = await server.request<RingList>('GET', '/api/rings', { token: houston.token });
    expect(after.body.rings[0]!.status).toBe('declined');
  });

  it('marks a ring missed when Apollo hangs up first', async () => {
    const houston = await signIn('e@example.com');
    const ring = await server.request<RingResponse>('POST', '/api/rings', {
      body: { email: 'e@example.com', deviceId },
    });
    const apollo = await connectSocket<ServerMessage>(`ws://${server.base}/api/ws`, {
      type: 'hello',
      token: ring.body.token,
    });
    await apollo.next();
    apollo.send({ type: 'end' });
    await apollo.closed;
    const { body } = await server.request<RingList>('GET', '/api/rings', { token: houston.token });
    expect(body.rings[0]!.status).toBe('missed');
  });

  it('drops rings from blocked callers silently', async () => {
    const houston = await signIn('f@example.com');
    await server.request('POST', '/api/rings', { body: { email: 'f@example.com', deviceId } });
    const { body } = await server.request<RingList>('GET', '/api/rings', { token: houston.token });
    await server.request('POST', `/api/rings/${body.rings[0]!.id}/block`, { token: houston.token });

    const again = await server.request<RingResponse>('POST', '/api/rings', {
      body: { email: 'f@example.com', deviceId },
    });
    expect(again.status).toBe(200);
    const after = await server.request<RingList>('GET', '/api/rings', { token: houston.token });
    expect(after.body.rings).toHaveLength(1);
  });

  it('requires sign-in to see and answer rings', async () => {
    expect((await server.request('GET', '/api/rings')).status).toBe(401);
    expect((await server.request('POST', '/api/rings/x/answer')).status).toBe(401);
  });
});
