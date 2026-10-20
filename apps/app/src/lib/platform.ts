import { Platform } from 'react-native';
import { mediaDevices, registerGlobals } from 'react-native-webrtc';
import type { ControlPlatform, MediaPlatform } from '@houston/core';
import { HoustonAndroid } from '../../modules/houston-android/src';
import { t } from './i18n';

// @houston/core uses the standard WebRTC globals (RTCPeerConnection, MediaStream, …).
registerGlobals();

/**
 * Android: full control through Houston's Accessibility service when the person enabled
 * it, otherwise the overlay that shows where the helper points.
 */
function androidControl(): ControlPlatform | undefined {
  const native = HoustonAndroid;
  if (!native) return undefined;
  return {
    capabilities: () => ({ control: native.controlMode(), installable: false }),
    onCapabilitiesChange: (listener) => {
      const subscription = native.addListener('onControlModeChange', listener);
      return () => subscription.remove();
    },
    onStopped: (listener) => {
      const subscription = native.addListener('onControlStopped', listener);
      return () => subscription.remove();
    },
    start: async (mode) => {
      const text = mode === 'full' ? t.controlActiveApollo : t.controlPointingApollo;
      if (!native.startControl(mode, text, t.controlStopApollo)) {
        // Overlay needs "display over other apps"; the helper can ask again afterwards.
        native.openOverlaySettings();
        throw new Error('overlay permission missing');
      }
    },
    stop: () => native.stopControl(),
    input: (event) => native.input(JSON.stringify(event)),
    pointer: (move) => native.pointer(move.x, move.y),
  };
}

export const mediaPlatform: MediaPlatform = {
  getMicrophone: () => mediaDevices.getUserMedia({ audio: true }) as Promise<never>,
  getCamera: () => mediaDevices.getUserMedia({ video: { facingMode: 'user' } }) as Promise<never>,
  // Android: react-native-webrtc asks for consent and runs the required foreground
  // service. iOS needs a broadcast upload extension, which isn't built yet.
  getScreen:
    Platform.OS === 'android'
      ? () =>
          // The whole screen, not a single app (Android 14+): control maps onto it.
          mediaDevices.getDisplayMedia({
            android: { createConfigForDefaultDisplay: true },
          }) as unknown as Promise<MediaStream>
      : undefined,
  control: Platform.OS === 'android' ? androidControl() : undefined,
};

/** For the consent card: offer turning on full control where it's off. */
export const androidSettings = HoustonAndroid
  ? {
      accessibilityEnabled: () => HoustonAndroid!.isAccessibilityEnabled(),
      openAccessibilitySettings: () => HoustonAndroid!.openAccessibilitySettings(),
    }
  : null;
