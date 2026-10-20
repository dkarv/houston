import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Call, CallError, CallSnapshot } from '@houston/core';
import { t } from '@/lib/i18n';
import { BigButton } from './BigButton';
import { ApolloControlBar, HoustonControlBar } from './ControlBar';
import { MediaView, RemoteAudio } from './MediaView';
import { RemoteScreen } from './RemoteScreen';
import { sizes, useColors } from './theme';

interface Props {
  call: Call;
  state: CallSnapshot;
  /** Shown above the stage while waiting, e.g. the invite link for Houston. */
  waitingContent?: ReactNode;
  endedContent?: ReactNode;
  /** Replaces the default waiting text, e.g. while a ring notifies the helper. */
  waitingText?: string;
  /** Apollo's token, to hand the call over to the desktop app. */
  apolloToken?: string | null;
}

const errorText: Record<CallError, string> = {
  microphone: t.errorMicrophone,
  camera: t.errorCamera,
  screen: t.errorGeneric,
  unauthorized: t.errorUnauthorized,
  replaced: t.errorReplaced,
};

function statusText(state: CallSnapshot, waitingText?: string): string {
  switch (state.status) {
    case 'connecting':
      return t.statusConnecting;
    case 'waiting':
      if (waitingText) return waitingText;
      return state.role === 'houston' ? t.statusWaitingApollo : t.statusWaitingHouston;
    case 'joining':
      return t.statusJoining;
    case 'connected':
      return t.statusConnected;
    case 'reconnecting':
      return t.statusReconnecting;
    case 'ended':
    case 'failed':
      return t.endedTitle;
  }
}

export function CallScreen({
  call,
  state,
  waitingContent,
  endedContent,
  waitingText,
  apolloToken,
}: Props) {
  const colors = useColors();

  if (state.status === 'ended' || state.status === 'failed') {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]} testID="call-ended">
          {t.endedTitle}
        </Text>
        <Text style={[styles.text, { color: colors.muted }]}>
          {state.error
            ? errorText[state.error]
            : state.endReason === 'unanswered'
              ? t.endedUnanswered
              : t.endedText}
        </Text>
        {endedContent}
      </View>
    );
  }

  const isHouston = state.role === 'houston';
  // Houston mostly looks at Apollo's screen; Apollo at most sees Houston's face.
  const stage = isHouston ? (state.remoteScreen ?? state.remoteCamera) : state.remoteCamera;
  const connected = state.status === 'connected';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <RemoteAudio stream={state.remoteAudio} />

      <Text
        style={[styles.status, { color: connected ? colors.go : colors.text }]}
        accessibilityLiveRegion="polite"
        testID={`status-${state.status}`}
      >
        {statusText(state, waitingText)}
      </Text>

      {state.status === 'waiting' && waitingContent}

      <View style={[styles.stage, { backgroundColor: colors.stage }]}>
        {stage && stage === state.remoteScreen ? (
          <RemoteScreen
            stream={stage}
            call={call}
            controlling={state.control === 'active'}
            testID="remote-screen"
          />
        ) : stage ? (
          <MediaView stream={stage} testID="remote-camera" />
        ) : (
          <Text style={[styles.stageText, { color: '#FFFFFF' }]}>
            {isHouston && connected ? t.noScreenYet : ''}
            {!isHouston && state.localScreen ? t.sharingScreen : ''}
          </Text>
        )}
        {state.localCamera && (
          <View style={styles.selfView}>
            <MediaView stream={state.localCamera} mirror fit="cover" testID="local-camera" />
          </View>
        )}
      </View>

      {isHouston ? (
        <HoustonControlBar call={call} state={state} />
      ) : (
        <ApolloControlBar call={call} state={state} apolloToken={apolloToken} />
      )}

      {state.error === 'camera' && (
        <Text style={[styles.text, { color: colors.stop }]}>{t.errorCamera}</Text>
      )}

      <ScrollView horizontal={false} contentContainerStyle={styles.controls}>
        <BigButton
          variant="plain"
          active={!state.micEnabled}
          label={state.micEnabled ? t.mute : t.unmute}
          onPress={() => call.toggleMicrophone()}
          testID="toggle-mic"
        />
        <BigButton
          variant="plain"
          active={Boolean(state.localCamera)}
          label={state.localCamera ? t.cameraOff : t.cameraOn}
          onPress={() => void call.toggleCamera()}
          testID="toggle-camera"
        />
        {state.canShareScreen && (
          <BigButton
            variant="plain"
            active={Boolean(state.localScreen)}
            label={state.localScreen ? t.screenOff : t.screenOn}
            onPress={() => void call.toggleScreen()}
            testID="toggle-screen"
          />
        )}
        <BigButton variant="stop" label={t.hangUp} onPress={() => call.hangUp()} testID="hang-up" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: sizes.pad, gap: sizes.gap },
  center: {
    flex: 1,
    padding: sizes.pad,
    gap: sizes.gap,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: sizes.title, fontWeight: '800', textAlign: 'center' },
  text: { fontSize: sizes.text, textAlign: 'center', maxWidth: 640 },
  status: { fontSize: sizes.title, fontWeight: '800', textAlign: 'center' },
  stage: {
    flex: 1,
    minHeight: 200,
    borderRadius: sizes.radius,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageText: { fontSize: sizes.text, textAlign: 'center', padding: sizes.pad },
  selfView: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 160,
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: sizes.gap,
    justifyContent: 'center',
  },
});
