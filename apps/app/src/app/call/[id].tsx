import { useMemo } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { BigButton } from '@/components/BigButton';
import { CallScreen } from '@/components/CallScreen';
import { Screen } from '@/components/Screen';
import { Body, Title } from '@/components/Typography';
import { t } from '@/lib/i18n';
import { loadApolloSession } from '@/lib/sessions';
import { useCall } from '@/lib/useCall';

/** Apollo waits here after ringing a Houston by email. */
export default function RingCall() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const token = useMemo(() => loadApolloSession(id), [id]);
  const { call, state } = useCall(token);
  const home = <BigButton label={t.backHome} onPress={() => router.replace('/')} />;

  if (!token) {
    return (
      <Screen>
        <Title>{t.endedTitle}</Title>
        <Body>{t.errorUnauthorized}</Body>
        {home}
      </Screen>
    );
  }
  if (!call || !state) return null;
  return (
    <CallScreen
      call={call}
      state={state}
      waitingText={t.ringWaiting}
      endedContent={home}
      apolloToken={token}
    />
  );
}
