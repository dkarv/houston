import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import {
  type ApiError,
  type CreateSessionResponse,
  type IceServer,
  JoinSessionRequest,
  type JoinSessionResponse,
  type ServerInfo,
} from '@houston/protocol';
import { createTurnCredentials } from '@houston/turn';
import { registerAccountRoutes } from './account-routes';
import { Accounts } from './accounts';
import type { Config } from './config';
import { openDatabase } from './db';
import { EventsHub } from './events';
import { directoryMailer, type Mailer, smtpMailer } from './mailer';
import { Push } from './push';
import { Rings } from './rings';
import { SessionStore } from './sessions';
import { SignalingHub } from './signaling';

const TURN_CREDENTIAL_TTL_SECONDS = 6 * 60 * 60;

export interface AppOptions {
  logger?: boolean;
  sessions?: SessionStore;
}

export async function buildApp(config: Config, options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
    trustProxy: config.trustProxy,
  });
  const sessions = options.sessions ?? new SessionStore();

  const iceServers = (sessionId: string, role: string): IceServer[] => {
    if (!config.turn.enabled) return [];
    const { host, port, secret } = config.turn;
    const { username, credential } = createTurnCredentials(
      secret,
      `${sessionId}-${role}`,
      TURN_CREDENTIAL_TTL_SECONDS,
    );
    return [
      { urls: `stun:${host}:${port}` },
      {
        urls: [`turn:${host}:${port}?transport=udp`, `turn:${host}:${port}?transport=tcp`],
        username,
        credential,
      },
    ];
  };
  const hub = new SignalingHub(sessions, (session, role) => iceServers(session.id, role), app.log);

  const db = openDatabase(join(config.dataDir, 'houston.db'));
  const mailer: Mailer | null =
    config.mail?.kind === 'smtp'
      ? smtpMailer(config.mail.url, config.mail.from)
      : config.mail?.kind === 'dir'
        ? directoryMailer(config.mail.dir)
        : null;
  const accounts = new Accounts(db, mailer, config.secret);
  const events = new EventsHub(accounts);
  const push = new Push(db, config.push, (message, details) => app.log.warn(details, message));
  const rings = new Rings({
    db,
    accounts,
    sessions,
    hub,
    events,
    push,
    mailer,
    publicUrl: config.publicUrl,
    secret: config.secret,
    log: (message, details) => app.log.warn(details, message),
  });
  if (!mailer) app.log.warn('No SMTP configured (HOUSTON_SMTP_URL): signing in is disabled');

  const pruneTimer = setInterval(() => {
    for (const id of sessions.prune()) hub.endSession(id, 'expired');
    accounts.prune();
  }, 60_000);
  app.addHook('onClose', async () => {
    clearInterval(pruneTimer);
    rings.close();
    db.close();
  });

  await app.register(fastifyRateLimit, { global: false });
  await app.register(fastifyWebsocket, { options: { maxPayload: 256 * 1024 } });

  app.get('/api/health', async () => ({ ok: true, sessions: sessions.size }));
  app.get('/api/info', async (): Promise<ServerInfo> => ({
    desktopDownloadUrl: config.desktopDownloadUrl,
  }));

  // TODO(accounts): only signed-in Houstons may create sessions. Until then this is open
  // and only rate limited.
  app.post(
    '/api/sessions',
    { config: { rateLimit: { max: config.rateLimitPerMinute, timeWindow: '1 minute' } } },
    async (): Promise<CreateSessionResponse> => {
      const session = sessions.create();
      return {
        sessionId: session.id,
        code: session.code,
        joinUrl: new URL(`/j/${session.code}`, config.publicUrl).toString(),
        token: session.houstonToken,
        expiresAt: session.joinBefore,
      };
    },
  );

  // Tight limit: the six-digit code is the only thing protecting a session.
  app.post(
    '/api/sessions/join',
    { config: { rateLimit: { max: config.rateLimitPerMinute, timeWindow: '1 minute' } } },
    async (request, reply): Promise<JoinSessionResponse | ApiError> => {
      const body = JoinSessionRequest.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'invalid_request' });

      const result = sessions.join(body.data.code);
      if (result === 'not_found') return reply.code(404).send({ error: 'not_found' });
      if (result === 'already_joined') return reply.code(409).send({ error: 'already_joined' });
      return { sessionId: result.session.id, token: result.token };
    },
  );

  app.get('/api/ws', { websocket: true }, (socket) => hub.handle(socket));

  registerAccountRoutes(app, {
    accounts,
    rings,
    push,
    events,
    rateLimitPerMinute: config.rateLimitPerMinute,
  });

  if (config.webDir) {
    const webDir = config.webDir;
    await app.register(fastifyStatic, {
      root: webDir,
      wildcard: false,
      index: false,
      // Serves the .br/.gz files made at build time (apps/app/scripts/compress.mjs).
      preCompressed: true,
      setHeaders(res, path) {
        // File names under _expo/static contain a content hash, so they never change.
        if (path.includes('/_expo/static/')) {
          res.header('cache-control', 'public, max-age=31536000, immutable');
        }
      },
    });
    const indexHtml = withAppHead(await readFile(join(webDir, 'index.html'), 'utf8'));
    // Client-side routes such as /j/123456 all load the single-page app.
    app.setNotFoundHandler((request, reply) => {
      if (request.method !== 'GET' || request.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'not_found' });
      }
      return reply.type('text/html').header('cache-control', 'no-cache').send(indexHtml);
    });
  }

  return app;
}

/**
 * Adds what installing Houston to a home screen needs (iPhones only deliver web push to
 * installed web apps). Expo's single-page export has no place for it.
 */
function withAppHead(html: string): string {
  if (html.includes('rel="manifest"')) return html;
  const head = [
    '<link rel="manifest" href="/manifest.webmanifest">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    '<meta name="theme-color" content="#0B3D91">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-title" content="Houston">',
  ].join('');
  return html.replace('</head>', `${head}</head>`);
}
