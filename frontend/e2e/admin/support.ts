import { expect, type BrowserContext, type Page } from '@playwright/test';

export type FixtureAccount =
  | 'ADMIN_ONE'
  | 'ADMIN_TWO'
  | 'STUDENT'
  | 'TEACHER'
  | 'MULTI_ROLE'
  | 'NO_ROLE'
  | 'TARGET';

const syntheticPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
  'base64',
);

export function credentials(name: FixtureAccount) {
  const email = process.env[`ADMIN_E2E_${name}_EMAIL`];
  const password = process.env.ADMIN_E2E_PASSWORD;
  if (!email || !password) {
    throw new Error(`Missing ephemeral fixture configuration for ${name}`);
  }
  return { email, password };
}

export async function installNetworkGuard(context: BrowserContext) {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (
      (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
      && url.port === '15174'
    ) {
      await route.continue();
      return;
    }
    if (url.hostname === 'media.admin-e2e.invalid' && url.pathname === '/fixture.png') {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: syntheticPng,
      });
      return;
    }
    await route.abort('blockedbyclient');
  });
}

export async function login(page: Page, name: FixtureAccount) {
  const account = credentials(name);
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('Email')).toBeVisible();
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

export async function expectNoApplicationJwt(page: Page) {
  const storage = await page.evaluate(() => ({
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage),
  }));
  const serialized = JSON.stringify(storage);
  expect(serialized).not.toMatch(/eyJ[A-Za-z0-9_-]{8,}\./);
  expect(serialized).not.toMatch(/access.?token|refresh.?token|jwt/i);
}

export async function csrf(page: Page) {
  const response = await page.request.get('/api/auth/csrf');
  expect(response.ok()).toBeTruthy();
  const envelope = await response.json();
  return {
    token: envelope.data.token as string,
    header: envelope.data.headerName as string,
  };
}
