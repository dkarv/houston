import { expect, test } from '@playwright/test';
import { startCall } from './helpers';

/** Stands in for the Electron preload bridge; records what the desktop app would do. */
function fakeDesktop() {
  const log: unknown[] = [];
  let stopped: (() => void) | null = null;
  Object.assign(window, {
    __controlLog: log,
    __stopFromDesktop: () => stopped?.(),
    houstonDesktop: {
      version: 'test',
      platform: 'linux',
      controlMode: () => 'full',
      onControlModeChange: () => () => {},
      startControl: async (mode: string) => void log.push({ start: mode }),
      stopControl: () => void log.push({ stop: true }),
      onControlStopped: (listener: () => void) => {
        stopped = listener;
        return () => (stopped = null);
      },
      input: (event: unknown) => void log.push(event),
      pointer: () => {},
    },
  });
}

test.describe.configure({ mode: 'serial' });

test('Houston controls the desktop app with mouse and keyboard', async ({ browser }) => {
  const { houston, apollo, close } = await startCall(browser, { apolloInit: fakeDesktop });
  const log = () =>
    apollo.evaluate(() => (window as unknown as { __controlLog: unknown[] }).__controlLog);

  await apollo.getByTestId('toggle-screen').click();
  await expect(houston.getByTestId('remote-screen')).toBeVisible();
  await houston.getByTestId('request-control').click();

  // The desktop app asks in its own dialog, so the page doesn't ask again.
  await expect(apollo.getByTestId('control-active')).toBeVisible();
  await expect.poll(log).toContainEqual({ start: 'full' });

  const surface = houston.getByTestId('control-surface');
  await expect(surface).toBeVisible();
  // Wait until the video has a size, so clicks map into the screen.
  await expect
    .poll(() =>
      houston.getByTestId('remote-screen').evaluate((v: HTMLVideoElement) => v.videoWidth),
    )
    .toBeGreaterThan(0);
  const box = (await surface.boundingBox())!;
  await houston.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await houston.keyboard.type('hi');
  await houston.keyboard.press('Enter');

  await expect
    .poll(log)
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({ t: 'down', b: 0 }),
        expect.objectContaining({ t: 'up', b: 0 }),
        { t: 'text', text: 'h' },
        { t: 'text', text: 'i' },
        { t: 'key', key: 'Enter', down: true },
        { t: 'key', key: 'Enter', down: false },
      ]),
    );
  const click = ((await log()) as Array<{ t?: string; x?: number; y?: number }>).find(
    (e) => e.t === 'down',
  )!;
  expect(click.x).toBeCloseTo(0.5, 1);
  expect(click.y).toBeCloseTo(0.5, 1);

  // Stop from the desktop app's own control bar.
  await apollo.evaluate(() =>
    (window as unknown as { __stopFromDesktop: () => void }).__stopFromDesktop(),
  );
  await expect(surface).toBeHidden();
  await expect(apollo.getByTestId('control-active')).toBeHidden();
  await expect(houston.getByTestId('request-control')).toBeVisible();
  await close();
});

test('stopping the screen share ends control', async ({ browser }) => {
  const { houston, apollo, close } = await startCall(browser, { apolloInit: fakeDesktop });
  await apollo.getByTestId('toggle-screen').click();
  await houston.getByTestId('request-control').click();
  await expect(houston.getByTestId('control-surface')).toBeVisible();
  await apollo.getByTestId('toggle-screen').click();
  await expect(houston.getByTestId('control-surface')).toBeHidden();
  await close();
});

test('a browser offers the desktop app instead of control', async ({ browser }) => {
  const { houston, apollo, close } = await startCall(browser);
  await apollo.getByTestId('toggle-screen').click();
  await houston.getByTestId('request-control').click();

  await expect(apollo.getByTestId('open-in-app')).toBeVisible();
  await apollo.getByTestId('install-later').click();
  await expect(houston.getByText('did not allow control')).toBeVisible();
  await close();
});
