import {
  ControlEvent,
  type ControlMode,
  DataChannel,
  type EndReason,
  type IceServer,
  PeerMessage,
  PointerMove,
  type Role,
  type SignalData,
} from '@houston/protocol';
import { SignalingClient, type SignalingEvent } from './signaling';

export interface ControlCapabilities {
  control: ControlMode;
  /** Installing the Houston app would make control possible (desktop browsers). */
  installable: boolean;
}

/**
 * How Apollo's device carries out remote control: real input where the platform allows
 * it, otherwise an overlay that shows where Houston points and clicks.
 */
export interface ControlPlatform {
  capabilities(): ControlCapabilities;
  /** Capabilities can change, e.g. after the person grants a permission. */
  onCapabilitiesChange?(listener: () => void): () => void;
  /** Control was ended on the device itself, e.g. with a native "Stop" button. */
  onStopped?(listener: () => void): () => void;
  /**
   * The platform asks for consent itself (a system dialog) when start() is called, so the
   * app shouldn't ask first.
   */
  nativeConsent?: boolean;
  /** Rejects if the person declined or the platform couldn't start. */
  start(mode: 'full' | 'overlay'): void | Promise<void>;
  stop(): void;
  input(event: ControlEvent): void;
  pointer(move: PointerMove): void;
}

/** Platform-specific media access; RTCPeerConnection and MediaStream are used as globals. */
export interface MediaPlatform {
  getMicrophone(): Promise<MediaStream>;
  getCamera(): Promise<MediaStream>;
  /** Missing where the platform cannot share its screen (e.g. mobile browsers). */
  getScreen?: () => Promise<MediaStream>;
  /** Missing where Apollo's device can't be controlled at all. */
  control?: ControlPlatform;
}

/**
 * off: no control. requested: Houston asked and Apollo hasn't answered yet.
 * active: Houston controls Apollo's screen (or points at it, in overlay mode).
 */
export type ControlStatus = 'off' | 'requested' | 'active';

export type CallStatus =
  /** Connecting to the server. */
  | 'connecting'
  /** Connected to the server, the other person isn't there yet. */
  | 'waiting'
  /** Both are there, establishing the direct connection. */
  | 'joining'
  | 'connected'
  /** Lost the server or the direct connection, trying to get it back. */
  | 'reconnecting'
  | 'ended'
  | 'failed';

export type CallError = 'microphone' | 'camera' | 'screen' | 'unauthorized' | 'replaced';

export interface CallSnapshot {
  status: CallStatus;
  sessionId: string | null;
  role: Role | null;
  error: CallError | null;
  micEnabled: boolean;
  localCamera: MediaStream | null;
  localScreen: MediaStream | null;
  remoteAudio: MediaStream | null;
  remoteCamera: MediaStream | null;
  remoteScreen: MediaStream | null;
  canShareScreen: boolean;
  /** Why the call ended, once it has. */
  endReason: EndReason | null;
  control: ControlStatus;
  /** While active: real input or only the overlay. */
  controlMode: ControlMode | null;
  /** Houston: Apollo turned the last request down. */
  controlDenied: boolean;
  /** Houston: what Apollo's device allows; null until known. */
  peerControl: ControlCapabilities | null;
}

type MediaKind = 'camera' | 'screen';

/**
 * One call between Houston and Apollo: a single RTCPeerConnection that is (re)built
 * whenever both participants are connected to the server. Uses the "perfect negotiation"
 * pattern, so either side may add or remove camera and screen at any time.
 */
export class Call {
  private readonly signaling: SignalingClient;
  private readonly platform: MediaPlatform;
  private readonly listeners = new Set<() => void>();
  private snapshot: CallSnapshot;

  private iceServers: IceServer[] = [];
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private controlChannel: RTCDataChannel | null = null;
  private pointerChannel: RTCDataChannel | null = null;
  private readonly unsubscribers: Array<() => void> = [];
  private polite = false;
  private makingOffer = false;
  private ignoreOffer = false;
  /** Signals are applied strictly in order: a candidate must wait for its offer. */
  private signalQueue: Promise<void> = Promise.resolve();

  private microphone: MediaStream | null = null;
  private readonly local: Partial<Record<MediaKind, MediaStream>> = {};
  private readonly senders = new Map<MediaStreamTrack, RTCRtpSender>();
  private remoteKinds: Record<string, MediaKind> = {};
  private readonly remoteVideo = new Map<string, MediaStream>();
  private remoteAudio: MediaStream | null = null;

