import type { ControlPlatform, MediaPlatform } from '@houston/core';
import { desktopBridge } from './desktop';

const audio: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

const isMobile =
  typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// Mobile browsers have no getDisplayMedia; some expose a stub that always fails.
const canShareScreen =
  typeof navigator !== 'undefined' &&
  typeof navigator.mediaDevices?.getDisplayMedia === 'function' &&
  !isMobile;

function control(): ControlPlatform | undefined {
  const desktop = desktopBridge();
  if (desktop) {
    return {
      nativeConsent: true,
      capabilities: () => ({ control: desktop.controlMode(), installable: false }),
      onCapabilitiesChange: (listener) => desktop.onControlModeChange(listener),
      onStopped: (listener) => desktop.onControlStopped(listener),
      start: (mode) => desktop.startControl(mode),
      stop: () => desktop.stopControl(),
      input: (event) => desktop.input(event),
      pointer: (move) => desktop.pointer(move),
    };
  }
  // A browser can't be controlled, but on a computer the desktop app can take over.
  if (canShareScreen) {
    return {
      capabilities: () => ({ control: 'none', installable: true }),
      start: () => Promise.reject(new Error('Browsers cannot be controlled')),
      stop: () => {},
      input: () => {},
      pointer: () => {},
    };
  }
  return undefined;
}

export const mediaPlatform: MediaPlatform = {
  getMicrophone: () => navigator.mediaDevices.getUserMedia({ audio }),
  getCamera: () =>
    navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
    }),
  getScreen: canShareScreen
    ? () =>
        navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 15, max: 30 } },
          audio: false,
        })
    : undefined,
  control: control(),
};

/** Only Android has system settings that unlock full control. */
export const androidSettings = null as null | {
  accessibilityEnabled(): boolean;
  openAccessibilitySettings(): void;
};
