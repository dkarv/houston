import { execFileSync } from 'node:child_process';
import {
  createECDH,
  generateKeyPairSync,
  type KeyObject,
  randomBytes,
  verify as cryptoVerify,
} from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import type { IncomingHttpHeaders } from 'node:http';
import { createServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// web-push only speaks HTTPS, so the fake push service gets a throwaway certificate.
let tls: { key: Buffer; cert: Buffer };
let previousTlsSetting: string | undefined;
beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'houston-push-'));
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'ec',
      '-pkeyopt',
      'ec_paramgen_curve:prime256v1',
      '-nodes',
      '-keyout',
      join(dir, 'key.pem'),
      '-out',
      join(dir, 'cert.pem'),
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
    ],
    { stdio: 'ignore' },
  );
  tls = { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) };
  previousTlsSetting = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
});
afterAll(() => {
  if (previousTlsSetting === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTlsSetting;
});
import { openDatabase } from '../src/db';
import { generateVapidKeys, Push, signJwt } from '../src/push';

describe('web push', () => {
  let received: Array<{ headers: IncomingHttpHeaders; body: Buffer }>;
  let status: number;
  let server: ReturnType<typeof createServer>;
  let endpoint: string;

  beforeEach(async () => {
    received = [];
    status = 201;
    server = createServer(tls, (request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk) => chunks.push(chunk));
      request.on('end', () => {
        received.push({ headers: request.headers, body: Buffer.concat(chunks) });
        response.writeHead(status).end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    endpoint = `https://127.0.0.1:${(server.address() as AddressInfo).port}/push/abc`;
  });
  afterEach(() => server.close());

  function setup() {
    const db = openDatabase(':memory:');
    db.prepare(
      "INSERT INTO users (id, email, language, created_at) VALUES ('u1', 'h@example.com', 'en', 0)",
    ).run();
    const push = new Push(db, {
      webPush: { ...generateVapidKeys(), subject: 'mailto:ops@example.com' },
      apns: null,
      fcm: null,
    });
    // A browser's subscription keys: P-256 public key and a 16-byte auth secret.
    const browser = createECDH('prime256v1');
    browser.generateKeys();
    push.register('u1', {
      kind: 'web',
      subscription: {
        endpoint,
        keys: {
          p256dh: browser.getPublicKey().toString('base64url'),
          auth: randomBytes(16).toString('base64url'),
        },
      },
    });
    return { db, push };
  }

  const message = {
    title: 'Houston',
    body: 'Oma needs your help',
    data: { type: 'ring' as const, ringId: 'r1', callerName: 'Oma', url: 'https://x/ring/r1' },
  };

  it('delivers an encrypted, VAPID-signed message', async () => {
    const { push } = setup();
    await push.notify('u1', message);
    expect(received).toHaveLength(1);
    const { headers, body } = received[0]!;
    expect(headers['content-encoding']).toBe('aes128gcm');
    expect(headers.authorization).toMatch(/^vapid t=.+, k=.+/);
    expect(headers.urgency).toBe('high');
    // Encrypted: the plain text must not be visible.
    expect(body.toString('latin1')).not.toContain('Oma');
  });

  it('drops subscriptions the push service says are gone', async () => {
    const { db, push } = setup();
    status = 410;
    await push.notify('u1', message);
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM push_subscriptions').get() as {
      count: number;
    };
    expect(count).toBe(0);
  });
});

describe('provider tokens', () => {
  function verify(jwt: string, publicKey: KeyObject, algorithm: 'ES256' | 'RS256') {
    const [header, claims, signature] = jwt.split('.');
    return cryptoVerify(
      'sha256',
      Buffer.from(`${header}.${claims}`),
      algorithm === 'ES256' ? { key: publicKey, dsaEncoding: 'ieee-p1363' } : publicKey,
      Buffer.from(signature!, 'base64url'),
    );
  }

  it('signs APNs tokens as ES256 with a raw (r||s) signature', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const jwt = signJwt('ES256', { kid: 'KEY123' }, { iss: 'TEAM', iat: 1 }, pem);
    const header = JSON.parse(Buffer.from(jwt.split('.')[0]!, 'base64url').toString());
    expect(header).toEqual({ alg: 'ES256', typ: 'JWT', kid: 'KEY123' });
    expect(Buffer.from(jwt.split('.')[2]!, 'base64url')).toHaveLength(64);
    expect(verify(jwt, publicKey, 'ES256')).toBe(true);
  });

  it('signs FCM service-account assertions as RS256', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const jwt = signJwt('RS256', {}, { iss: 'svc@example.iam' }, pem);
    expect(verify(jwt, publicKey, 'RS256')).toBe(true);
  });
});
