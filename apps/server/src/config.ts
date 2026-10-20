import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { type FcmServiceAccount, generateVapidKeys, type PushOptions } from './push';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const portRange = z
  .string()
  .regex(/^\d+-\d+$/)
  .transform((value) => value.split('-').map(Number) as [number, number])
  .refine(([min, max]) => min > 1023 && min <= max && max <= 65535, 'invalid port range');

const Env = z.object({
  HOUSTON_HOST: z.string().default('0.0.0.0'),
  HOUSTON_PORT: z.coerce.number().int().default(3000),
  /** The URL people open, as served by the reverse proxy. */
  HOUSTON_PUBLIC_URL: z.url().default('http://localhost:3000'),
  HOUSTON_DATA_DIR: z.string().default('./data'),
  /** Built web app to serve; nothing is served when unset or missing. */
  HOUSTON_WEB_DIR: z.string().optional(),
  /** Proxies whose X-Forwarded-For is trusted (proxy-addr syntax). */
  HOUSTON_TRUST_PROXY: z.string().default('loopback,linklocal,uniquelocal'),
  /** Per client IP, for creating and for joining sessions. */
  HOUSTON_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),

  HOUSTON_TURN_ENABLED: bool.default(true),
  /** Hostname clients use for STUN/TURN; defaults to the public URL's host. */
  HOUSTON_TURN_HOST: z.string().optional(),
  HOUSTON_TURN_PORT: z.coerce.number().int().default(3478),
  /** Public IP of the relay; needed when the server itself is behind NAT. */
  HOUSTON_TURN_EXTERNAL_IP: z.string().optional(),
  HOUSTON_TURN_RELAY_PORTS: portRange.default([49160, 49200]),
  /** Generated and stored in the data directory when unset. */
  HOUSTON_TURN_SECRET: z.string().min(16).optional(),
  /** Local development only: both peers are on a private network. */
  HOUSTON_TURN_ALLOW_PRIVATE_PEERS: bool.default(false),

  /** E.g. smtps://user:password@mail.example.com:465; without it there is no sign-in. */
  HOUSTON_SMTP_URL: z.string().optional(),
  HOUSTON_MAIL_FROM: z.string().optional(),
  /** Development and tests: write mails as JSON files here instead of sending them. */
  HOUSTON_MAIL_DIR: z.string().optional(),

  HOUSTON_WEB_PUSH_ENABLED: bool.default(true),
  /** Apple push (.p8 token key); all four are needed to enable it. */
  HOUSTON_APNS_KEY_FILE: z.string().optional(),
  HOUSTON_APNS_KEY_ID: z.string().optional(),
  HOUSTON_APNS_TEAM_ID: z.string().optional(),
  HOUSTON_APNS_BUNDLE_ID: z.string().optional(),
  /** false for development builds, which use Apple's sandbox. */
  HOUSTON_APNS_PRODUCTION: bool.default(true),
  /** Firebase service account JSON for Android push. */
  HOUSTON_FCM_SERVICE_ACCOUNT_FILE: z.string().optional(),

  /** Download page for the desktop app, offered when a helper asks for control. */
  HOUSTON_DESKTOP_DOWNLOAD_URL: z.url().optional(),
});

export interface Config {
  host: string;
  port: number;
  publicUrl: URL;
  dataDir: string;
  webDir: string | undefined;
  trustProxy: string;
  rateLimitPerMinute: number;
  turn:
    | {
        enabled: true;
        host: string;
        port: number;
        externalIp: string | undefined;
        relayPortRange: [number, number];
        secret: string;
        allowPrivatePeers: boolean;
      }
    | { enabled: false };
  /** Signs login codes and caller hashes. */
  secret: string;
  mail: { kind: 'smtp'; url: string; from: string } | { kind: 'dir'; dir: string } | null;
  push: PushOptions;
  desktopDownloadUrl: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(parsed.error)}`);
  }
  const e = parsed.data;
  const publicUrl = new URL(e.HOUSTON_PUBLIC_URL);
  const dataDir = resolve(e.HOUSTON_DATA_DIR);
  mkdirSync(dataDir, { recursive: true });

  const webDir = e.HOUSTON_WEB_DIR ? resolve(e.HOUSTON_WEB_DIR) : undefined;
  const fromAddress = (e.HOUSTON_MAIL_FROM?.match(/<(.+)>/)?.[1] ?? e.HOUSTON_MAIL_FROM)?.trim();

  return {
    host: e.HOUSTON_HOST,
    port: e.HOUSTON_PORT,
    publicUrl,
    dataDir,
    webDir: webDir && existsSync(join(webDir, 'index.html')) ? webDir : undefined,
    trustProxy: e.HOUSTON_TRUST_PROXY,
    rateLimitPerMinute: e.HOUSTON_RATE_LIMIT_PER_MINUTE,
    turn: e.HOUSTON_TURN_ENABLED
      ? {
          enabled: true,
          host: e.HOUSTON_TURN_HOST ?? publicUrl.hostname,
          port: e.HOUSTON_TURN_PORT,
          externalIp: e.HOUSTON_TURN_EXTERNAL_IP,
          relayPortRange: e.HOUSTON_TURN_RELAY_PORTS,
          secret: e.HOUSTON_TURN_SECRET ?? persistedSecret(join(dataDir, 'turn-secret')),
          allowPrivatePeers: e.HOUSTON_TURN_ALLOW_PRIVATE_PEERS,
        }
      : { enabled: false },
    secret: persistedSecret(join(dataDir, 'app-secret')),
    desktopDownloadUrl: e.HOUSTON_DESKTOP_DOWNLOAD_URL ?? null,
    mail: e.HOUSTON_MAIL_DIR
      ? { kind: 'dir', dir: resolve(e.HOUSTON_MAIL_DIR) }
      : e.HOUSTON_SMTP_URL
        ? {
            kind: 'smtp',
            url: e.HOUSTON_SMTP_URL,
            from: e.HOUSTON_MAIL_FROM ?? `Houston <houston@${publicUrl.hostname}>`,
          }
        : null,
    push: {
      webPush: e.HOUSTON_WEB_PUSH_ENABLED
        ? {
            ...persistedVapidKeys(join(dataDir, 'vapid.json')),
            // Push services contact this address if something goes wrong.
            subject: fromAddress ? `mailto:${fromAddress}` : publicUrl.origin,
          }
        : null,
      apns:
        e.HOUSTON_APNS_KEY_FILE &&
        e.HOUSTON_APNS_KEY_ID &&
        e.HOUSTON_APNS_TEAM_ID &&
        e.HOUSTON_APNS_BUNDLE_ID
          ? {
              key: readFileSync(e.HOUSTON_APNS_KEY_FILE, 'utf8'),
              keyId: e.HOUSTON_APNS_KEY_ID,
              teamId: e.HOUSTON_APNS_TEAM_ID,
              bundleId: e.HOUSTON_APNS_BUNDLE_ID,
              production: e.HOUSTON_APNS_PRODUCTION,
            }
          : null,
      fcm: e.HOUSTON_FCM_SERVICE_ACCOUNT_FILE
        ? (JSON.parse(
            readFileSync(e.HOUSTON_FCM_SERVICE_ACCOUNT_FILE, 'utf8'),
          ) as FcmServiceAccount)
        : null,
    },
  };
}

function persistedVapidKeys(file: string): { publicKey: string; privateKey: string } {
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const keys = generateVapidKeys();
  writeFileSync(file, JSON.stringify(keys), { mode: 0o600 });
  return keys;
}

function persistedSecret(file: string): string {
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const secret = randomBytes(32).toString('base64url');
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}
