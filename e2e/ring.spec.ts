import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Browser, type Page, expect, test } from '@playwright/test';

// Where the server writes mails instead of sending them (HOUSTON_MAIL_DIR).
const mailDir = process.env.E2E_MAIL_DIR ?? join(import.meta.dirname, '.data/mail');

function latestCode(email: string): string | null {
  let files: string[] = [];
  try {
    files = readdirSync(mailDir).sort().reverse();
  } catch {}
  for (const file of files) {
    const mail = JSON.parse(readFileSync(join(mailDir, file), 'utf8'));
    if (mail.to === email) return mail.subject.match(/\d{6}/)?.[0] ?? null;
  }
  return null;
}

async function signedInHouston(browser: Browser): Promise<{ page: Page; email: string }> {
  const email = `houston-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const page = await (await browser.newContext()).newPage();
  await page.goto('/');
  await page.getByTestId('account-link').click();
  await page.getByTestId('signin-email').fill(email);
  await page.getByTestId('signin-send').click();
  await expect(page.getByTestId('signin-code')).toBeVisible();
  await expect.poll(() => latestCode(email)).not.toBeNull();
  await page.getByTestId('signin-code').fill(latestCode(email)!);
  await page.getByTestId('signin-verify').click();
  // Signing in returns to where the helper came from.
  await expect(page).not.toHaveURL(/signin/);
  await page.goto('/account');
  await expect(page.getByTestId('account-email')).toHaveText(email);
  await page.goto('/');
  return { page, email };
}

async function ring(browser: Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/');
  await page.getByTestId('ring-email').fill(email.toUpperCase());
  await page.getByTestId('ring-name').fill('Oma Erna');
  await page.getByTestId('ring-button').click();
  await expect(page.getByTestId('status-waiting')).toBeVisible();
  return page;
}

test('Apollo rings a helper by email, who answers', async ({ browser }) => {
  const houston = await signedInHouston(browser);
  const apollo = await ring(browser, houston.email);

  const banner = houston.page.getByTestId('incoming-ring');
  await expect(banner).toContainText('Oma Erna');
  await houston.page.getByTestId('answer-ring').click();

  await expect(houston.page.getByTestId('status-connected')).toBeVisible({ timeout: 20_000 });
  await expect(apollo.getByTestId('status-connected')).toBeVisible({ timeout: 20_000 });
  await expect(banner).toBeHidden();

  // The ring shows up in the helper's history.
  await apollo.getByTestId('hang-up').click();
  await houston.page.goto('/account');
  await expect(houston.page.getByText('Oma Erna')).toBeVisible();
});

test('a declined ring tells Apollo the helper is unavailable', async ({ browser }) => {
  const houston = await signedInHouston(browser);
  const apollo = await ring(browser, houston.email);

  await houston.page.getByTestId('decline-ring').click();
  await expect(apollo.getByTestId('call-ended')).toBeVisible();
  await expect(apollo.getByText('not available right now')).toBeVisible();
  await expect(houston.page.getByTestId('incoming-ring')).toBeHidden();
});

test('ringing an unknown address just waits', async ({ browser }) => {
  const apollo = await ring(browser, 'nobody-here@example.com');
  await expect(apollo.getByTestId('status-waiting')).toBeVisible();
});

test('anonymous sessions still work without signing in', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-session').click();
  await expect(page.getByTestId('invite-link')).toBeVisible();
});
