import { expect, test } from '@playwright/test';
import { installNetworkGuard, login } from './support';

test('a stale editor is blocked and requires an explicit destructive reload', async ({ browser }) => {
  const eventId = process.env.ADMIN_E2E_CONFLICT_EVENT_ID;
  expect(eventId).toBeTruthy();

  const firstContext = await browser.newContext({ serviceWorkers: 'block' });
  const staleContext = await browser.newContext({ serviceWorkers: 'block' });
  await installNetworkGuard(firstContext);
  await installNetworkGuard(staleContext);
  const first = await firstContext.newPage();
  const stale = await staleContext.newPage();

  try {
    await login(first, 'ADMIN_ONE');
    await login(stale, 'ADMIN_TWO');
    await Promise.all([
      first.goto(`/admin/events/${eventId}/edit`),
      stale.goto(`/admin/events/${eventId}/edit`),
    ]);

    await first.getByLabel('Tên sự kiện').fill('Conflict winner');
    await first.getByRole('button', { name: 'Lưu nội dung' }).click();
    await expect(first.getByText('Đã lưu nội dung.', { exact: true })).toBeVisible();

    await stale.getByLabel('Tên sự kiện').fill('Stale overwrite attempt');
    await stale.getByRole('button', { name: 'Lưu nội dung' }).click();
    const conflict = stale.getByRole('alert').filter({ hasText: 'đã thay đổi ở nơi khác' });
    await expect(conflict).toBeVisible();
    await expect(stale.getByRole('button', { name: 'Lưu nội dung' })).toBeDisabled();
    await expect(stale.getByRole('button', { name: 'Lưu khối lớp' })).toBeDisabled();
    await expect(stale.getByRole('button', { name: 'Thêm media' })).toBeDisabled();

    await stale.getByRole('button', { name: 'Tải dữ liệu mới nhất' }).click();
    const dialog = stale.getByRole('dialog', { name: 'Tải dữ liệu mới nhất?' });
    await expect(dialog).toContainText('Mọi giá trị chưa lưu');
    await expect(dialog).toContainText('không tự động gửi lại');
    await dialog.getByRole('button', { name: 'Hủy' }).click();
    await expect(stale.getByLabel('Tên sự kiện')).toHaveValue('Stale overwrite attempt');
  } finally {
    await firstContext.close();
    await staleContext.close();
  }
});
