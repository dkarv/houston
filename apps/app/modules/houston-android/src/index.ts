import { type EventSubscription, Platform, requireOptionalNativeModule } from 'expo-modules-core';

type Events = {
  onControlModeChange: () => void;
  onControlStopped: () => void;
};

interface HoustonAndroidModule {
  controlMode(): 'full' | 'overlay';
  isAccessibilityEnabled(): boolean;
  canDrawOverlays(): boolean;
  openAccessibilitySettings(): void;
  openOverlaySettings(): void;
  /** False when overlay mode lacks the "display over other apps" permission. */
  startControl(mode: 'full' | 'overlay', barText: string, stopText: string): boolean;
  stopControl(): void;
  pointer(x: number, y: number): void;
  /** A ControlEvent as JSON. */
  input(json: string): void;
  addListener<K extends keyof Events>(event: K, listener: Events[K]): EventSubscription;
}

/** Android-only native code for remote control; null elsewhere (and in Expo Go). */
export const HoustonAndroid: HoustonAndroidModule | null =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<HoustonAndroidModule>('HoustonAndroid')
    : null;
