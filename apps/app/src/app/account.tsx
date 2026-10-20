import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { BigButton } from '@/components/BigButton';
import { Card, Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { sizes, useColors } from '@/components/theme';
import { Body, Title } from '@/components/Typography';
import { auth, useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { enablePush, type PushResult, pushEnabled, pushSupported } from '@/lib/push';
import { callerName, ringStatusText } from '@/lib/rings';
import { useRings } from '@/lib/ringStore';

const pushTexts: Record<PushResult, string> = {
  enabled: t.accountNotificationsOn,
  denied: t.accountNotificationsDenied,
  unsupported: t.accountNotificationsUnsupported,
  unavailable: t.accountNotificationsUnavailable,
};

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' });

export default function Account() {
  const colors = useColors();
  const state = useAuth();
  const rings = useRings();
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const [push, setPush] = useState<PushResult | null>(null);

  const user = state.status === 'signed-in' ? state.user : null;
  useEffect(() => setName(user?.displayName ?? ''), [user?.displayName]);
  useEffect(() => {
    if (!pushSupported()) setPush('unsupported');
    else void pushEnabled().then((enabled) => enabled && setPush('enabled'));
  }, []);

  if (state.status === 'signed-out') return <Redirect href="/signin" />;
  if (!user) return null;

  async function saveName() {
    await auth.updateName(name.trim() || null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function turnOnPush() {
    try {
      setPush(await enablePush());
    } catch {
      setPush('unavailable');
    }
  }

  return (
    <Screen>
      <Title>{t.accountTitle}</Title>

      <Card>
        <Body>{t.accountReachable}</Body>
        <Text selectable style={[styles.email, { color: colors.text }]} testID="account-email">
          {user.email}
        </Text>
        <TextField label={t.accountName} value={name} onChangeText={setName} maxLength={60} />
        <Body>{t.accountNameHint}</Body>
        <BigButton
          variant="plain"
          label={saved ? t.accountSaved : t.accountSave}
          onPress={saveName}
        />
      </Card>

      <Card>
        <Title>{t.accountNotifications}</Title>
        <Body>{t.accountNotificationsText}</Body>
        {push && <Body tone={push === 'enabled' ? 'muted' : 'error'}>{pushTexts[push]}</Body>}
        {push !== 'enabled' && push !== 'unsupported' && (
          <BigButton
            label={t.accountEnableNotifications}
            onPress={turnOnPush}
            testID="enable-push"
          />
        )}
      </Card>

      <Card>
        <Title>{t.accountHistory}</Title>
        {rings.length === 0 && <Body>{t.accountNoHistory}</Body>}
        {rings.map((ring) => (
          <View key={ring.id} style={[styles.ring, { borderColor: colors.border }]}>
            <Text style={[styles.ringName, { color: colors.text }]}>{callerName(ring)}</Text>
            <Text style={[styles.ringMeta, { color: colors.muted }]}>
              {ringStatusText[ring.status]} · {dateFormat.format(ring.createdAt)}
            </Text>
          </View>
        ))}
      </Card>

      <BigButton
        variant="plain"
        label={t.accountSignOut}
        onPress={async () => {
          await auth.signOut();
          router.replace('/');
        }}
        testID="sign-out"
      />
      <BigButton variant="plain" label={t.backHome} onPress={() => router.replace('/')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  email: { fontSize: sizes.title, fontWeight: '700' },
  ring: { borderTopWidth: 1, paddingTop: 12, gap: 4 },
  ringName: { fontSize: sizes.text, fontWeight: '700' },
  ringMeta: { fontSize: sizes.small },
});
