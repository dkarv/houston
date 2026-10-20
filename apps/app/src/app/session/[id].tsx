import { useMemo } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { BigButton } from '@/components/BigButton';
import { CallScreen } from '@/components/CallScreen';
import { InviteCard } from '@/components/InviteCard';
import { Screen } from '@/components/Screen';
import { Body, Title } from '@/components/Typography';
import { t } from '@/lib/i18n';
import { loadHoustonSession } from '@/lib/sessions';
import { useCall } from '@/lib/useCall';

/** Houston's view: the invite while waiting, then Apollo's screen. */
export default function HoustonSession() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useMemo(() => loadHoustonSession(id), [id]);
  const { call, state } = useCall(session?.token ?? null);
  const home = <BigButton label={t.backHome} onPress={() => router.replace('/')} />;

  if (!session) {
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
      waitingContent={session.invite && <InviteCard session={session.invite} />}
      endedContent={home}
    />
  );
}
