import { Platform } from 'react-native';
import { HoustonApi } from '@houston/core';

/**
 * The Houston server this app talks to. In the browser that is the origin the page was
 * served from, unless overridden for development (Expo's dev server runs on its own port).
 */
export const serverUrl: string =
  process.env.EXPO_PUBLIC_HOUSTON_URL ??
  (Platform.OS === 'web' ? window.location.origin : 'http://localhost:3000');

/** Shared API client; carries the auth token once a Houston signs in. */
export const api = new HoustonApi(serverUrl);
