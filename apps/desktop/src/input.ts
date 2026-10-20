import type { ControlEvent } from '@houston/protocol';
import { robotKey } from './keys';

/** A rectangle on the desktop in the coordinates the backend uses. */
export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Performs Houston's input for real. Coordinates are fractions of the shared screen. */
export interface InputBackend {
  move(x: number, y: number): void;
  handle(event: ControlEvent): void;
  close(): void;
}

/** The parts of @jitsi/robotjs we use; injectable for tests. */
export interface Robot {
  moveMouse(x: number, y: number): void;
  mouseToggle(down: 'down' | 'up', button: 'left' | 'middle' | 'right'): void;
  scrollMouse(x: number, y: number): void;
  keyToggle(key: string, down: 'down' | 'up'): void;
  typeString(text: string): void;
}

const robotButtons = ['left', 'middle', 'right'] as const;
/** Pixels of browser wheel delta per wheel notch. */
const PIXELS_PER_NOTCH = 40;

/**
 * robotjs scrollMouse: positive means up/left everywhere, but the unit differs:
 * X11 counts wheel clicks, Windows uses WHEEL_DELTA (120 per notch), macOS pixels.
 */
function scrollAmount(delta: number, platform: NodeJS.Platform): number {
  if (delta === 0) return 0;
  if (platform === 'darwin') return -Math.round(delta);
  const notches = Math.sign(delta) * Math.max(1, Math.round(Math.abs(delta) / PIXELS_PER_NOTCH));
  return platform === 'win32' ? -notches * 120 : -notches;
}

/**
 * Windows, macOS and Linux on X11: synthesized input through robotjs.
 * `area` maps fractions to the backend's pixels for the shared display.
 */
export function robotBackend(
  robot: Robot,
  area: () => Area,
  platform: NodeJS.Platform = process.platform,
): InputBackend {
  const point = (x: number, y: number) => {
    const a = area();
    return { x: Math.round(a.x + x * a.width), y: Math.round(a.y + y * a.height) };
  };
  const pressedKeys = new Set<string>();
  const pressedButtons = new Set<'left' | 'middle' | 'right'>();

  return {
    move(x, y) {
      const p = point(x, y);
      robot.moveMouse(p.x, p.y);
    },
    handle(event) {
      switch (event.t) {
        case 'down':
        case 'up': {
          const p = point(event.x, event.y);
          robot.moveMouse(p.x, p.y);
          const button = robotButtons[event.b];
          robot.mouseToggle(event.t, button);
          if (event.t === 'down') pressedButtons.add(button);
          else pressedButtons.delete(button);
          break;
        }
        case 'wheel': {
          const p = point(event.x, event.y);
          robot.moveMouse(p.x, p.y);
          // Browsers report scrolling down/right as positive.
          robot.scrollMouse(scrollAmount(event.dx, platform), scrollAmount(event.dy, platform));
          break;
        }
        case 'key': {
          const key = robotKey(event.key);
          if (!key) return;
          robot.keyToggle(key, event.down ? 'down' : 'up');
          if (event.down) pressedKeys.add(key);
          else pressedKeys.delete(key);
          break;
        }
        case 'text':
          robot.typeString(event.text);
          break;
      }
    },
    close() {
      // Never leave a modifier or mouse button stuck when control ends mid-press.
      for (const key of pressedKeys) robot.keyToggle(key, 'up');
      for (const button of pressedButtons) robot.mouseToggle('up', button);
      pressedKeys.clear();
      pressedButtons.clear();
    },
  };
}
