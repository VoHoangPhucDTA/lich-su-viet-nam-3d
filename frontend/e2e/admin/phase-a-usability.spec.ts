import { expect, test } from '@playwright/test';
import { installNetworkGuard, login } from './support';

const viewports = [
  { width: 360, height: 800 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];

test.beforeEach(async ({ context }) => {
  await installNetworkGuard(context);
});

test('Admin navigation stays focused on four reachable destinations at representative widths', async ({ page }) => {
  await login(page, 'ADMIN_ONE');

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/admin/dashboard');
    if (viewport.width < 1024) {
      await page.getByRole('button', { name: 'Mở menu quản trị' }).click();
    }

    const navigation = page.getByRole('navigation', { name: 'Điều hướng quản trị' });
    await expect(navigation.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('href', '/admin/dashboard');
    await expect(navigation.getByRole('link', { name: 'Sự kiện lịch sử' })).toHaveAttribute('href', '/admin/events');
    await expect(navigation.getByRole('link', { name: 'Người dùng' })).toHaveAttribute('href', '/admin/users');
    await expect(navigation.getByRole('link', { name: 'Duyệt câu hỏi AI' })).toHaveAttribute('href', '/admin/exams/ai-candidates');
    await expect(navigation.getByText('Liên kết', { exact: true })).toHaveCount(0);
    await expect(navigation.getByRole('link', { name: 'Trang học tập' })).toHaveCount(0);
    await expect(navigation.getByRole('link', { name: 'Bản đồ' })).toHaveCount(0);

    if (viewport.width < 1024) {
      await page.keyboard.press('Escape');
    }
  }
});

test('Event list actions preserve URL state and the editor exposes mutation states', async ({ page }) => {
  const eventTitle = process.env.ADMIN_E2E_ATTENTION_EVENT_TITLE ?? 'Phase11 Attention Event';
  await login(page, 'ADMIN_ONE');
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/admin/events?status=draft&eventType=political&sort=title:asc&offset=0');

  await expect(page.getByRole('heading', { name: 'Sự kiện lịch sử' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tạo sự kiện' })).toBeVisible();
  await expect(page.getByText('2 bộ lọc đang dùng')).toBeVisible();
  await expect(page.getByRole('link', { name: `Xem ${eventTitle}` })).toBeVisible();
  const edit = page.getByRole('link', { name: `Chỉnh sửa ${eventTitle}` });
  await expect(edit).toBeVisible();

  const firstCell = page.locator('.admin-data-table td').first();
  await expect(firstCell).toHaveCSS('display', 'grid');
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  )).toBeTruthy();

  await edit.click();
  await expect(page).toHaveURL(/\/admin\/events\/admin-e2e-attention\/edit$/);
  const backHref = await page.getByRole('link', { name: '← Quay lại danh sách' }).getAttribute('href');
  const backUrl = new URL(backHref ?? '', 'http://127.0.0.1:15174');
  expect(backUrl.pathname).toBe('/admin/events');
  expect(backUrl.searchParams.get('status')).toBe('draft');
  expect(backUrl.searchParams.get('eventType')).toBe('political');
  expect(backUrl.searchParams.get('sort')).toBe('title:asc');
  expect(backUrl.searchParams.get('offset')).toBe('0');

  const contentSection = page.getByRole('heading', { name: 'Nội dung' })
    .locator('xpath=ancestor::section[1]');
  const title = page.getByLabel('Tên sự kiện');
  await title.fill(`${eventTitle} updated`);
  await expect(contentSection.getByText('Chưa lưu')).toBeVisible();

  await page.route('**/api/admin/events/admin-e2e-attention/core', async route => {
    await new Promise(resolve => setTimeout(resolve, 350));
    await route.continue();
  }, { times: 1 });
  await page.getByRole('button', { name: 'Lưu nội dung' }).click();
  await expect(contentSection.getByText('Đang lưu')).toBeVisible();
  await expect(contentSection.getByText('Đã lưu')).toBeVisible();

  await title.fill(`${eventTitle} rejected`);
  await page.route('**/api/admin/events/admin-e2e-attention/core', route => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({
      success: false,
      code: 'PHASE_A_EXPECTED_ERROR',
      message: 'Phase A expected error',
      data: null,
      timestamp: new Date().toISOString(),
    }),
  }), { times: 1 });
  await page.getByRole('button', { name: 'Lưu nội dung' }).click();
  await expect(contentSection.getByText('Có lỗi')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Phase A expected error');
});

test('Native selects, responsive filters and Admin focus styling remain usable', async ({ page }) => {
  await login(page, 'ADMIN_ONE');
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/admin/events?status=draft&eventType=political&sort=title:asc');

  const status = page.getByRole('combobox', { name: 'Trạng thái' });
  expect(await status.evaluate(element => element.tagName)).toBe('SELECT');
  await expect(status).toHaveCSS('appearance', 'none');
  await status.focus();
  expect(await status.evaluate(element => {
    const style = getComputedStyle(element);
    return style.outlineStyle === 'solid'
      && parseFloat(style.outlineWidth) >= 2
      && parseFloat(style.borderRadius) > 0;
  })).toBeTruthy();

  await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();
  await expect(page.getByText('Chưa áp dụng bộ lọc')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('sort')).toBe('title:asc');
  expect(new URL(page.url()).searchParams.has('status')).toBeFalsy();
  expect(new URL(page.url()).searchParams.has('eventType')).toBeFalsy();

  await page.emulateMedia({ forcedColors: 'active' });
  await status.focus();
  expect(await status.evaluate(element => {
    const style = getComputedStyle(element);
    return style.outlineStyle === 'solid' && parseFloat(style.outlineWidth) >= 2;
  })).toBeTruthy();

  await page.emulateMedia({ forcedColors: 'none' });
  await page.goto('/browse');
  await expect(page.locator('.admin-shell')).toHaveCount(0);
});

test('User cards and AI queue remain truthful and usable on a narrow viewport', async ({ page }) => {
  await login(page, 'ADMIN_ONE');
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/admin/users');

  await expect(page.getByRole('heading', { name: 'Người dùng' })).toBeVisible();
  await expect(page.locator('.admin-data-table td').first()).toHaveCSS('display', 'grid');
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  )).toBeTruthy();

  await page.getByRole('combobox', { name: 'Trạng thái' }).selectOption('active');
  await expect(page.getByText('1 bộ lọc đang dùng')).toBeVisible();
  await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();
  await expect(page.getByText('Chưa áp dụng bộ lọc')).toBeVisible();

  await page.goto('/admin/exams/ai-candidates');
  await expect(page.getByRole('heading', { name: 'Duyệt câu hỏi AI' })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('Candidate là câu hỏi nháp');
  await expect(page.getByText('Chưa có candidate cần duyệt')).toBeVisible();
  await expect(page.getByRole('button', { name: /sinh candidate/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /sinh candidate/i })).toHaveCount(0);
});
