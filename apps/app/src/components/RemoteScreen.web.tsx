import { useEffect, useRef } from 'react';
import type { Call } from '@houston/core';
import type { ControlEvent } from '@houston/protocol';
import { MediaView } from './MediaView';

interface Props {
  stream: MediaStream;
  call: Call;
  /** Houston controls Apollo's screen: forward mouse and keyboard. */
  controlling: boolean;
  testID?: string;
}

/** Where the video content sits inside the element, given object-fit: contain. */
function contentRect(video: HTMLVideoElement) {
  const box = video.getBoundingClientRect();
  const vw = video.videoWidth || box.width;
  const vh = video.videoHeight || box.height;
  const scale = Math.min(box.width / vw, box.height / vh);
  const width = vw * scale;
  const height = vh * scale;
  return {
    left: box.left + (box.width - width) / 2,
    top: box.top + (box.height - height) / 2,
    width,
    height,
  };
}

const buttons: Record<number, 0 | 1 | 2> = { 0: 0, 1: 1, 2: 2 };

/**
 * Apollo's shared screen as Houston sees it. While controlling, pointer and keyboard
 * events over it are sent as fractions of Apollo's screen.
 */
export function RemoteScreen({ stream, call, controlling, testID }: Props) {
  const surface = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = surface.current;
    if (!controlling || !element) return;
    element.focus();

    const position = (event: MouseEvent) => {
      const video = element.parentElement?.querySelector('video');
      if (!video) return null;
      const rect = contentRect(video);
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      return x < 0 || x > 1 || y < 0 || y > 1 ? null : { x, y };
    };
    const send = (event: ControlEvent) => call.sendControl(event);

    const onMove = (event: PointerEvent) => {
      const p = position(event);
      if (p) call.sendPointer(p.x, p.y);
    };
    const onButton = (event: PointerEvent) => {
      const p = position(event);
      const b = buttons[event.button];
      if (!p || b === undefined) return;
      event.preventDefault();
      element.focus();
      send({ t: event.type === 'pointerdown' ? 'down' : 'up', b, ...p });
    };
    const onWheel = (event: WheelEvent) => {
      const p = position(event);
      if (!p) return;
      event.preventDefault();
      // Lines and pages to pixels, roughly.
      const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 800 : 1;
      send({ t: 'wheel', ...p, dx: event.deltaX * unit, dy: event.deltaY * unit });
    };
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      const shortcut = event.ctrlKey || event.metaKey || event.altKey;
      if (event.key.length === 1 && !shortcut) {
        // Plain characters as text: works whatever keyboard layout Apollo has.
        if (event.type === 'keydown') send({ t: 'text', text: event.key });
        return;
      }
      if (event.key === 'Dead' || event.key === 'Unidentified') return;
      send({ t: 'key', key: event.key, down: event.type === 'keydown' });
    };
    const preventMenu = (event: Event) => event.preventDefault();

    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerdown', onButton);
    element.addEventListener('pointerup', onButton);
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('keydown', onKey);
    element.addEventListener('keyup', onKey);
    element.addEventListener('contextmenu', preventMenu);
    return () => {
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerdown', onButton);
      element.removeEventListener('pointerup', onButton);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('keydown', onKey);
      element.removeEventListener('keyup', onKey);
      element.removeEventListener('contextmenu', preventMenu);
    };
  }, [call, controlling]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <MediaView stream={stream} testID={testID} />
      {controlling && (
        <div
          ref={surface}
          tabIndex={0}
          data-testid="control-surface"
          style={{
            position: 'absolute',
            inset: 0,
            cursor: 'crosshair',
            outline: '3px solid #4CC26A',
            outlineOffset: -3,
            touchAction: 'none',
          }}
        />
      )}
    </div>
  );
}
