import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import { t } from '@/lib/i18n';
import { answerRing, callerName } from '@/lib/rings';
import { useRings } from '@/lib/ringStore';
import { api } from '@/lib/server';
import { BigButton } from './BigButton';
import { sizes, useColors } from './theme';

/** Banner on top of every screen while someone is ringing the signed-in Houston. */
export function IncomingRing() {
  const colors = useColors();
  const rings = useRings();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const ring = rings.find((r) => r.status === 'ringing');

  // In a call or on the ring's own page the banner would only be in the way.
  if (!ring || pathname.startsWith('/session/') || pathname === `/ring/${ring.id}`) return null;

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } catch {
      // The ring ended meanwhile; the store update removes the banner.
    } finally {
      setBusy(false);
    }
  }

  return (
    <View
      style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.go }]}
      accessibilityRole="alert"
      testID="incoming-ring"
    >
      <Text style={[styles.title, { color: colors.text }]}>
        {t.incomingTitle(callerName(ring))}
      </Text>
      <View style={styles.actions}>
        <BigButton
          variant="go"
          label={t.answer}
          onPress={() => act(() => answerRing(ring.id))}
          disabled={busy}
          testID="answer-ring"
        />
        <BigButton
          variant="plain"
          label={t.decline}
          onPress={() => act(() => api.declineRing(ring.id))}
          disabled={busy}
          testID="decline-ring"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    maxWidth: 640,
    alignSelf: 'center',
    marginHorizontal: 'auto',
    padding: sizes.pad,
    gap: sizes.gap,
    borderRadius: sizes.radius,
    borderWidth: 3,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  title: { fontSize: sizes.title, fontWeight: '800' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: sizes.gap },
});
