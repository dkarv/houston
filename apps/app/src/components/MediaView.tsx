import { RTCView, type MediaStream as NativeMediaStream } from 'react-native-webrtc';

export interface MediaViewProps {
  stream: MediaStream;
  mirror?: boolean;
  fit?: 'contain' | 'cover';
  testID?: string;
}

export function MediaView({ stream, mirror, fit = 'contain', testID }: MediaViewProps) {
  return (
    <RTCView
      streamURL={(stream as unknown as NativeMediaStream).toURL()}
      objectFit={fit}
      mirror={mirror}
      style={{ flex: 1, backgroundColor: 'black' }}
      testID={testID}
    />
  );
}

/** Native WebRTC plays remote audio by itself. */
export function RemoteAudio(_props: { stream: MediaStream | null }) {
  return null;
}
