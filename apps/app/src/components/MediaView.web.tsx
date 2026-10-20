import { useEffect, useRef } from 'react';
import type { MediaViewProps } from './MediaView';

export function MediaView({ stream, mirror, fit = 'contain', testID }: MediaViewProps) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      // Audio always goes through RemoteAudio, never through a video element.
      muted
      data-testid={testID}
      style={{
        width: '100%',
        height: '100%',
        objectFit: fit,
        transform: mirror ? 'scaleX(-1)' : undefined,
        backgroundColor: 'black',
      }}
    />
  );
}

export function RemoteAudio({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay data-testid="remote-audio" />;
}
