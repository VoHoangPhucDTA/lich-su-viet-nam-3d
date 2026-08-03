import { expect, test } from '@playwright/test';
import { installNetworkGuard, login } from './support';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
  'base64',
);

test.beforeEach(async ({ context }) => {
  await installNetworkGuard(context);
});

test('image queue stops without replay after a two-context stale conflict', async ({ browser }) => {
  const eventId = process.env.ADMIN_E2E_CONFLICT_EVENT_ID!;
  const firstContext = await browser.newContext({ serviceWorkers: 'block' });
  const secondContext = await browser.newContext({ serviceWorkers: 'block' });
  await installNetworkGuard(firstContext);
  await installNetworkGuard(secondContext);
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  try {
    await login(first, 'ADMIN_ONE');
    await login(second, 'ADMIN_TWO');
    await Promise.all([
      first.goto(`/admin/events/${eventId}/edit`),
      second.goto(`/admin/events/${eventId}/edit`),
    ]);

    const gallery = second.getByRole('region', { name: 'Tải ảnh thư viện' });
    await gallery.getByLabel('Chọn ảnh thư viện').setInputFiles([
      { name: 'conflict-a.png', mimeType: 'image/png', buffer: png },
      { name: 'conflict-b.png', mimeType: 'image/png', buffer: png },
    ]);
    await gallery.getByLabel(/Mô tả thay thế/).nth(0).fill('Conflict A');
    await gallery.getByLabel(/Mô tả thay thế/).nth(1).fill('Conflict B');

    const title = first.getByLabel('Tên sự kiện');
    await title.fill(`${await title.inputValue()} cập nhật`);
    await first.getByRole('button', { name: 'Lưu nội dung' }).click();
    await expect(first.getByText('Đã lưu nội dung.', { exact: true })).toBeVisible();

    let uploadRequests = 0;
    second.on('request', request => {
      if (
        request.method() === 'POST'
        && /\/api\/admin\/events\/[^/]+\/media\/images$/.test(request.url())
      ) uploadRequests += 1;
    });
    await gallery.getByRole('button', { name: 'Tải lần lượt ảnh đang chờ' }).click();
    const reloadButton = second.getByRole('button', { name: 'Tải dữ liệu mới nhất' });
    const conflictAlert = second.getByRole('alert').filter({ has: reloadButton });
    await expect(conflictAlert).toContainText(/thay đổi ở nơi khác/i);
    await expect(reloadButton).toBeVisible();
    await expect(second.getByRole('button', { name: 'Lưu nội dung' })).toBeDisabled();
    await expect(gallery.getByRole('button', { name: 'Tải lần lượt ảnh đang chờ' })).toBeDisabled();
    await expect(gallery.getByText('reconciliation_required')).toHaveCount(1);
    await expect(gallery.getByText('queued')).toHaveCount(1);
    expect(uploadRequests).toBe(1);
    await expect(gallery.getByRole('button', { name: /Thử lại ảnh này/ })).toHaveCount(0);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test('image upload panels remain usable without horizontal overflow', async ({ page }) => {
  await login(page, 'ADMIN_ONE');
  await page.goto(`/admin/events/${process.env.ADMIN_E2E_CONFLICT_EVENT_ID}/edit`);
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByLabel('Chọn ảnh đại diện')).toBeVisible();
    await expect(page.getByLabel('Chọn ảnh thư viện')).toBeVisible();
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
