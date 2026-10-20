import { type Browser, type Page, expect } from '@playwright/test';

/** Houston starts a session, Apollo joins by link; resolves once both are connected. */
export async function startCall(
  browser: Browser,
  { relayOnly = false, apolloInit }: { relayOnly?: boolean; apolloInit?: () => void } = {},
) {
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  if (apolloInit) await contexts[1]!.addInitScript(apolloInit);
  if (relayOnly) {
    // Forces every connection through our TURN server, as on networks without a direct path.
    for (const context of contexts) {
      await context.addInitScript(() => {
        const Native = window.RTCPeerConnection;
        window.RTCPeerConnection = class extends Native {
          constructor(config?: RTCConfiguration) {
            super({ ...config, iceTransportPolicy: 'relay' });
          }
        } as typeof RTCPeerConnection;
      });
    }
  }
  const [houston, apollo] = (await Promise.all(contexts.map((context) => context.newPage()))) as [
    Page,
    Page,
  ];

  for (const [name, page] of [
    ['H', houston],
    ['A', apollo],
  ] as const) {
    page.on('console', (m) => {
      if (m.type() === 'warning' || m.type() === 'error') console.log(`[${name}] ${m.text()}`);
    });
  }
  await houston.goto('/');
  await houston.getByTestId('start-session').click();
  await expect(houston.getByTestId('status-waiting')).toBeVisible();
  const link = await houston.getByTestId('invite-link').textContent();
  expect(link).toMatch(/\/j\/\d{6}$/);

  await apollo.goto(link!);
  await apollo.getByTestId('connect').click();

  await expect(houston.getByTestId('status-connected')).toBeVisible({ timeout: 20_000 });
  await expect(apollo.getByTestId('status-connected')).toBeVisible({ timeout: 20_000 });
  return { houston, apollo, close: () => Promise.all(contexts.map((c) => c.close())) };
}