  constructor(options: { signalingUrl: string; token: string; platform: MediaPlatform }) {
    this.platform = options.platform;
    this.signaling = new SignalingClient(options.signalingUrl, options.token, (event) =>
      this.onSignaling(event),
    );
    this.snapshot = {
      status: 'connecting',
      sessionId: null,
      role: null,
      error: null,
      micEnabled: true,
      localCamera: null,
      localScreen: null,
      remoteAudio: null,
      remoteCamera: null,
      remoteScreen: null,
      endReason: null,
      canShareScreen: Boolean(options.platform.getScreen),
      control: 'off',
      controlMode: null,
      controlDenied: false,
      peerControl: null,
    };
    const control = options.platform.control;
    const onCapabilities = control?.onCapabilitiesChange?.(() => this.sendCapabilities());
    const onStopped = control?.onStopped?.(() => this.stopControl());
    for (const unsubscribe of [onCapabilities, onStopped]) {
      if (unsubscribe) this.unsubscribers.push(unsubscribe);
    }
  }

  // ── Public API (shaped for React's useSyncExternalStore) ──────────────

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  /** Call from a user gesture: asks for the microphone, then connects. */
  async start() {
    try {
      this.microphone = await this.platform.getMicrophone();
    } catch {
      this.update({ status: 'failed', error: 'microphone' });
      return;
    }
    if (this.snapshot.status === 'ended' || this.snapshot.status === 'failed') {
      // Left while the permission prompt was open.
      for (const track of this.microphone.getTracks()) track.stop();
      this.microphone = null;
      return;
    }
    this.signaling.connect();
  }

  /** Ends the session for both sides. */
  hangUp() {
    this.signaling.end();
    this.teardown('ended', null, 'hangup');
  }

  /** Leaves without ending the session (e.g. screen closed); it stays joinable. */
  leave() {
    this.teardown('ended');
  }

  toggleMicrophone() {
    const enabled = !this.snapshot.micEnabled;
    for (const track of this.microphone?.getAudioTracks() ?? []) track.enabled = enabled;
    this.update({ micEnabled: enabled });
  }

  async toggleCamera() {
    if (this.local.camera) return this.stopLocal('camera');
    try {
      await this.startLocal('camera', await this.platform.getCamera());
    } catch {
      this.update({ error: 'camera' });
    }
  }

  async toggleScreen() {
    if (this.local.screen) return this.stopLocal('screen');
    await this.startScreen();
  }

  // ── Remote control: Houston's side ────────────────────────────────────

  /** Houston asks to control Apollo's screen. */
  requestControl() {
    if (this.snapshot.role !== 'houston' || this.snapshot.control !== 'off') return;
    this.send({ type: 'control-request' });
    this.update({ control: 'requested', controlDenied: false });
  }

  /** Either side ends control. */
  stopControl() {
    if (this.snapshot.control === 'off') return;
    this.send({ type: 'control-stop' });
    this.endControl();
  }

  /** Houston: a click, key or scroll, in fractions of Apollo's screen. */
  sendControl(event: ControlEvent) {
    if (this.snapshot.role !== 'houston' || this.snapshot.control !== 'active') return;
    if (this.controlChannel?.readyState === 'open') this.controlChannel.send(JSON.stringify(event));
  }

  /** Houston: where the pointer is; lossy, only the latest position matters. */
  sendPointer(x: number, y: number) {
    if (this.snapshot.role !== 'houston' || this.snapshot.control !== 'active') return;
    const move: PointerMove = { t: 'move', x, y };
    if (this.pointerChannel?.readyState === 'open') this.pointerChannel.send(JSON.stringify(move));
  }

  // ── Remote control: Apollo's side ─────────────────────────────────────

