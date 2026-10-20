import {
  AnswerRingResponse,
  ApiError,
  AuthResponse,
  CreateSessionResponse,
  JoinSessionResponse,
  PushConfig,
  type RegisterPushRequest,
  RingList,
  type RingRequest,
  RingResponse,
  ServerInfo,
  User,
} from '@houston/protocol';

export class HoustonApiError extends Error {
  readonly code: ApiError['error'];

  constructor(code: ApiError['error'], message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

const empty = { parse: () => undefined };

/** Typed client for the Houston server's REST API. */
export class HoustonApi {
  readonly baseUrl: string;
  /** Auth token of the signed-in Houston, if any. */
  token: string | null;

  constructor(baseUrl: string, token: string | null = null) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  info() {
    return this.request('GET', '/api/info', undefined, ServerInfo);
  }

  // ── Sessions (anonymous) ──────────────────────────────────────────────

  createSession() {
    return this.request('POST', '/api/sessions', undefined, CreateSessionResponse);
  }

  joinSession(code: string) {
    return this.request('POST', '/api/sessions/join', { code }, JoinSessionResponse);
  }

  /** Apollo calls a Houston by email address. */
  ring(request: RingRequest) {
    return this.request('POST', '/api/rings', request, RingResponse);
  }

  // ── Accounts ──────────────────────────────────────────────────────────

  requestCode(email: string) {
    return this.request('POST', '/api/auth/code', { email }, empty);
  }

  async verifyCode(email: string, code: string) {
    const result = await this.request('POST', '/api/auth/verify', { email, code }, AuthResponse);
    this.token = result.token;
    return result;
  }

  async signOut() {
    await this.request('POST', '/api/auth/signout', undefined, empty);
    this.token = null;
  }

  me() {
    return this.request('GET', '/api/me', undefined, User);
  }

  updateMe(displayName: string | null) {
    return this.request('PATCH', '/api/me', { displayName }, User);
  }

  // ── Rings and push (signed in) ────────────────────────────────────────

  rings() {
    return this.request('GET', '/api/rings', undefined, RingList);
  }

  answerRing(id: string) {
    return this.request(
      'POST',
      `/api/rings/${encodeURIComponent(id)}/answer`,
      undefined,
      AnswerRingResponse,
    );
  }

  declineRing(id: string) {
    return this.request('POST', `/api/rings/${encodeURIComponent(id)}/decline`, undefined, empty);
  }

  blockCaller(id: string) {
    return this.request('POST', `/api/rings/${encodeURIComponent(id)}/block`, undefined, empty);
  }

  pushConfig() {
    return this.request('GET', '/api/push/config', undefined, PushConfig);
  }

  registerPush(request: RegisterPushRequest) {
    return this.request('POST', '/api/push', request, empty);
  }

  // ── WebSocket URLs ────────────────────────────────────────────────────

  websocketUrl(path: '/api/ws' | '/api/events') {
    const url = new URL(path, this.baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.toString();
  }

  private async request<T>(
    method: string,
    path: string,
    body: unknown,
    schema: { parse(data: unknown): T },
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (this.token) headers.authorization = `Bearer ${this.token}`;

    let response: Response;
    try {
      response = await fetch(new URL(path, this.baseUrl).toString(), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw new HoustonApiError('internal', String(error));
    }
    const data: unknown =
      response.status === 204 ? undefined : await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 429) throw new HoustonApiError('rate_limited');
      const parsed = ApiError.safeParse(data);
      throw new HoustonApiError(parsed.success ? parsed.data.error : 'internal');
    }
    return schema.parse(data);
  }
}
