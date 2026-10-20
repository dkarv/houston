import { z } from 'zod';

/**
 * Houston helps, Apollo needs help. Every session has exactly one of each.
 */
export const Role = z.enum(['houston', 'apollo']);
export type Role = z.infer<typeof Role>;

/** Six digits, short enough to read out over the phone. */
export const SessionCode = z.string().regex(/^\d{6}$/);
export type SessionCode = z.infer<typeof SessionCode>;

// ── REST ────────────────────────────────────────────────────────────────

export const CreateSessionResponse = z.object({
  sessionId: z.string(),
  code: SessionCode,
  joinUrl: z.string(),
  token: z.string(),
  expiresAt: z.number(),
});
export type CreateSessionResponse = z.infer<typeof CreateSessionResponse>;

export const JoinSessionRequest = z.object({
  code: SessionCode,
});
export type JoinSessionRequest = z.infer<typeof JoinSessionRequest>;

export const JoinSessionResponse = z.object({
  sessionId: z.string(),
  token: z.string(),
});
export type JoinSessionResponse = z.infer<typeof JoinSessionResponse>;

export const ApiError = z.object({
  error: z.enum([
    'invalid_request',
    'not_found',
    'already_joined',
    'rate_limited',
    'unauthorized',
    'invalid_code',
    /** The server isn't configured for this, e.g. no SMTP for sign-in codes. */
    'unavailable',
    'internal',
  ]),
  message: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiError>;

// ── WebRTC payloads ─────────────────────────────────────────────────────

export const IceServer = z.object({
  urls: z.union([z.string(), z.array(z.string())]),
  username: z.string().optional(),
  credential: z.string().optional(),
});
export type IceServer = z.infer<typeof IceServer>;

export const SessionDescription = z.object({
  type: z.enum(['offer', 'answer', 'pranswer', 'rollback']),
  sdp: z.string().max(200_000).optional(),
});

export const IceCandidate = z.object({
  candidate: z.string().max(2_000),
  sdpMid: z.string().nullable().optional(),
  sdpMLineIndex: z.number().int().nullable().optional(),
  usernameFragment: z.string().nullable().optional(),
});

/** What the server relays between the two peers without looking inside. */
export const SignalData = z.union([
  z.object({ description: SessionDescription }),
  z.object({ candidate: IceCandidate.nullable() }),
]);
export type SignalData = z.infer<typeof SignalData>;

// ── Signaling WebSocket ─────────────────────────────────────────────────

/** Why a session ended, as told to the participants. */
export const EndReason = z.enum([
  'hangup',
  /** Nobody answered a ring in time (or the helper declined; Apollo can't tell). */
  'unanswered',
  /** The session reached its maximum lifetime. */
  'expired',
]);
export type EndReason = z.infer<typeof EndReason>;

export const ClientMessage = z.discriminatedUnion('type', [
  /** First message on every connection; the token comes from the REST call. */
  z.object({ type: z.literal('hello'), token: z.string().max(200) }),
  z.object({ type: z.literal('signal'), data: SignalData }),
  /** Ends the session for both sides. */
  z.object({ type: z.literal('end') }),
  z.object({ type: z.literal('ping') }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export const ServerMessage = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('welcome'),
    sessionId: z.string(),
    role: Role,
    iceServers: z.array(IceServer),
    peerPresent: z.boolean(),
  }),
  z.object({ type: z.literal('peer-joined') }),
  z.object({ type: z.literal('peer-left') }),
  z.object({ type: z.literal('signal'), data: SignalData }),
  z.object({ type: z.literal('ended'), reason: EndReason }),
  z.object({ type: z.literal('pong') }),
  z.object({
    type: z.literal('error'),
    code: z.enum(['invalid_message', 'unauthorized', 'replaced']),
  }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;

/** WebSocket close codes in the private range (4000–4999). */
export const CloseCode = {
  /** Token unknown or session gone; don't reconnect. */
  Unauthorized: 4001,
  /** The same participant connected again from somewhere else. */
  Replaced: 4002,
  /** Session ended by one of the participants. */
  Ended: 4003,
} as const;

// ── Accounts ────────────────────────────────────────────────────────────

export const Email = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const User = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string().nullable(),
});
export type User = z.infer<typeof User>;

export const RequestCodeRequest = z.object({ email: Email });
export type RequestCodeRequest = z.infer<typeof RequestCodeRequest>;

export const VerifyCodeRequest = z.object({ email: Email, code: z.string().regex(/^\d{6}$/) });
export type VerifyCodeRequest = z.infer<typeof VerifyCodeRequest>;

export const AuthResponse = z.object({ token: z.string(), user: User });
export type AuthResponse = z.infer<typeof AuthResponse>;

export const UpdateMeRequest = z.object({
  displayName: z.string().trim().max(60).nullable(),
});
export type UpdateMeRequest = z.infer<typeof UpdateMeRequest>;

// ── Rings: Apollo calls a Houston by email ──────────────────────────────

export const RingRequest = z.object({
  email: Email,
  callerName: z.string().trim().max(60).optional(),
  /** Random id Apollo's device keeps, so a Houston can block a caller. */
  deviceId: z.string().min(16).max(64),
});
export type RingRequest = z.infer<typeof RingRequest>;

/**
 * Apollo's way into the call. Identical whether or not the email belongs to anyone,
 * so the response never reveals which addresses are registered.
 */
export const RingResponse = z.object({ sessionId: z.string(), token: z.string() });
export type RingResponse = z.infer<typeof RingResponse>;

export const RingStatus = z.enum(['ringing', 'answered', 'missed', 'declined']);
export type RingStatus = z.infer<typeof RingStatus>;

export const Ring = z.object({
  id: z.string(),
  callerName: z.string().nullable(),
  createdAt: z.number(),
  status: RingStatus,
});
export type Ring = z.infer<typeof Ring>;

export const RingList = z.object({ rings: z.array(Ring) });
export type RingList = z.infer<typeof RingList>;

/** Houston's way into the call after answering. */
export const AnswerRingResponse = z.object({ sessionId: z.string(), token: z.string() });
export type AnswerRingResponse = z.infer<typeof AnswerRingResponse>;

// ── Notifications ───────────────────────────────────────────────────────

export const PushConfig = z.object({
  /** VAPID public key for Web Push; null when disabled. */
  webPushPublicKey: z.string().nullable(),
  apns: z.boolean(),
  fcm: z.boolean(),
});
export type PushConfig = z.infer<typeof PushConfig>;

export const RegisterPushRequest = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('web'),
    subscription: z.object({
      endpoint: z.url().max(2000),
      keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
    }),
  }),
  z.object({ kind: z.literal('apns'), token: z.string().regex(/^[0-9a-f]{64,200}$/i) }),
  z.object({ kind: z.literal('fcm'), token: z.string().min(20).max(4096) }),
]);
export type RegisterPushRequest = z.infer<typeof RegisterPushRequest>;

