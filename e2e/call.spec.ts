import { type Page, expect, test } from '@playwright/test';
import { startCall } from './helpers';

async function expectPlaying(page: Page, testId: string) {
  await expect
    .poll(
      () =>
        page
          .getByTestId(testId)
          .evaluate((video: HTMLVideoElement) => video.videoWidth > 0 && !video.paused),
      { timeout: 15_000 },
    )
    .toBe(true);
}

test('Apollo joins by link, shares the screen, and hangs up', async ({ browser }) => {
  const { houston, apollo, close } = await startCall(browser);

  // Houston hears Apollo.
  await expect
    .poll(() =>
      houston.getByTestId('remote-audio').evaluate((audio: HTMLAudioElement) => {
        const stream = audio.srcObject as MediaStream | null;
        return stream?.getAudioTracks().length ?? 0;
      }),
    )
    .toBe(1);

  await apollo.getByTestId('toggle-screen').click();
  await expectPlaying(houston, 'remote-screen');

  await apollo.getByTestId('toggle-camera').click();
  await expectPlaying(apollo, 'local-camera');

  await apollo.getByTestId('toggle-screen').click();
  // Without the screen, Houston falls back to Apollo's camera.
  await expectPlaying(houston, 'remote-camera');

  await apollo.getByTestId('hang-up').click();
  await expect(apollo.getByTestId('call-ended')).toBeVisible();
  await expect(houston.getByTestId('call-ended')).toBeVisible();
  await close();
});

test('the call works through the built-in TURN relay', async ({ browser }) => {
  const { houston, apollo, close } = await startCall(browser, { relayOnly: true });
  await apollo.getByTestId('toggle-screen').click();
  await expectPlaying(houston, 'remote-screen');
  await close();
});

test('a reload rejoins the same call', async ({ browser }) => {
  const { houston, apollo, close } = await startCall(browser);
  await apollo.reload();
  await apollo.getByTestId('connect').click();
  await expect(apollo.getByTestId('status-connected')).toBeVisible({ timeout: 20_000 });
  await expect(houston.getByTestId('status-connected')).toBeVisible({ timeout: 20_000 });
  await close();
});
