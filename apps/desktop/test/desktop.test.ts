import { describe, expect, it } from 'vitest';
import { robotBackend, type Robot } from '../src/input';
import { keysym, robotKey } from '../src/keys';
import { parseDeepLink } from '../src/servers';

function fakeRobot() {
  const calls: unknown[][] = [];
  const robot = new Proxy({} as Robot, {
    get:
      (_target, name) =>
      (...args: unknown[]) =>
        void calls.push([name, ...args]),
  });
  return { robot, calls };
}

const area = () => ({ x: 100, y: 50, width: 1000, height: 500 });

describe('robot backend', () => {
  it('maps fractions onto the shared display', () => {
    const { robot, calls } = fakeRobot();
    const backend = robotBackend(robot, area, 'linux');
    backend.handle({ t: 'down', b: 0, x: 0.5, y: 0.5 });
    backend.handle({ t: 'up', b: 2, x: 1, y: 0 });
    expect(calls).toEqual([
      ['moveMouse', 600, 300],
      ['mouseToggle', 'down', 'left'],
      ['moveMouse', 1100, 50],
      ['mouseToggle', 'up', 'right'],
    ]);
  });

  it('scrolls in each platform’s units, positive meaning up', () => {
    for (const [platform, expected] of [
      ['linux', -3],
      ['win32', -360],
      ['darwin', -120],
    ] as const) {
      const { robot, calls } = fakeRobot();
      robotBackend(robot, area, platform).handle({ t: 'wheel', x: 0, y: 0, dx: 0, dy: 120 });
      expect(calls.at(-1)).toEqual(['scrollMouse', 0, expected]);
    }
  });

  it('types text and releases held keys and buttons on close', () => {
    const { robot, calls } = fakeRobot();
    const backend = robotBackend(robot, area, 'linux');
    backend.handle({ t: 'text', text: 'Grüße' });
    backend.handle({ t: 'key', key: 'Control', down: true });
    backend.handle({ t: 'key', key: 'c', down: true });
    backend.handle({ t: 'down', b: 0, x: 0, y: 0 });
    calls.length = 0;
    backend.close();
    expect(calls).toEqual(
      expect.arrayContaining([
        ['keyToggle', 'control', 'up'],
        ['keyToggle', 'c', 'up'],
        ['mouseToggle', 'up', 'left'],
      ]),
    );
  });
});

describe('keys', () => {
  it('translates key names for robotjs and keysyms', () => {
    expect(robotKey('Enter')).toBe('enter');
    expect(robotKey('ArrowLeft')).toBe('left');
    expect(robotKey('A')).toBe('a');
    expect(robotKey('Dead')).toBeNull();
    expect(keysym('Enter')).toBe(0xff0d);
    expect(keysym('a')).toBe(0x61);
    expect(keysym('ü')).toBe(0xfc);
    expect(keysym('€')).toBe(0x010020ac);
  });
});

describe('deep links', () => {
  const open = (url: string) => `houston://open?url=${encodeURIComponent(url)}`;

  it('accepts https and local development servers', () => {
    expect(parseDeepLink(open('https://help.example.com/handoff?s=1#t'))?.origin).toBe(
      'https://help.example.com',
    );
    expect(parseDeepLink(open('http://localhost:3000/x'))?.host).toBe('localhost:3000');
  });

  it('rejects everything else', () => {
    expect(parseDeepLink(open('http://evil.example.com/'))).toBeNull();
    expect(parseDeepLink(open('file:///etc/passwd'))).toBeNull();
    expect(parseDeepLink(open('javascript:alert(1)'))).toBeNull();
    expect(parseDeepLink('houston://other?url=https://x.example.com')).toBeNull();
    expect(parseDeepLink('https://help.example.com')).toBeNull();
  });
});