  /** Apollo answers Houston's request. Allowing also starts sharing the screen. */
  async answerControl(allow: boolean) {
    if (this.snapshot.role !== 'apollo' || this.snapshot.control !== 'requested') return;
    const control = this.platform.control;
    const mode = control?.capabilities().control ?? 'none';
    if (!allow || !control || mode === 'none') {
      this.send({ type: 'control-state', active: false, mode, denied: true });
      this.update({ control: 'off' });
      return;
    }
    if (!this.local.screen) await this.startScreen();
    if (!this.local.screen || this.snapshot.control !== 'requested') {
      this.send({ type: 'control-state', active: false, mode, denied: true });
      this.update({ control: 'off' });
      return;
    }
    try {
      await control.start(mode);
    } catch (error) {
      console.warn('[houston] starting control failed', error);
      this.send({ type: 'control-state', active: false, mode, denied: true });
      this.update({ control: 'off' });
      return;
    }
    this.send({ type: 'control-state', active: true, mode });
    this.update({ control: 'active', controlMode: mode });
  }

  private async startScreen() {
    if (!this.platform.getScreen) return;
    let stream: MediaStream;
    try {
      stream = await this.platform.getScreen();
    } catch {
      // Usually the person just cancelled the picker.
      return;
    }
    for (const track of stream.getVideoTracks()) {
      // Keep text sharp: prefer dropping frames over dropping resolution.
      track.contentHint = 'detail';
      // Stopped from the browser's own "stop sharing" bar.
      track.addEventListener('ended', () => {
        if (this.local.screen === stream) this.stopLocal('screen');
      });
    }
    await this.startLocal('screen', stream);
  }

  // ── Signaling ─────────────────────────────────────────────────────────

  private onSignaling(event: SignalingEvent) {
    switch (event.type) {
      case 'welcome':
        this.iceServers = event.iceServers;
        // Apollo yields on offer collisions; Houston's offer wins.
        this.polite = event.role === 'apollo';
        this.update({
          role: event.role,
          sessionId: event.sessionId,
          status: event.peerPresent ? 'joining' : 'waiting',
        });
        if (event.peerPresent) this.createPeer();
        else this.destroyPeer();
        break;
      case 'peer-joined':
        this.update({ status: 'joining' });
        this.createPeer();
        break;
      case 'peer-left':
        this.destroyPeer();
        this.update({ status: 'waiting' });
        break;
      case 'signal': {
        const data = event.data;
        this.signalQueue = this.signalQueue.then(() => this.onSignal(data));
        break;
      }
      case 'disconnected':
        this.update({ status: 'reconnecting' });
        break;
      case 'ended':
        this.teardown('ended', null, event.reason);
        break;
      case 'closed':
        if (event.reason === 'ended') this.teardown('ended');
        else this.teardown('failed', event.reason);
        break;
    }
  }

  private async onSignal(data: SignalData) {
    const pc = this.pc;
    if (!pc) return;
    try {
      if ('description' in data) {
        const description = data.description;
        const collision =
          description.type === 'offer' && (this.makingOffer || pc.signalingState !== 'stable');
        this.ignoreOffer = !this.polite && collision;
        if (this.ignoreOffer) return;

        await pc.setRemoteDescription(description);
        if (description.type === 'offer') {
          await setLocalDescription(pc);
          if (pc.localDescription)
            this.signaling.signal({ description: pc.localDescription.toJSON() });
        }
      } else {
        try {
          await pc.addIceCandidate(data.candidate ?? undefined);
        } catch (error) {
          if (!this.ignoreOffer) throw error;
        }
      }
    } catch (error) {
      console.warn('[houston] signaling error', error);
    }
  }

  // ── Peer connection ───────────────────────────────────────────────────

