import { expect, test } from '@playwright/test';
import { installNetworkGuard, login } from './support';

test.beforeEach(async ({ context }) => {
  await installNetworkGuard(context);
});

test('Admin can complete the safe event lifecycle without a hard-delete control', async ({ page }) => {
  const namespace = process.env.ADMIN_E2E_NAMESPACE ?? 'phase11';
  const slug = `${namespace}-event-lifecycle`;
  const title = `Sự kiện E2E ${namespace}`;

  await login(page, 'ADMIN_ONE');
  await page.goto('/admin/events/new');
  await page.getByLabel('Tên sự kiện').fill(title);
  await page.getByLabel('Slug').fill(slug);
  await page.getByLabel('Năm bắt đầu').fill('1010');
  await page.getByLabel('Năm kết thúc hiệu lực').fill('1010');
  await page.getByLabel('Tóm tắt thẻ').fill('Tóm tắt thẻ kiểm thử trình duyệt.');
  await page.getByLabel('Tóm tắt chính').fill('Tóm tắt chính kiểm thử trình duyệt.');
  await page.getByLabel('Nội dung chi tiết').fill('Nội dung chi tiết có kiểm soát cho bản nháp E2E.');
  await page.getByLabel('Ý nghĩa lịch sử').fill('Ý nghĩa lịch sử dùng cho kiểm thử.');
  await page.getByLabel('Key facts, mỗi dòng một ý').fill('Dữ kiện thứ nhất');
  await page.getByLabel('Lớp 10').check();
  await page.getByRole('button', { name: 'Lưu nội dung' }).click();
  await expect(page).toHaveURL(/\/admin\/events\/[^/]+\/edit$/);

  const mediaSection = page.getByRole('region', { name: 'Media và thumbnail' });
  const mediaUrl = 'https://media.admin-e2e.invalid/fixture.png';
  await mediaSection.getByLabel('URL media').fill(mediaUrl);
  await mediaSection.getByRole('button', { name: 'Thêm media' }).click();
  await expect(mediaSection.getByRole('status')).toContainText('Đã cập nhật media.');
  await mediaSection.getByLabel('URL media').fill(mediaUrl);
  await mediaSection.getByRole('button', { name: 'Thêm media' }).click();
  await expect(mediaSection.getByRole('status')).toContainText('Đã cập nhật media.');

  const moveDown = mediaSection.getByLabel('Di chuyển xuống');
  await moveDown.first().click();
  await expect(mediaSection.getByRole('status')).toContainText('Đã cập nhật media.');
  const thumbnails = mediaSection.getByRole('button', { name: 'Chọn thumbnail' });
  await thumbnails.nth(1).click();
  await expect(mediaSection.getByRole('status')).toContainText('Đã cập nhật media.');

  const geographySection = page.getByRole('region', { name: 'Địa lý và mapData' });
  await geographySection.getByLabel('Loại địa lý').selectOption('point');
  await geographySection.getByLabel('Tên marker 1').fill('Thăng Long');
  await geographySection.getByLabel('Vĩ độ marker 1').fill('21.028511');
  await geographySection.getByLabel('Kinh độ marker 1').fill('105.804817');
  await geographySection.getByRole('button', { name: 'Lưu địa lý' }).click();
  await expect(geographySection.getByRole('status')).toContainText('Đã lưu dữ liệu địa lý.');

  await expect(page.getByRole('button', { name: /xóa sự kiện/i })).toHaveCount(0);
  await page.getByRole('button', { name: 'Xuất bản' }).click();
  await expect(page.getByText(/Trạng thái hiện tại: published/)).toBeVisible();

  const publicResponse = await page.request.get(`/api/events/${slug}`);
  expect(publicResponse.ok()).toBeTruthy();
  expect(JSON.stringify(await publicResponse.json())).not.toMatch(/raw_json|sourceJson|local:/i);

  await page.getByRole('button', { name: 'Gỡ xuất bản' }).click();
  const unpublishDialog = page.getByRole('dialog', { name: 'Gỡ xuất bản sự kiện?' });
  await unpublishDialog.getByRole('button', { name: 'Gỡ xuất bản' }).click();
  await expect(page.getByText(/Trạng thái hiện tại: draft/)).toBeVisible();
  expect((await page.request.get(`/api/events/${slug}`)).status()).toBe(404);

  await page.getByRole('button', { name: 'Lưu trữ' }).click();
  const archiveDialog = page.getByRole('dialog', { name: 'Lưu trữ sự kiện?' });
  await archiveDialog.getByRole('button', { name: 'Lưu trữ' }).click();
  await expect(page.getByText(/Trạng thái hiện tại: archived/)).toBeVisible();

  await page.getByRole('button', { name: 'Khôi phục' }).click();
  await expect(page.getByText(/Trạng thái hiện tại: draft/)).toBeVisible();
});
