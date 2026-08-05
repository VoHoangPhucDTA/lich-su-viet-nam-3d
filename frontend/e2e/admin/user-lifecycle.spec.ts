import { expect, test } from '@playwright/test';
import { installNetworkGuard, login } from './support';

test.beforeEach(async ({ context }) => {
  await installNetworkGuard(context);
});

test('typed user list/detail preserves teacher, multi-role, no-role and deleted states', async ({ page }) => {
  await login(page, 'ADMIN_ONE');
  await page.goto('/admin/users');

  await page.getByPlaceholder('Tìm theo tên hoặc email...').fill('Phase11 Teacher');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Phase11 Teacher')).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Bảng dữ liệu quản trị' })
      .getByText('Giáo viên', { exact: true }),
  ).toBeVisible();

  await page.getByPlaceholder('Tìm theo tên hoặc email...').fill('Phase11 Multi');
  await page.keyboard.press('Enter');
  await page.getByText('Phase11 Multi').click();
  await expect(page.getByText(/Quản trị, Giáo viên, Học sinh/)).toBeVisible();

  await page.goto(`/admin/users/${process.env.ADMIN_E2E_NO_ROLE_ID}`);
  await expect(page.getByText('Chưa có quyền')).toHaveCount(2);
  await page.goto(`/admin/users/${process.env.ADMIN_E2E_DELETED_ID}`);
  await expect(page.getByText('Đã xóa (trạng thái DB)')).toBeVisible();
});

test('role replacement and disable/reactivate invalidate old credentials without unsafe controls', async ({
  browser,
  page,
}) => {
  const targetId = process.env.ADMIN_E2E_TARGET_ID;
  const adminOneId = process.env.ADMIN_E2E_ADMIN_ONE_ID;
  expect(targetId).toBeTruthy();
  expect(adminOneId).toBeTruthy();
  await login(page, 'ADMIN_ONE');
  await page.goto(`/admin/users/${targetId}`);

  await page.getByLabel('Học sinh').uncheck();
  await page.getByLabel('Giáo viên').check();
  await page.getByRole('button', { name: 'Lưu tập quyền' }).click();
  const roleResponse = page.waitForResponse(response =>
    response.request().method() === 'PUT'
      && response.url().endsWith(`/api/admin/users/${targetId}/roles`));
  await page.getByRole('dialog', { name: 'Xác nhận thay thế tập quyền?' })
    .getByRole('button', { name: 'Xác nhận' }).click();
  const replaced = await roleResponse;
  const replacedPayload = await replaced.json();
  expect(
    replaced.status(),
    JSON.stringify({ status: replaced.status(), code: replacedPayload.code }),
  ).toBe(200);
  await expect(page.getByText(/Đã cập nhật quyền/)).toBeVisible();

  const targetContext = await browser.newContext({ serviceWorkers: 'block' });
  await installNetworkGuard(targetContext);
  const targetPage = await targetContext.newPage();
  try {
    await login(targetPage, 'TARGET');
    expect((await targetPage.request.get('/api/auth/me')).status()).toBe(200);

    await page.getByRole('button', { name: 'Vô hiệu hóa' }).click();
    await page.getByRole('dialog', { name: /Xác nhận vô hiệu hóa tài khoản/ })
      .getByRole('button', { name: 'Xác nhận' }).click();
    await expect(page.getByText(/Đã cập nhật trạng thái/)).toBeVisible();
    expect((await targetPage.request.get('/api/auth/me')).status()).toBe(401);

    await page.getByRole('button', { name: 'Kích hoạt' }).click();
    await page.getByRole('dialog', { name: /Xác nhận kích hoạt tài khoản/ })
      .getByRole('button', { name: 'Xác nhận' }).click();
    await expect(page.getByText(/Đã cập nhật trạng thái/)).toBeVisible();
    expect((await targetPage.request.get('/api/auth/me')).status()).toBe(401);
  } finally {
    await targetContext.close();
  }

  await page.goto(`/admin/users/${adminOneId}`);
  await expect(page.getByRole('button', { name: 'Lưu tập quyền' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Vô hiệu hóa' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /xóa|mật khẩu|ẩn danh|thu hồi phiên/i })).toHaveCount(0);
});
