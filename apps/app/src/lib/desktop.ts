import type { ControlEvent, ControlMode, PointerMove } from '@houston/protocol';

/**
 * What the Houston desktop app (Electron) exposes to this web app through its preload
 * script. Every input still needs the person's consent in a native dialog, enforced by
 * the desktop app itself.
 */
export interface HoustonDesktopBridge {
  version: string;
  platform: 'win32' | 'darwin' | 'linux';
  /** What control the desktop can do right now. */
  controlMode(): ControlMode;
  onControlModeChange(listener: () => void): () => void;
  /** Shows the native consent dialog; rejects if declined. */
  startControl(mode: 'full' | 'overlay'): Promise<void>;
  stopControl(): void;
  /** The person pressed Stop in the desktop app's own control bar. */
  onControlStopped(listener: () => void): () => void;
  input(event: ControlEvent): void;
  pointer(move: PointerMove): void;
}

export function desktopBridge(): HoustonDesktopBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { houstonDesktop?: HoustonDesktopBridge }).houstonDesktop ?? null;
}