/** Payload of every push notification, whatever the channel. */
export const RingNotification = z.object({
  type: z.literal('ring'),
  ringId: z.string(),
  callerName: z.string().nullable(),
  url: z.string(),
});
export type RingNotification = z.infer<typeof RingNotification>;

// ── Events WebSocket for signed-in Houstons ─────────────────────────────

export const EventsClientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), authToken: z.string().max(200) }),
  z.object({ type: z.literal('ping') }),
]);
export type EventsClientMessage = z.infer<typeof EventsClientMessage>;

export const EventsServerMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  /** A new ring or a change of an existing one. */
  z.object({ type: z.literal('ring'), ring: Ring }),
  z.object({ type: z.literal('pong') }),
]);
export type EventsServerMessage = z.infer<typeof EventsServerMessage>;

// ── Peer-to-peer data channels ──────────────────────────────────────────
//
// Three pre-negotiated channels ride on every call's peer connection:
//   id 0 "houston"  reliable:  PeerMessage (media layout, capabilities, control consent)
//   id 1 "control"  reliable:  ControlEvent from Houston (clicks, keys, wheel)
//   id 2 "pointer"  lossy:     PointerMove from Houston (only the latest position matters)

export const DataChannel = {
  houston: { id: 0, label: 'houston' },
  control: { id: 1, label: 'control' },
  pointer: { id: 2, label: 'pointer' },
} as const;

/**
 * What Apollo's device can do when Houston controls it:
 * full = real mouse/keyboard (or touch) input, overlay = only show where to click.
 */
export const ControlMode = z.enum(['full', 'overlay', 'none']);
export type ControlMode = z.infer<typeof ControlMode>;

/** Coordinates are fractions (0–1) of Apollo's shared screen, so resolutions don't matter. */
const Fraction = z.number().min(0).max(1);

export const PeerMessage = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('media'),
    streams: z.record(z.string(), z.enum(['camera', 'screen'])),
  }),
  /** Apollo: what control is possible right now, and whether installing the app would help. */
  z.object({
    type: z.literal('capabilities'),
    control: ControlMode,
    installable: z.boolean(),
  }),
  /** Houston asks to control Apollo's screen. */
  z.object({ type: z.literal('control-request') }),
  /** Apollo's answer, and every later change (stopped, mode changed). */
  z.object({
    type: z.literal('control-state'),
    active: z.boolean(),
    mode: ControlMode,
    /** Set when the request was turned down rather than ended. */
    denied: z.boolean().optional(),
  }),
  /** Either side ends control. */
  z.object({ type: z.literal('control-stop') }),
]);
export type PeerMessage = z.infer<typeof PeerMessage>;

export const MouseButton = z.union([z.literal(0), z.literal(1), z.literal(2)]);

/**
 * Keys use KeyboardEvent.key names for special keys ("Enter", "Backspace", "ArrowLeft",
 * "Control", …); printable text goes as "text", which works across keyboard layouts.
 */
export const ControlEvent = z.discriminatedUnion('t', [
  z.object({ t: z.literal('down'), b: MouseButton, x: Fraction, y: Fraction }),
  z.object({ t: z.literal('up'), b: MouseButton, x: Fraction, y: Fraction }),
  z.object({
    t: z.literal('wheel'),
    x: Fraction,
    y: Fraction,
    dx: z.number().min(-10_000).max(10_000),
    dy: z.number().min(-10_000).max(10_000),
  }),
  z.object({ t: z.literal('key'), key: z.string().min(1).max(32), down: z.boolean() }),
  z.object({ t: z.literal('text'), text: z.string().min(1).max(1000) }),
]);
export type ControlEvent = z.infer<typeof ControlEvent>;

export const PointerMove = z.object({ t: z.literal('move'), x: Fraction, y: Fraction });
export type PointerMove = z.infer<typeof PointerMove>;

/** Public facts about this server the apps need. */
export const ServerInfo = z.object({
  /** Where people download the desktop app; null hides the offer. */
  desktopDownloadUrl: z.string().nullable(),
});
export type ServerInfo = z.infer<typeof ServerInfo>;
