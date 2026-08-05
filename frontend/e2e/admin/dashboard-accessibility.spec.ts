import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { csrf, installNetworkGuard, login } from './support';

test.beforeEach(async ({ context }) => {
  await installNetworkGuard(context);
});

test('Dashboard initial load uses only the aggregate request and attention is actionable', async ({ page }) => {
  await login(page, 'ADMIN_ONE');
  const requests: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/admin/dashboard')) requests.push(path);
  });

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Tổng quan quản trị' })).toBeVisible();
  await expect(page.getByText(process.env.ADMIN_E2E_ATTENTION_EVENT_TITLE ?? '')).toBeVisible();

  expect(requests.filter(path => path === '/api/admin/dashboard')).toHaveLength(1);
  expect(requests).not.toContain('/api/admin/dashboard/metrics');
  expect(requests).not.toContain('/api/admin/dashboard/attention');
  expect(requests).not.toContain('/api/admin/dashboard/audit');

  await page.getByText(process.env.ADMIN_E2E_ATTENTION_EVENT_TITLE ?? '').click();
  await expect(page).toHaveURL(/\/admin\/events\/admin-e2e-attention$/);
});

test('aggregate failure shows section errors and an audit retry requests only audit', async ({ page }) => {
  await login(page, 'ADMIN_ONE');
  await page.route('**/api/admin/dashboard', route => route.abort('failed'));
  await page.reload();
  await expect(page.getByRole('alert')).toHaveCount(4);

  await page.unroute('**/api/admin/dashboard');
  const requests: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/admin/dashboard')) requests.push(path);
  });
  await page.getByRole('button', { name: 'Thử lại' }).last().click();
  await expect(page.getByRole('heading', { name: 'Hoạt động quản trị gần đây' })).toBeVisible();
  expect(requests).toEqual(['/api/admin/dashboard/audit']);
});

test('Dashboard metrics reflect a safe draft created before refresh', async ({ page }) => {
  await login(page, 'ADMIN_ONE');
  const metric = page.getByRole('link', { name: /Tổng sự kiện:/ });
  const beforeLabel = await metric.getAttribute('aria-label');
  const before = Number(beforeLabel?.match(/Tổng sự kiện: (\d+)/)?.[1]);
  expect(Number.isFinite(before)).toBeTruthy();

  const namespace = process.env.ADMIN_E2E_NAMESPACE ?? 'phase11';
  const token = await csrf(page);
  const create = await page.request.post('/api/admin/events', {
    headers: { [token.header]: token.token },
    data: {
      title: `Dashboard refresh ${namespace}`,
      slug: `${namespace}-dashboard-refresh`,
      eventLevel: 'atomic',
      eventType: 'political',
      keyFacts: [],
      grades: [],
    },
  });
  expect(create.status()).toBe(201);

  await page.reload();
  await expect(page.getByRole('link', {
    name: new RegExp(`Tổng sự kiện: ${before + 1}\\.`),
  })).toBeVisible();
});

test('tested Admin viewports have no serious/critical axe findings and preserve focus behavior', async ({ page }) => {
  await login(page, 'ADMIN_ONE');
  const viewports = [
    { width: 360, height: 800 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/admin/dashboard');
    await expect(page.getByRole('heading', { name: 'Tổng quan quản trị' })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include('#admin-main-content')
      .analyze();
    const severe = results.violations.filter(item =>
      item.impact === 'serious' || item.impact === 'critical');
    expect(severe, severe.map(item => `${item.id}: ${item.help}`).join('\n')).toEqual([]);
  }

  await page.setViewportSize({ width: 768, height: 1024 });
  const menu = page.getByRole('button', { name: 'Mở menu quản trị' });
  await menu.click();
  await expect(page.getByRole('button', { name: 'Đóng menu quản trị' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();

  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 384,
    height: 512,
    deviceScaleFactor: 2,
    mobile: false,
  });
  const bodyOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(bodyOverflow).toBeFalsy();
});
