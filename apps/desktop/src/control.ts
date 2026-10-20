import { join } from 'node:path';
import { BrowserWindow, dialog, type Display, screen, systemPreferences } from 'electron';
import type { ControlEvent, ControlMode, PointerMove } from '@houston/protocol';
import { type Area, type InputBackend, type Robot, robotBackend } from './input';
import type { Strings } from './i18n';
import { PortalDeclined, portalBackend, portalSupported } from './portal';

const isWayland =
  process.platform === 'linux' &&
  (process.env.XDG_SESSION_TYPE === 'wayland' || Boolean(process.env.WAYLAND_DISPLAY));

export class ControlDeclined extends Error {}

interface Options {
  strings: Strings;
  staticDir: string;
  preload: string;
  /** The display that is being shared; control maps onto it. */
  sharedDisplay: () => Display;
  onModeChange: () => void;
  /** The person ended control from the desktop app's own bar. */
  onStoppedByUser: () => void;
}

/**
 * The person's side of remote control on a computer. Asks for consent natively (a dialog,
 * or the system's own portal dialog on Wayland), performs Houston's input, and keeps a
 * "Stop" bar and the pointer overlay on top of everything while active.
 */
export class ControlSession {
  private backend: InputBackend | null = null;
  private overlay: BrowserWindow | null = null;
  private bar: BrowserWindow | null = null;
  private active: 'full' | 'overlay' | null = null;
  private portal: boolean | null = null;
  private lastMode: ControlMode;
  private readonly modeTimer: ReturnType<typeof setInterval>;

  constructor(private readonly options: Options) {
    this.lastMode = this.mode();
    if (isWayland) {
      void portalSupported().then((supported) => {
        this.portal = supported;
        this.checkMode();
      });
    }
    // macOS: the Accessibility permission can be granted while the app runs.
    this.modeTimer = setInterval(() => this.checkMode(), 3000);
  }

  mode(): ControlMode {
    if (isWayland) return this.portal ? 'full' : 'overlay';
    if (process.platform === 'darwin') {
      return systemPreferences.isTrustedAccessibilityClient(false) ? 'full' : 'overlay';
    }
    return 'full';
  }

  async start(requested: 'full' | 'overlay', parent: BrowserWindow | null) {
    this.stop();
    const { strings } = this.options;
    const mode = this.mode() === 'full' ? requested : 'overlay';

    if (mode === 'full' && isWayland) {
      // The portal shows the system's own consent dialog.
      try {
        this.backend = await portalBackend();
      } catch (error) {
        if (error instanceof PortalDeclined) throw new ControlDeclined();
        throw error;
      }
    } else {
      const options = {
        type: 'question' as const,
        title: strings.consentTitle,
        message: strings.consentMessage,
        detail: mode === 'full' ? strings.consentDetail : strings.overlayOnlyDetail,
        buttons: [strings.consentAllow, strings.consentDeny],
        defaultId: 0,
        cancelId: 1,
      };
      const { response } = parent
        ? await dialog.showMessageBox(parent, options)
        : await dialog.showMessageBox(options);
      if (response !== 0) throw new ControlDeclined();
      if (process.platform === 'darwin' && mode === 'overlay') {
        // Opens System Settings for next time; this session stays in overlay mode.
        systemPreferences.isTrustedAccessibilityClient(true);
      }
      if (mode === 'full') {
        // Loaded lazily: a native module, only needed once someone actually controls.
        const robot = require('@jitsi/robotjs') as Robot;
        this.backend = robotBackend(robot, () => this.robotArea());
      }
    }

    this.active = mode;
    this.showWindows(mode);
  }

  stop() {
    this.backend?.close();
    this.backend = null;
    this.active = null;
    this.overlay?.destroy();
    this.bar?.destroy();
    this.overlay = null;
    this.bar = null;
  }

  input(event: ControlEvent) {
    if (!this.active) return;
    if (event.t === 'down') this.overlay?.webContents.send('overlay:click', event);
    this.backend?.handle(event);
  }

  pointer(move: PointerMove) {
    if (!this.active) return;
    if (this.backend) this.backend.move(move.x, move.y);
    else this.overlay?.webContents.send('overlay:pointer', move);
  }

  dispose() {
    clearInterval(this.modeTimer);
    this.stop();
  }

  private checkMode() {
    const mode = this.mode();
    if (mode !== this.lastMode) {
      this.lastMode = mode;
      this.options.onModeChange();
    }
  }

  /** robotjs works in physical pixels on Windows and Linux, in points on macOS. */
  private robotArea(): Area {
    const { bounds } = this.options.sharedDisplay();
    if (process.platform === 'darwin') return bounds;
    const topLeft = screen.dipToScreenPoint({ x: bounds.x, y: bounds.y });
    const bottomRight = screen.dipToScreenPoint({
      x: bounds.x + bounds.width,
      y: bounds.y + bounds.height,
    });
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    };
  }

  private showWindows(mode: 'full' | 'overlay') {
    const { bounds } = this.options.sharedDisplay();
    const { staticDir, preload, strings } = this.options;
    const common = {
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      webPreferences: { preload, contextIsolation: true, sandbox: true },
    };

    // Full-screen, transparent and click-through: draws Houston's pointer and clicks.
    this.overlay = new BrowserWindow({
      ...common,
      ...bounds,
      transparent: true,
      focusable: false,
      hasShadow: false,
    });
    this.overlay.setIgnoreMouseEvents(true);
    this.overlay.setAlwaysOnTop(true, 'screen-saver');
    this.overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    void this.overlay.loadFile(join(staticDir, 'overlay.html'), { query: { mode } });
    this.overlay.once('ready-to-show', () => this.overlay?.showInactive());

    // Always-visible "Stop" bar at the top of the shared screen.
    const width = Math.min(640, bounds.width - 40);
    this.bar = new BrowserWindow({
      ...common,
      x: Math.round(bounds.x + (bounds.width - width) / 2),
      y: bounds.y + 12,
      width,
      height: 72,
      backgroundColor: '#0B3D91',
    });
    this.bar.setAlwaysOnTop(true, 'screen-saver');
    this.bar.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    void this.bar.loadFile(join(staticDir, 'bar.html'), {
      query: {
        text: mode === 'full' ? strings.barControl : strings.barPointing,
        stop: strings.barStop,
      },
    });
    this.bar.once('ready-to-show', () => this.bar?.showInactive());
  }

  /** Called from the bar's Stop button. */
  stopByUser() {
    if (!this.active) return;
    this.stop();
    this.options.onStoppedByUser();
  }
}
