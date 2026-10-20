import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Link, router } from 'expo-router';
import { HoustonApiError } from '@houston/core';
import { BigButton } from '@/components/BigButton';
import { Card, Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { sizes, useColors } from '@/components/theme';
import { Body, Title } from '@/components/Typography';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { deviceId } from '@/lib/persistent';
import { api } from '@/lib/server';
import { saveApolloSession, saveHoustonSession } from '@/lib/sessions';

function errorMessage(error: unknown) {
  return error instanceof HoustonApiError && error.code === 'rate_limited'
    ? t.errorRateLimited
    : t.errorGeneric;
}

export default function Home() {
  const colors = useColors();
  const auth = useAuth();
  const [busy, setBusy] = useState<'start' | 'ring' | null>(null);
  const [error, setError] = useState<{ card: 'start' | 'ring'; text: string } | null>(null);
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  async function start() {
    setBusy('start');
    setError(null);
    try {
      const invite = await api.createSession();
      saveHoustonSession({ sessionId: invite.sessionId, token: invite.token, invite });
      router.push(`/session/${invite.sessionId}`);
    } catch (err) {
      setError({ card: 'start', text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  async function ring() {
    setBusy('ring');
    setError(null);
    try {
      const result = await api.ring({
        email: email.trim(),
        callerName: name.trim() || undefined,
        deviceId: await deviceId(),
      });
      saveApolloSession(result.sessionId, result.token);
      router.push(`/call/${result.sessionId}`);
    } catch (err) {
      setError({ card: 'ring', text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  const validCode = /^\d{6}$/.test(code);
  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  return (
    <Screen>
      <View style={styles.header}>
        <Title>{t.appTitle}</Title>
        {auth.status !== 'loading' && (
          <Link
            href={auth.status === 'signed-in' ? '/account' : '/signin'}
            style={[styles.link, { color: colors.primary }]}
            testID="account-link"
          >
            {auth.status === 'signed-in' ? t.accountLink : t.signInLink}
          </Link>
        )}
      </View>
      <Body>{t.tagline}</Body>

      <Card>
        <Title>{t.homeNeedHelpTitle}</Title>
        <Body>{t.homeNeedHelpText}</Body>
        <TextField
          label={t.homeCodePlaceholder}
          code
          value={code}
          onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          onSubmitEditing={() => validCode && router.push(`/j/${code}`)}
          testID="code-input"
        />
        <BigButton
          label={t.homeJoin}
          onPress={() => router.push(`/j/${code}`)}
          disabled={!validCode}
          testID="enter-code"
        />
      </Card>

      <Card>
        <Title>{t.ringTitle}</Title>
        <Body>{t.ringText}</Body>
        <TextField
          label={t.ringEmail}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          inputMode="email"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          testID="ring-email"
        />
        <TextField
          label={t.ringName}
          value={name}
          onChangeText={setName}
          autoComplete="name"
          maxLength={60}
          testID="ring-name"
        />
        <BigButton
          variant="go"
          label={t.ringButton}
          onPress={ring}
          disabled={!validEmail || busy === 'ring'}
          testID="ring-button"
        />
        {error?.card === 'ring' && <Body tone="error">{error.text}</Body>}
      </Card>

      <Card>
        <Title>{t.homeHelpTitle}</Title>
        <Body>{t.homeHelpText}</Body>
        <BigButton
          label={t.homeStart}
          onPress={start}
          disabled={busy === 'start'}
          testID="start-session"
        />
        {error?.card === 'start' && <Body tone="error">{error.text}</Body>}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: sizes.gap,
  },
  link: { fontSize: sizes.text, fontWeight: '700', textDecorationLine: 'underline' },
});
