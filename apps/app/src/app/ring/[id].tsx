import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { BigButton } from '@/components/BigButton';
import { Card, Screen } from '@/components/Screen';
import { Body, Title } from '@/components/Typography';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { answerRing, callerName, ringStatusText } from '@/lib/rings';
import { useRings } from '@/lib/ringStore';
import { api } from '@/lib/server';

/** Where ring notifications lead: answer, decline or block. */
export default function RingPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useAuth();
  const rings = useRings();
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const ring = rings.find((r) => r.id === id);
  const home = <BigButton variant="plain" label={t.backHome} onPress={() => router.replace('/')} />;

  if (state.status === 'loading') return null;
  if (state.status === 'signed-out') {
    return (
      <Screen>
        <Body>{t.signInToAnswer}</Body>
        <BigButton label={t.signInVerify} onPress={() => router.push('/signin')} />
        {home}
      </Screen>
    );
  }
  if (!ring) return null;

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } catch {
      setGone(true);
    } finally {
      setBusy(false);
    }
  }

  const ringing = ring.status === 'ringing' && !gone;
  return (
    <Screen>
      <Card>
        <Title>{t.incomingTitle(callerName(ring))}</Title>
        <Body>
          {ringing ? ringStatusText.ringing : `${ringStatusText[ring.status]}. ${t.ringGone}`}
        </Body>
        {ringing && (
          <>
            <BigButton
              variant="go"
              label={t.answer}
              onPress={() => act(() => answerRing(ring.id))}
              disabled={busy}
              testID="answer-ring-page"
            />
            <BigButton
              variant="plain"
              label={t.decline}
              onPress={() => act(() => api.declineRing(ring.id))}
              disabled={busy}
            />
          </>
        )}
        <BigButton
          variant="stop"
          label={t.block}
          onPress={() => act(() => api.blockCaller(ring.id))}
          disabled={busy}
        />
      </Card>
      {home}
    </Screen>
  );
}
