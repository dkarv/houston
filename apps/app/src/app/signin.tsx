import { useState } from 'react';
import { router } from 'expo-router';
import { HoustonApiError } from '@houston/core';
import { BigButton } from '@/components/BigButton';
import { Card, Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { Body, Title } from '@/components/Typography';
import { auth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { api } from '@/lib/server';

const errors: Record<string, string> = {
  invalid_code: t.signInWrongCode,
  unavailable: t.signInUnavailable,
  rate_limited: t.errorRateLimited,
};

/** Passwordless sign-in for helpers: email, then the code we mailed. */
export default function SignIn() {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errors[err instanceof HoustonApiError ? err.code : ''] ?? t.errorGeneric);
    } finally {
      setBusy(false);
    }
  }

  const sendCode = () =>
    run(async () => {
      await api.requestCode(email.trim());
      setStep('code');
    });

  const verify = () =>
    run(async () => {
      await auth.verify(email.trim(), code);
      if (router.canGoBack()) router.back();
      else router.replace('/account');
    });

  return (
    <Screen>
      <Title>{t.signInTitle}</Title>
      <Card>
        {step === 'email' ? (
          <>
            <Body>{t.signInText}</Body>
            <TextField
              label={t.signInEmail}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              inputMode="email"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              onSubmitEditing={sendCode}
              testID="signin-email"
            />
            <BigButton
              label={t.signInSend}
              onPress={sendCode}
              disabled={busy || !email.includes('@')}
              testID="signin-send"
            />
          </>
        ) : (
          <>
            <Body>
              {t.signInCodeText} {email.trim()}
            </Body>
            <TextField
              label={t.signInCode}
              code
              value={code}
              onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              onSubmitEditing={verify}
              testID="signin-code"
            />
            <BigButton
              label={t.signInVerify}
              onPress={verify}
              disabled={busy || code.length !== 6}
              testID="signin-verify"
            />
          </>
        )}
        {error && <Body tone="error">{error}</Body>}
      </Card>
      <BigButton variant="plain" label={t.backHome} onPress={() => router.replace('/')} />
    </Screen>
  );
}
