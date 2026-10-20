import { createSign, randomBytes } from 'node:crypto';
import { connect as connectHttp2 } from 'node:http2';
import webpush from 'web-push';
import type { PushConfig, RegisterPushRequest, RingNotification } from '@houston/protocol';
import type { Database } from './db';

/** What every channel needs to show a notification. */
export interface PushMessage {
  title: string;
  body: string;
  data: RingNotification;
}

type SendResult = 'ok' | 'gone' | 'error';

interface Subscription {
  id: string;
  kind: 'web' | 'apns' | 'fcm';
  address: string;
  keys: string | null;
}

export interface ApnsConfig {
  /** Contents of the .p8 key from the Apple developer account. */
  key: string;
  keyId: string;
  teamId: string;
  bundleId: string;
  production: boolean;
}

export interface FcmServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri: string;
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url');
}

export function signJwt(algorithm: 'ES256' | 'RS256', header: object, claims: object, key: string) {
  const unsigned = `${base64url(JSON.stringify({ alg: algorithm, typ: 'JWT', ...header }))}.${base64url(JSON.stringify(claims))}`;
  const signer = createSign('SHA256');
  signer.update(unsigned);
  const signature =
    algorithm === 'ES256' ? signer.sign({ key, dsaEncoding: 'ieee-p1363' }) : signer.sign(key);
  return `${unsigned}.${base64url(signature)}`;
}

/** Apple Push Notification service over HTTP/2 with a token (.p8) key. */
class ApnsSender {
  private jwt: { value: string; issuedAt: number } | null = null;

  constructor(private readonly config: ApnsConfig) {}

  async send(deviceToken: string, message: PushMessage): Promise<SendResult> {
    const host = this.config.production
      ? 'https://api.push.apple.com'
      : 'https://api.sandbox.push.apple.com';
    const body = JSON.stringify({
      aps: { alert: { title: message.title, body: message.body }, sound: 'default' },
      ...message.data,
    });

    return new Promise((resolve) => {
      const client = connectHttp2(host);
      client.on('error', () => resolve('error'));
      const request = client.request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        authorization: `bearer ${this.token()}`,
        'apns-topic': this.config.bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      });
      let status = 0;
      let response = '';
      request.on('response', (headers) => (status = Number(headers[':status'])));
      request.on('data', (chunk) => (response += chunk));
      request.on('end', () => {
        client.close();
        if (status === 200) resolve('ok');
        else if (status === 410 || response.includes('BadDeviceToken')) resolve('gone');
        else resolve('error');
      });
      request.on('error', () => resolve('error'));
      request.end(body);
    });
  }

  /** Apple wants the provider token refreshed between 20 and 60 minutes. */
  private token() {
    const now = Math.floor(Date.now() / 1000);
    if (!this.jwt || now - this.jwt.issuedAt > 45 * 60) {
      const value = signJwt(
        'ES256',
        { kid: this.config.keyId },
        { iss: this.config.teamId, iat: now },
        this.config.key,
      );
      this.jwt = { value, issuedAt: now };
    }
    return this.jwt.value;
  }
}

/** Firebase Cloud Messaging HTTP v1 API with a service account. */
class FcmSender {
  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly account: FcmServiceAccount) {}

  async send(deviceToken: string, message: PushMessage): Promise<SendResult> {
    let token: string;
    try {
      token = await this.token();
    } catch {
      return 'error';
    }
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: deviceToken,
            notification: { title: message.title, body: message.body },
            // FCM data values must be strings.
            data: Object.fromEntries(
              Object.entries(message.data).map(([key, value]) => [key, String(value ?? '')]),
            ),
            android: { priority: 'high' },
          },
        }),
      },
    ).catch(() => null);
    if (!response) return 'error';
    if (response.ok) return 'ok';
    const text = await response.text();
    return response.status === 404 || text.includes('UNREGISTERED') ? 'gone' : 'error';
  }

  private async token() {
    const now = Math.floor(Date.now() / 1000);
    if (this.accessToken && this.accessToken.expiresAt - 60 > now) return this.accessToken.value;
    const assertion = signJwt(
      'RS256',
      {},
      {
        iss: this.account.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: this.account.token_uri,
        iat: now,
        exp: now + 3600,
      },
      this.account.private_key,
    );
    const response = await fetch(this.account.token_uri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!response.ok) throw new Error(`FCM token request failed: ${response.status}`);
    const body = (await response.json()) as { access_token: string; expires_in: number };
    this.accessToken = { value: body.access_token, expiresAt: now + body.expires_in };
    return body.access_token;
  }
}

export interface PushOptions {
  webPush: { publicKey: string; privateKey: string; subject: string } | null;
  apns: ApnsConfig | null;
  fcm: FcmServiceAccount | null;
}

/** Stores device subscriptions and delivers notifications to all of a user's devices. */
export class Push {
  private readonly apns: ApnsSender | null;
  private readonly fcm: FcmSender | null;

  constructor(
    private readonly db: Database,
    private readonly options: PushOptions,
    private readonly log: (message: string, details?: object) => void = () => {},
  ) {
    this.apns = options.apns ? new ApnsSender(options.apns) : null;
    this.fcm = options.fcm ? new FcmSender(options.fcm) : null;
  }

  get config(): PushConfig {
    return {
      webPushPublicKey: this.options.webPush?.publicKey ?? null,
      apns: Boolean(this.apns),
      fcm: Boolean(this.fcm),
    };
  }

  register(userId: string, request: RegisterPushRequest) {
    const address = request.kind === 'web' ? request.subscription.endpoint : request.token;
    const keys = request.kind === 'web' ? JSON.stringify(request.subscription.keys) : null;
    // A device that changes hands (sign-out, other account) moves with its address.
    this.db
      .prepare(
        `INSERT INTO push_subscriptions (id, user_id, kind, address, keys, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (address) DO UPDATE SET user_id = excluded.user_id, keys = excluded.keys`,
      )
      .run(randomBytes(12).toString('base64url'), userId, request.kind, address, keys, Date.now());
  }

  unregister(userId: string, address: string) {
    this.db
      .prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND address = ?')
      .run(userId, address);
  }

  async notify(userId: string, message: PushMessage): Promise<void> {
    const subscriptions = this.db
      .prepare('SELECT id, kind, address, keys FROM push_subscriptions WHERE user_id = ?')
      .all(userId) as unknown as Subscription[];

    await Promise.all(
      subscriptions.map(async (subscription) => {
        const result = await this.sendOne(subscription, message);
        if (result === 'gone') {
          this.db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(subscription.id);
        } else if (result === 'error') {
          this.log('push delivery failed', { kind: subscription.kind });
        }
      }),
    );
  }

  private async sendOne(subscription: Subscription, message: PushMessage): Promise<SendResult> {
    switch (subscription.kind) {
      case 'web': {
        const web = this.options.webPush;
        if (!web || !subscription.keys) return 'error';
        try {
          await webpush.sendNotification(
            { endpoint: subscription.address, keys: JSON.parse(subscription.keys) },
            JSON.stringify(message),
            {
              vapidDetails: web,
              TTL: 5 * 60,
              urgency: 'high',
            },
          );
          return 'ok';
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          return status === 404 || status === 410 ? 'gone' : 'error';
        }
      }
      case 'apns':
        return this.apns ? this.apns.send(subscription.address, message) : 'error';
      case 'fcm':
        return this.fcm ? this.fcm.send(subscription.address, message) : 'error';
    }
  }
}

export function generateVapidKeys() {
  return webpush.generateVAPIDKeys();
}
