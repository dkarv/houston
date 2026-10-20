import { useEffect } from 'react';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { IncomingRing } from '@/components/IncomingRing';
import { t } from '@/lib/i18n';
import { onNotificationOpened } from '@/lib/push';
import { useRingEvents } from '@/lib/ringStore';

export default function RootLayout() {
  useRingEvents();

  // A tapped ring notification opens the ring, whatever screen the app was on.
  useEffect(
    () =>
      onNotificationOpened((url) => {
        const path = new URL(url).pathname;
        if (path.startsWith('/ring/')) router.push(path as `/ring/${string}`);
      }),
    [],
  );

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, title: t.appTitle }} />
      <IncomingRing />
    </SafeAreaProvider>
  );
}
