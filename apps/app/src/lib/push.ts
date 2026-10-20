import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { api } from './server';

export type PushResult = 'enabled' | 'denied' | 'unsupported' | 'unavailable';

// Rings arriving while the app is open are shown in the app itself.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export function pushSupported(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

/**
 * Registers this device's native push token (APNs on iOS, FCM on Android) with our own
 * server; no Expo push service involved. Needs a development or store build.
 */
export async function enablePush(): Promise<PushResult> {
  const config = await api.pushConfig();
  const kind = Platform.OS === 'ios' ? 'apns' : 'fcm';
  if (!config[kind]) return 'unavailable';
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return 'denied';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('rings', {
      name: 'Calls',
      importance: Notifications.AndroidImportance.MAX,
    });
  }
  const token = await Notifications.getDevicePushTokenAsync();
  await api.registerPush({ kind, token: String(token.data) });
  return 'enabled';
}

export async function pushEnabled(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

/** Calls `open` with the ring URL when a notification is tapped. */
export function onNotificationOpened(open: (url: string) => void): () => void {
  const handle = (response: Notifications.NotificationResponse | null) => {
    const data = response?.notification.request.content.data as { url?: unknown } | undefined;
    if (typeof data?.url === 'string') open(data.url);
  };
  handle(Notifications.getLastNotificationResponse());
  const subscription = Notifications.addNotificationResponseReceivedListener(handle);
  return () => subscription.remove();
}
