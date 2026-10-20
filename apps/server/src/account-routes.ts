import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  type AnswerRingResponse,
  type ApiError,
  type AuthResponse,
  type PushConfig,
  RegisterPushRequest,
  RequestCodeRequest,
  RingRequest,
  type RingList,
  type RingResponse,
  UpdateMeRequest,
  type User,
  VerifyCodeRequest,
} from '@houston/protocol';
import type { AccountUser, Accounts } from './accounts';
import type { EventsHub } from './events';
import { languageFrom } from './messages';
import type { Push } from './push';
import type { Rings } from './rings';

interface Deps {
  accounts: Accounts;
  rings: Rings;
  push: Push;
  events: EventsHub;
  rateLimitPerMinute: number;
}

function bearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

function publicUser(user: AccountUser): User {
  return { id: user.id, email: user.email, displayName: user.displayName };
}

function fail(reply: FastifyReply, status: number, error: ApiError['error']) {
  return reply.code(status).send({ error } satisfies ApiError);
}

/** Optional accounts for Houstons: sign-in by emailed code, rings, push subscriptions. */
export function registerAccountRoutes(app: FastifyInstance, deps: Deps) {
  const { accounts, rings, push, events } = deps;
  const limit = (max: number, minutes = 1) => ({
    config: { rateLimit: { max, timeWindow: `${minutes} minute` } },
  });

  /** Resolves the signed-in user or answers 401. */
  function requireUser(request: FastifyRequest, reply: FastifyReply): AccountUser | null {
    const token = bearer(request);
    const user = token ? accounts.authenticate(token) : null;
    if (!user) fail(reply, 401, 'unauthorized');
    return user;
  }

  // ── Sign-in ───────────────────────────────────────────────────────────

  app.post('/api/auth/code', limit(deps.rateLimitPerMinute), async (request, reply) => {
    if (!accounts.available) return fail(reply, 503, 'unavailable');
    const body = RequestCodeRequest.safeParse(request.body);
    if (!body.success) return fail(reply, 400, 'invalid_request');
    try {
      await accounts.requestCode(body.data.email, languageFrom(request.headers['accept-language']));
    } catch (error) {
      request.log.error({ error: String(error) }, 'sending sign-in code failed');
      return fail(reply, 500, 'internal');
    }
    return reply.code(204).send();
  });

  app.post('/api/auth/verify', limit(deps.rateLimitPerMinute), async (request, reply) => {
    const body = VerifyCodeRequest.safeParse(request.body);
    if (!body.success) return fail(reply, 400, 'invalid_request');
    const result = accounts.verifyCode(
      body.data.email,
      body.data.code,
      languageFrom(request.headers['accept-language']),
    );
    if (!result) return fail(reply, 400, 'invalid_code');
    return { token: result.token, user: publicUser(result.user) } satisfies AuthResponse;
  });

  app.post('/api/auth/signout', async (request, reply) => {
    const token = bearer(request);
    if (token) accounts.signOut(token);
    return reply.code(204).send();
  });

  app.get('/api/me', async (request, reply) => {
    const user = requireUser(request, reply);
    return user ? publicUser(user) : reply;
  });

  app.patch('/api/me', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const body = UpdateMeRequest.safeParse(request.body);
    if (!body.success) return fail(reply, 400, 'invalid_request');
    accounts.update(user.id, { displayName: body.data.displayName });
    return publicUser(accounts.findById(user.id)!);
  });

  // ── Push subscriptions ────────────────────────────────────────────────

  app.get('/api/push/config', async () => push.config satisfies PushConfig);

  app.post('/api/push', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const body = RegisterPushRequest.safeParse(request.body);
    if (!body.success) return fail(reply, 400, 'invalid_request');
    push.register(user.id, body.data);
    return reply.code(204).send();
  });

  // ── Rings ─────────────────────────────────────────────────────────────

  // Anonymous on purpose: Apollo never needs an account.
  app.post('/api/rings', limit(10, 10), async (request, reply) => {
    const body = RingRequest.safeParse(request.body);
    if (!body.success) return fail(reply, 400, 'invalid_request');
    return rings.ring(body.data, request.ip) satisfies RingResponse;
  });

  app.get('/api/rings', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    return { rings: rings.list(user.id) } satisfies RingList;
  });

  app.post<{ Params: { id: string } }>('/api/rings/:id/answer', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const result = rings.answer(user.id, request.params.id);
    if (result === 'not_found') return fail(reply, 404, 'not_found');
    if (result === 'gone') return fail(reply, 409, 'already_joined');
    return result satisfies AnswerRingResponse;
  });

  for (const action of ['decline', 'block'] as const) {
    app.post<{ Params: { id: string } }>(`/api/rings/:id/${action}`, async (request, reply) => {
      const user = requireUser(request, reply);
      if (!user) return reply;
      const result = rings[action](user.id, request.params.id);
      if (result === 'not_found') return fail(reply, 404, 'not_found');
      return reply.code(204).send();
    });
  }

  app.get('/api/events', { websocket: true }, (socket) => events.handle(socket));
}
