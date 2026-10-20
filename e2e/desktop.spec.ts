import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

const desktopDir = join(import.meta.dirname, '../apps/desktop');

test('Houston controls the real desktop app (overlay mode)', async ({ browser, baseURL }) => {
  // Houston in Chrome starts a session.
  const houston = await (await browser.newContext()).newPage();
  await houston.goto('/');
  await houston.getByTestId('start-session').click();
  const link = (await houston.getByTestId('invite-link').textContent())!;

  // Apollo in the Electron app, headless. Without a session bus there is no Wayland
  // portal, so control runs in overlay mode and never touches the real mouse.
  const app = await electron.launch({
    args: [
      '--ozone-platform=headless',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      join(desktopDir, 'dist/main.js'),
    ],
    cwd: desktopDir,
    env: {
      ...process.env,
      HOUSTON_DESKTOP_URL: new URL(new URL(link).pathname, baseURL).toString(),
      HOUSTON_DESKTOP_USER_DATA: mkdtempSync(join(tmpdir(), 'houston-desktop-')),
      XDG_SESSION_TYPE: 'wayland',
      DBUS_SESSION_BUS_ADDRESS: 'disabled:',
    },
  });
  try {
    // Native dialogs can't be clicked in a test: agree to everything; share the app's own
    // page instead of a real screen.
    await app.evaluate(({ dialog, session }) => {
      dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as never;
      session.defaultSession.setDisplayMediaRequestHandler((request, callback) =>
        callback({ video: request.frame! }),
      );
    });
    const apollo = await app.firstWindow();
    await apollo.getByTestId('connect').click();
    await expect(houston.getByTestId('status-connected')).toBeVisible({ timeout: 20_000 });

    // The bridge is there, and reports what this desktop can do.
    expect(await apollo.evaluate(() => (window as any).houstonDesktop?.controlMode())).toBe(
      'overlay',
    );

    await apollo.getByTestId('toggle-screen').click();
    await houston.getByTestId('request-control').click();
    await expect(apollo.getByTestId('control-active')).toBeVisible();
    await expect(houston.getByText('You can point')).toBeVisible();

    // The overlay and the Stop bar are open on top of everything.
    await expect.poll(() => app.windows().length).toBe(3);
    const overlay = app.windows().find((page) => page.url().includes('overlay.html'))!;
    const bar = app.windows().find((page) => page.url().includes('bar.html'))!;

    const surface = houston.getByTestId('control-surface');
    // Headless Electron sends no video frames; clicks map onto the element instead.
    const box = (await surface.boundingBox())!;
    await houston.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
    await houston.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.25);
    await expect(overlay.locator('#pointer')).toBeVisible();
    await expect(overlay.locator('.ripple')).toHaveCount(1);

    // The person ends it from the bar.
    // Headless windows can't be hit-tested; click from inside the page.
    await bar.locator('#stop').evaluate((button: HTMLButtonElement) => button.click());
    await expect(surface).toBeHidden();
    await expect(apollo.getByTestId('control-active')).toBeHidden();
    await expect.poll(() => app.windows().length).toBe(1);
  } finally {
    await app.close();
  }
});
