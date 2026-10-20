import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { HoustonApiError } from '@houston/core';
import { BigButton } from '@/components/BigButton';
import { CallScreen } from '@/components/CallScreen';
import { Screen } from '@/components/Screen';
import { Body, Title } from '@/components/Typography';
import { t } from '@/lib/i18n';
import { api } from '@/lib/server';
import { loadApolloToken, saveApolloToken } from '@/lib/sessions';
import { useCall } from '@/lib/useCall';

const errors: Record<string, string> = {
  not_found: t.errorNotFound,
  already_joined: t.errorAlreadyJoined,
  rate_limited: t.errorRateLimited,
};

/** Apollo opens the link Houston sent: one big button, then the call. */
export default function Join() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { call, state } = useCall(token);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      // A reload in the same tab rejoins with the token from before.
      const existing = loadApolloToken(code);
      if (existing) {
        setToken(existing);
        return;
      }
      const joined = await api.joinSession(code);
      saveApolloToken(code, joined.token);
      setToken(joined.token);
    } catch (err) {
      setError(errors[err instanceof HoustonApiError ? err.code : ''] ?? t.errorGeneric);
    } finally {
      setBusy(false);
    }
  }

  if (call && state) {
    return <CallScreen call={call} state={state} apolloToken={token} />;
  }

  return (
    <Screen>
      <Title>{t.joinTitle}</Title>
      <Body>{t.joinText}</Body>
      <BigButton
        variant="go"
        label={busy ? t.joinBusy : t.joinButton}
        onPress={connect}
        disabled={busy}
        testID="connect"
      />
      {error && (
        <>
          <Body tone="error">{error}</Body>
          <BigButton variant="plain" label={t.backHome} onPress={() => router.replace('/')} />
        </>
      )}
    </Screen>
  );
}
