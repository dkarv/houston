import { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import type { Call, CallSnapshot } from '@houston/core';
import { t } from '@/lib/i18n';
import { androidSettings, mediaPlatform } from '@/lib/platform';
import { api, serverUrl } from '@/lib/server';
import { BigButton } from './BigButton';
import { Card } from './Screen';
import { sizes } from './theme';
import { Body, Title } from './Typography';

interface Props {
  call: Call;
  state: CallSnapshot;
  /** Apollo's session token, for handing the call over to the desktop app. */
  apolloToken?: string | null;
}

/** Houston's side: ask for control, see what's going on, stop. */
export function HoustonControlBar({ call, state }: Props) {
  const peer = state.peerControl;
  // Controlling needs a mouse and keyboard on Houston's side and something to control.
  const possible =
    Platform.OS === 'web' &&
    state.remoteScreen &&
    peer &&
    (peer.control !== 'none' || peer.installable);
  if (!possible && state.control === 'off') return null;

  return (
    <View style={styles.bar}>
      {state.control === 'active' && (
        <Body>
          {state.controlMode === 'overlay' ? t.controlActiveOverlay : t.controlActiveFull}
        </Body>
      )}
      {state.control === 'requested' && <Body>{t.controlRequested}</Body>}
      {state.control === 'off' && state.controlDenied && (
        <Body tone="error">{t.controlDenied}</Body>
      )}
      {state.control === 'off' ? (
        <BigButton
          variant="plain"
          label={t.controlRequest}
          onPress={() => call.requestControl()}
          testID="request-control"
        />
      ) : (
        <BigButton
          variant="plain"
          label={t.controlStop}
          onPress={() => call.stopControl()}
          testID="stop-control"
        />
      )}
    </View>
  );
}

/** Apollo's side: consent, install offer, and the always-visible stop while active. */
export function ApolloControlBar({ call, state, apolloToken }: Props) {
  const control = mediaPlatform.control;
  const capabilities = control?.capabilities();
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  // The desktop app asks in a system dialog of its own; asking twice would confuse.
  useEffect(() => {
    if (state.control === 'requested' && control?.nativeConsent) void call.answerControl(true);
  }, [state.control, control, call]);

  const installOffer = state.control === 'requested' && capabilities?.installable;
  useEffect(() => {
    if (installOffer) void api.info().then((info) => setDownloadUrl(info.desktopDownloadUrl));
  }, [installOffer]);

  if (state.control === 'active') {
    return (
      <View style={styles.bar} testID="control-active">
        <Title>
          {state.controlMode === 'overlay' ? t.controlPointingApollo : t.controlActiveApollo}
        </Title>
        <BigButton
          variant="stop"
          label={t.controlStopApollo}
          onPress={() => call.stopControl()}
          testID="apollo-stop-control"
        />
      </View>
    );
  }
  if (state.control !== 'requested' || control?.nativeConsent) return null;
  const settings = androidSettings;

  if (installOffer) {
    const handoff =
      apolloToken && state.sessionId
        ? `houston://open?url=${encodeURIComponent(
            `${serverUrl}/handoff?s=${encodeURIComponent(state.sessionId)}#${apolloToken}`,
          )}`
        : null;
    return (
      <Card>
        <Title>{t.installTitle}</Title>
        <Body>{t.installText}</Body>
        <View style={styles.actions}>
          {downloadUrl && (
            <BigButton
              label={t.installDownload}
              onPress={() => void Linking.openURL(downloadUrl)}
            />
          )}
          {handoff && (
            <BigButton
              variant="go"
              label={t.installOpen}
              onPress={() => void Linking.openURL(handoff)}
              testID="open-in-app"
            />
          )}
          <BigButton
            variant="plain"
            label={t.installLater}
            onPress={() => void call.answerControl(false)}
            testID="install-later"
          />
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <Title>{t.controlAsk}</Title>
      {settings && !settings.accessibilityEnabled() && (
        <>
          <Body>{t.controlOverlayHint}</Body>
          <BigButton
            variant="plain"
            label={t.controlOpenAccessibility}
            onPress={() => settings.openAccessibilitySettings()}
          />
        </>
      )}
      <View style={styles.actions}>
        <BigButton
          variant="go"
          label={t.controlAllow}
          onPress={() => void call.answerControl(true)}
          testID="allow-control"
        />
        <BigButton
          variant="plain"
          label={t.controlDeny}
          onPress={() => void call.answerControl(false)}
          testID="deny-control"
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  bar: { gap: sizes.gap / 2, alignItems: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: sizes.gap },
});
