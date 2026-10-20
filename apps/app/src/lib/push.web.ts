import { api } from './server';

export type PushResult = 'enabled' | 'denied' | 'unsupported' | 'unavailable';

export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

/** Subscribes this browser to ring notifications. Must run from a click. */
export async function enablePush(): Promise<PushResult> {
  if (!pushSupported()) return 'unsupported';
  const config = await api.pushConfig();
  if (!config.webPushPublicKey) return 'unavailable';
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.webPushPublicKey),
    }));
  const json = subscription.toJSON();
  await api.registerPush({
    kind: 'web',
    subscription: {
      endpoint: subscription.endpoint,
      keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
    },
  });
  return 'enabled';
}

export async function pushEnabled(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  return Boolean(await registration?.pushManager.getSubscription());
}

/** The service worker opens rings itself. */
export function onNotificationOpened(_open: (url: string) => void): () => void {
  return () => {};
}
