import { expect, test } from '@playwright/test';
import {
  credentials,
  csrf,
  expectNoApplicationJwt,
  installNetworkGuard,
  login,
  logout,
} from './support';

test.beforeEach(async ({ context }) => {
  await installNetworkGuard(context);
});

test('anonymous, student and teacher cannot enter Admin routes', async ({ browser, page }) => {
  await page.goto('/admin/dashboard');
  await expect(page).toHaveURL(/\/login$/);

  for (const account of ['STUDENT', 'TEACHER'] as const) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await installNetworkGuard(context);
    const denied = await context.newPage();
    await login(denied, account);
    await denied.goto('/admin/dashboard');
    await expect(denied.getByText(/403/)).toBeVisible();
    await context.close();
  }
});

test('Admin uses cookie authentication, no browser JWT storage, and can log out', async ({ page }) => {
  await login(page, 'ADMIN_ONE');
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await expectNoApplicationJwt(page);

  const cookies = await page.context().cookies();
  const access = cookies.find(cookie => cookie.name === 'access_token');
  const refresh = cookies.find(cookie => cookie.name === 'refresh_token');
  expect(access?.httpOnly).toBeTruthy();
  expect(refresh?.httpOnly).toBeTruthy();

  await logout(page);
  await page.goto('/admin/dashboard');
  await expect(page).toHaveURL(/\/login$/);
});

test('CSRF rejection is distinct and valid CSRF reaches the quarantined endpoint', async ({ page }) => {
  await login(page, 'ADMIN_ONE');

  const rejected = await page.request.put('/api/admin/events/e2e-quarantine', {
    data: {},
  });
  expect(rejected.status()).toBe(403);
  expect((await rejected.json()).code).toBe('CSRF_TOKEN_INVALID');

  const token = await csrf(page);
  const quarantined = await page.request.put('/api/admin/events/e2e-quarantine', {
    data: {},
    headers: { [token.header]: token.token },
  });
  expect(quarantined.status()).toBe(409);
  expect((await quarantined.json()).code).toBe('ADMIN_EVENT_UPDATE_DISABLED');
});

test('role reduction invalidates an old browser credential and restoration does not revive it', async ({
  browser,
  page,
}) => {
  await login(page, 'ADMIN_ONE');

  const demotedContext = await browser.newContext({ serviceWorkers: 'block' });
  await installNetworkGuard(demotedContext);
  const demotedPage = await demotedContext.newPage();
  await login(demotedPage, 'ADMIN_TWO');
  const targetId = process.env.ADMIN_E2E_ADMIN_TWO_ID;
  expect(targetId).toBeTruthy();

  const beforeResponse = await page.request.get(`/api/admin/users/${targetId}`);
  expect(beforeResponse.ok()).toBeTruthy();
  const before = (await beforeResponse.json()).data;
  let demotedDetail: { account: { updatedAt: string } } | null = null;
  try {
    const firstCsrf = await csrf(page);
    const demote = await page.request.put(`/api/admin/users/${targetId}/roles`, {
      headers: { [firstCsrf.header]: firstCsrf.token },
      data: {
        expectedUpdatedAt: before.account.updatedAt,
        roles: ['student'],
      },
    });
    expect(demote.ok()).toBeTruthy();
    demotedDetail = (await demote.json()).data;

    const staleAfterDemotion = await demotedPage.request.get('/api/admin/dashboard');
    expect(staleAfterDemotion.status()).toBe(401);
  } finally {
    if (demotedDetail) {
      const secondCsrf = await csrf(page);
      const restore = await page.request.put(`/api/admin/users/${targetId}/roles`, {
        headers: { [secondCsrf.header]: secondCsrf.token },
        data: {
          expectedUpdatedAt: demotedDetail.account.updatedAt,
          roles: ['admin'],
        },
      });
      expect(restore.ok()).toBeTruthy();
    }
  }

  const staleAfterRestore = await demotedPage.request.get('/api/admin/dashboard');
  expect(staleAfterRestore.status()).toBe(401);
  expect(credentials('ADMIN_TWO').password).toBeTruthy();
  await demotedContext.close();
});
