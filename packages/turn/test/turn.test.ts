import { createHmac } from 'node:crypto';
import { connect } from 'turn-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTurnCredentials, startTurnServer, type TurnServerHandle } from '../src';
import { sourcePrefix } from '../src/rate-limit';

const SECRET = 'test-secret-0123456789';
const PORT = 34780;

describe('createTurnCredentials', () => {
  it('follows the TURN REST API scheme', () => {
    const { username, credential } = createTurnCredentials(SECRET, 'abc-houston', 60, 1_000_000);
    expect(username).toBe('1060:abc-houston');
    expect(credential).toBe(createHmac('sha1', SECRET).update(username).digest('base64'));
  });
});

describe('sourcePrefix', () => {
  it('groups IPv4 by /24 and IPv6 by /56', () => {
    expect(sourcePrefix('203.0.113.7')).toBe('203.0.113');
    expect(sourcePrefix('::ffff:203.0.113.7')).toBe('203.0.113');
    expect(sourcePrefix('2001:db8:1:23ab::1')).toBe('2001:db8:1:23');
    expect(sourcePrefix('2001:db8::1')).toBe('2001:db8:0:00');
  });
});

describe('startTurnServer', () => {
  let server: TurnServerHandle;

  beforeAll(async () => {
    server = await startTurnServer({
      secret: SECRET,
      realm: 'test',
      port: PORT,
      relayIp: '127.0.0.1',
      relayPortRange: [49300, 49310],
    });
  });
  afterAll(() => server.stop());

  function allocate(username: string, password: string) {
    return new Promise<'ok' | 'error'>((resolve) => {
      connect(`turn:127.0.0.1:${PORT}?transport=udp`, { username, password }, (err, socket) => {
        if (err) return resolve('error');
        socket.on('allocate:success', () => {
          socket.close();
          resolve('ok');
        });
        socket.on('allocate:error', () => {
          socket.close();
          resolve('error');
        });
        socket.allocate();
      });
    });
  }

  it('allocates a relay with valid credentials', async () => {
    const { username, credential } = createTurnCredentials(SECRET, 'user', 60);
    expect(await allocate(username, credential)).toBe('ok');
  });

  it('rejects a wrong secret', async () => {
    const { username, credential } = createTurnCredentials('another-secret-xyz', 'user', 60);
    expect(await allocate(username, credential)).toBe('error');
  });

  it('rejects expired credentials', async () => {
    const { username, credential } = createTurnCredentials(SECRET, 'user', -10);
    expect(await allocate(username, credential)).toBe('error');
  });
});