  private createPeer() {
    this.destroyPeer();
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pc = pc;

    // Negotiated up front with a fixed id, so neither side has to wait for ondatachannel.
    const channel = pc.createDataChannel(DataChannel.houston.label, {
      negotiated: true,
      id: DataChannel.houston.id,
    });
    this.channel = channel;
    channel.onopen = () => {
      this.sendMediaInfo();
      this.sendCapabilities();
    };
    channel.onmessage = (event) => this.onPeerMessage(event.data);

    this.controlChannel = pc.createDataChannel(DataChannel.control.label, {
      negotiated: true,
      id: DataChannel.control.id,
    });
    this.controlChannel.onmessage = (event) => this.onControlEvent(event.data);
    // Unordered and never retransmitted: a stale pointer position is worthless.
    this.pointerChannel = pc.createDataChannel(DataChannel.pointer.label, {
      negotiated: true,
      id: DataChannel.pointer.id,
      ordered: false,
      maxRetransmits: 0,
    });
    this.pointerChannel.onmessage = (event) => this.onPointer(event.data);

    pc.onnegotiationneeded = async () => {
      // Both sides build their connection at the same moment. Letting only Houston make
      // the first offer avoids glare: when Chrome rolls back an offer it is still
      // creating, it gathers no ICE candidates afterwards. Once stable again, the browser
      // fires negotiationneeded anew if Apollo still has tracks to add.
      if (this.polite && !pc.remoteDescription) return;
      try {
        this.makingOffer = true;
        await setLocalDescription(pc);
        if (pc.localDescription)
          this.signaling.signal({ description: pc.localDescription.toJSON() });
      } catch (error) {
        console.warn('[houston] negotiation failed', error);
      } finally {
        this.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => {
      this.signaling.signal({
        candidate: candidate ? { ...candidate.toJSON(), candidate: candidate.candidate } : null,
      });
    };
    pc.ontrack = (event) => this.onRemoteTrack(event);
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return;
      switch (pc.connectionState) {
        case 'connected':
          this.update({ status: 'connected' });
          break;
        case 'disconnected':
          this.update({ status: 'reconnecting' });
          break;
        case 'failed':
          this.update({ status: 'reconnecting' });
          pc.restartIce();
          break;
      }
    };

    for (const track of this.microphone?.getTracks() ?? []) {
      this.senders.set(track, pc.addTrack(track, this.microphone!));
    }
    for (const kind of ['camera', 'screen'] as const) {
      const stream = this.local[kind];
      if (stream) this.addStream(pc, kind, stream);
    }
  }

  private destroyPeer() {
    this.endControl();
    this.channel?.close();
    this.controlChannel?.close();
    this.pointerChannel?.close();
    this.pc?.close();
    this.pc = null;
    this.channel = null;
    this.controlChannel = null;
    this.pointerChannel = null;
    this.senders.clear();
    this.remoteKinds = {};
    this.remoteVideo.clear();
    this.remoteAudio = null;
    this.update({ peerControl: null });
    this.makingOffer = false;
    this.ignoreOffer = false;
    this.updateRemote();
  }

  private addStream(pc: RTCPeerConnection, kind: MediaKind, stream: MediaStream) {
    for (const track of stream.getTracks()) {
      const sender = pc.addTrack(track, stream);
      this.senders.set(track, sender);
      if (kind === 'screen') {
        const parameters = sender.getParameters();
        parameters.degradationPreference = 'maintain-resolution';
        sender.setParameters(parameters).catch(() => {});
      }
    }
  }

  private onRemoteTrack(event: RTCTrackEvent) {
    const stream = event.streams[0] ?? new MediaStream([event.track]);
    if (event.track.kind === 'audio') {
      this.remoteAudio = stream;
    } else {
      this.remoteVideo.set(stream.id, stream);
      stream.onremovetrack = () => {
        if (stream.getTracks().length === 0) this.remoteVideo.delete(stream.id);
        this.updateRemote();
      };
    }
    this.updateRemote();
  }

  private onPeerMessage(raw: unknown) {
    const message = parseJson(raw, PeerMessage);
    if (!message) return;
    const { role, control } = this.snapshot;
    switch (message.type) {
      case 'media':
        this.remoteKinds = message.streams;
        this.updateRemote();
        break;
      case 'capabilities':
        if (role === 'houston') {
          this.update({
            peerControl: { control: message.control, installable: message.installable },
          });
        }
        break;
      case 'control-request':
        if (role !== 'apollo' || control !== 'off') break;
        if (!this.platform.control) {
          // Nothing to ask the person: this device can't be controlled at all.
          this.send({ type: 'control-state', active: false, mode: 'none', denied: true });
        } else {
          this.update({ control: 'requested' });
        }
        break;
      case 'control-state':
        if (role !== 'houston') break;
        if (message.active) this.update({ control: 'active', controlMode: message.mode });
        else
          this.update({
            control: 'off',
            controlMode: null,
            controlDenied: Boolean(message.denied),
          });
        break;
      case 'control-stop':
        this.endControl();
        break;
    }
  }

  private onControlEvent(raw: unknown) {
    // Only ever act on input while Apollo's consent is active.
    if (this.snapshot.role !== 'apollo' || this.snapshot.control !== 'active') return;
    const event = parseJson(raw, ControlEvent);
    if (event) this.platform.control?.input(event);
  }

  private onPointer(raw: unknown) {
    if (this.snapshot.role !== 'apollo' || this.snapshot.control !== 'active') return;
    const move = parseJson(raw, PointerMove);
    if (move) this.platform.control?.pointer(move);
  }

  /** Ends control locally, without telling the peer. */
  private endControl() {
    if (this.snapshot.role === 'apollo' && this.snapshot.control === 'active') {
      this.platform.control?.stop();
    }
    if (this.snapshot.control !== 'off') this.update({ control: 'off', controlMode: null });
  }

  private send(message: PeerMessage) {
    if (this.channel?.readyState === 'open') this.channel.send(JSON.stringify(message));
  }

  private sendMediaInfo() {
    const streams: Record<string, MediaKind> = {};
    for (const kind of ['camera', 'screen'] as const) {
      const stream = this.local[kind];
      if (stream) streams[stream.id] = kind;
    }
    this.send({ type: 'media', streams });
  }

  private sendCapabilities() {
    if (this.snapshot.role !== 'apollo') return;
    const capabilities = this.platform.control?.capabilities() ?? {
      control: 'none',
      installable: false,
    };
    this.send({ type: 'capabilities', ...capabilities });
  }

  // ── Local media ───────────────────────────────────────────────────────

  private async startLocal(kind: MediaKind, stream: MediaStream) {
    this.local[kind] = stream;
    if (this.pc) this.addStream(this.pc, kind, stream);
    this.sendMediaInfo();
    this.update(kind === 'camera' ? { localCamera: stream } : { localScreen: stream });
  }

  private stopLocal(kind: MediaKind) {
    const stream = this.local[kind];
    if (!stream) return;
    delete this.local[kind];
    // Control needs the screen: without it Houston's clicks would land blind.
    if (kind === 'screen' && this.snapshot.control !== 'off') this.stopControl();
    for (const track of stream.getTracks()) {
      track.stop();
      const sender = this.senders.get(track);
      if (sender && this.pc && this.pc.signalingState !== 'closed') this.pc.removeTrack(sender);
      this.senders.delete(track);
    }
    this.sendMediaInfo();
    this.update(kind === 'camera' ? { localCamera: null } : { localScreen: null });
  }

  private teardown(
    status: 'ended' | 'failed',
    error: CallError | null = null,
    endReason: EndReason | null = this.snapshot.endReason,
  ) {
    this.signaling.close();
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    this.destroyPeer();
    for (const kind of ['camera', 'screen'] as const) this.stopLocal(kind);
    for (const track of this.microphone?.getTracks() ?? []) track.stop();
    this.microphone = null;
    this.update({ status, error, endReason });
  }

  // ── State ─────────────────────────────────────────────────────────────

  private updateRemote() {
    const find = (kind: MediaKind) => {
      for (const [id, stream] of this.remoteVideo) if (this.remoteKinds[id] === kind) return stream;
      return null;
    };
    this.update({
      remoteAudio: this.remoteAudio,
      remoteCamera: find('camera'),
      remoteScreen: find('screen'),
    });
  }

  private update(patch: Partial<CallSnapshot>) {
    const next = { ...this.snapshot, ...patch };
    const changed = (Object.keys(patch) as Array<keyof CallSnapshot>).some(
      (key) => next[key] !== this.snapshot[key],
    );
    if (!changed) return;
    // Once over, a late event must not bring the call back to life.
    if (this.snapshot.status === 'ended' || this.snapshot.status === 'failed') {
      if (patch.status && patch.status !== this.snapshot.status) return;
    }
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
}

function parseJson<T>(
  raw: unknown,
  schema: { safeParse(data: unknown): { success: boolean; data?: T } },
) {
  try {
    const result = schema.safeParse(JSON.parse(String(raw)));
    return result.success ? (result.data as T) : null;
  } catch {
    return null;
  }
}

/**
 * Implicit setLocalDescription() creates the right offer or answer; fall back to the
 * explicit form for WebRTC implementations that don't support it yet.
 */
async function setLocalDescription(pc: RTCPeerConnection) {
  try {
    await pc.setLocalDescription();
  } catch (error) {
    if (pc.signalingState === 'have-remote-offer') {
      await pc.setLocalDescription(await pc.createAnswer());
    } else if (pc.signalingState === 'stable') {
      await pc.setLocalDescription(await pc.createOffer());
    } else {
      throw error;
    }
  }
}
