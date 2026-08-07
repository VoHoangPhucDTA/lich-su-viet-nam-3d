import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminMediaCleanupPage from '../AdminMediaCleanupPage';
import {
  getAdminMediaCleanup,
  getAdminMediaCleanupCapability,
  getAdminMediaCleanupSummary,
  postAdminMediaCleanupTick,
  type AdminMediaCleanupCapability,
  type AdminMediaCleanupItem,
  type AdminMediaCleanupSummary,
  type AdminPage,
} from '../../../services/adminApi';

vi.mock('../../../layouts/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../../services/adminApi', async () => {
  const actual = await vi.importActual<typeof import('../../../services/adminApi')>('../../../services/adminApi');
  return {
    ...actual,
    getAdminMediaCleanup: vi.fn(),
    getAdminMediaCleanupSummary: vi.fn(),
    getAdminMediaCleanupCapability: vi.fn(),
    postAdminMediaCleanupTick: vi.fn(),
  };
});

const summary: AdminMediaCleanupSummary = { pending: 2, claimed: 1, failed: 3, completed: 10 };

const healthyCapability: AdminMediaCleanupCapability = {
  enabled: true,
  storageAvailable: true,
  lastTickAt: new Date(Date.now() - 30_000).toISOString(),
  overduePending: 0,
  intervalMs: 60_000,
  lastClaimed: 1,
  lastCompleted: 1,
  lastFailed: 0,
  lastErrorCode: null,
};

const overdueCapability: AdminMediaCleanupCapability = {
  ...healthyCapability,
  overduePending: 2,
  lastTickAt: new Date(Date.now() - 240_000).toISOString(),
  lastErrorCode: 'CONNECTION_REFUSED',
};

const items: AdminMediaCleanupItem[] = [
  {
    id: 41,
    provider: 'cloudinary',
    publicId: 'events/chi-vi-mor/m/8f3a0f5a-7310-4f1c-9c9a-7c9d0f5a7310',
    operation: 'DELETE',
    status: 'PENDING',
    attempts: 0,
    nextAttemptAt: new Date(Date.now() - 90_000).toISOString(),
    createdAt: '2026-08-03T00:00:00Z',
    updatedAt: '2026-08-03T00:00:00Z',
    eventId: 'chi-vi-mor',
    managedAssetId: '8f3a0f5a-7310-4f1c-9c9a-7c9d0f5a7310',
  },
  {
    id: 42,
    provider: 'cloudinary',
    publicId: 'events/chi-vi-mor/m/9d4b1c6b-8421-4f2d-8d0b-8d0e1f6b8421',
    providerAssetId: 'asset-42',
    operation: 'DELETE',
    status: 'FAILED',
    attempts: 5,
    nextAttemptAt: null,
    claimExpiresAt: null,
    lastErrorCode: 'EVENT_IMAGE_UPLOAD_UNAVAILABLE',
    createdAt: '2026-08-02T00:00:00Z',
    updatedAt: '2026-08-03T00:00:00Z',
  },
];

const overdueItem: AdminMediaCleanupItem = {
  ...items[0]!,
  id: 43,
  nextAttemptAt: new Date(Date.now() - 240_000).toISOString(),
};

const page: AdminPage<AdminMediaCleanupItem> = {
  items,
  count: items.length,
  total: items.length,
  limit: 25,
  offset: 0,
};

const overduePage: AdminPage<AdminMediaCleanupItem> = {
  items: [overdueItem],
  count: 1,
  total: 1,
  limit: 25,
  offset: 0,
};

const emptyPage: AdminPage<AdminMediaCleanupItem> = {
  items: [],
  count: 0,
  total: 0,
  limit: 25,
  offset: 0,
};

function renderPage() {
  return render(<AdminMediaCleanupPage />);
}

describe('AdminMediaCleanupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAdminMediaCleanupSummary).mockResolvedValue(summary);
    vi.mocked(getAdminMediaCleanupCapability).mockResolvedValue(healthyCapability);
    vi.mocked(getAdminMediaCleanup).mockResolvedValue(page);
  });

  it('explains the queue purpose, shows summary counts and lists cleanup tasks', async () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Dọn dẹp media' })).toBeInTheDocument();
    expect(screen.getByText(/không phải thư viện ảnh/i)).toBeInTheDocument();
    expect(screen.getByText(/worker nền là chủ thể duy nhất/i)).toBeInTheDocument();
    expect(screen.getByText(/không bao giờ ảnh hưởng tới ảnh đang hoạt động/i)).toBeInTheDocument();

    const overview = await screen.findByRole('region', { name: 'Tổng quan dọn dẹp' });
    expect(within(overview).getByText('2')).toBeInTheDocument();
    expect(within(overview).getByText('1')).toBeInTheDocument();
    expect(within(overview).getByText('3')).toBeInTheDocument();
    expect(within(overview).getByText('10')).toBeInTheDocument();

    for (const header of ['Trạng thái', 'Tài sản', 'Thao tác', 'Lần thử', 'Lần kế tiếp', 'Tạo lúc', 'Lỗi']) {
      expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
    expect(screen.getAllByText('cloudinary · DELETE')).toHaveLength(2);
    expect(screen.getByText('Sự kiện: chi-vi-mor')).toBeInTheDocument();
    expect(screen.getByText('EVENT_IMAGE_UPLOAD_UNAVAILABLE')).toBeInTheDocument();
    expect(screen.getByText(/Worker hoạt động bình thường/i)).toBeInTheDocument();
    expect(screen.getByTestId('admin-cleanup-tick-now')).toBeInTheDocument();
    expect(getAdminMediaCleanupSummary).toHaveBeenCalledTimes(1);
    expect(getAdminMediaCleanup).toHaveBeenCalledWith(expect.objectContaining({
      sortBy: 'nextAttemptAt', sortDir: 'asc', limit: 25, offset: 0,
    }));
    expect(getAdminMediaCleanupCapability).toHaveBeenCalledTimes(1);
  });

  it('shows the waiting-queue empty state when there is nothing to process', async () => {
    vi.mocked(getAdminMediaCleanup).mockResolvedValue(emptyPage);
    renderPage();
    expect(await screen.findByText('Không có tác vụ dọn dẹp đang chờ xử lý.')).toBeInTheDocument();
  });

  it('refetches through the status filter and resets pagination without duplicate requests', async () => {
    renderPage();
    await screen.findByText('Sự kiện: chi-vi-mor');

    const trigger = screen.getByRole('combobox', { name: 'Lọc trạng thái cleanup' });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('option', { name: 'Thất bại' }));

    await waitFor(() => expect(getAdminMediaCleanup).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'FAILED', offset: 0 }),
    ));
  });

  it('reloads the queue on refresh', async () => {
    renderPage();
    await screen.findByText('Sự kiện: chi-vi-mor');
    const callsBefore = vi.mocked(getAdminMediaCleanup).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Làm mới' }));
    await waitFor(() =>
      expect(vi.mocked(getAdminMediaCleanup).mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it('flags overdue PENDING tasks with a "Quá hạn xử lý" badge and relative time hint', async () => {
    vi.mocked(getAdminMediaCleanup).mockResolvedValue(overduePage);
    vi.mocked(getAdminMediaCleanupCapability).mockResolvedValue(overdueCapability);
    renderPage();
    const badge = await screen.findByTestId('admin-cleanup-overdue-badge');
    expect(badge).toHaveTextContent(/Quá hạn xử lý/);
    expect(screen.getByTestId('admin-cleanup-worker-state'))
      .toHaveTextContent(CONNECTION_REFUSED_LABEL);
    expect(screen.getByTestId('admin-cleanup-worker-state'))
      .toHaveTextContent(/2 nhiệm vụ quá hạn/);
  });

  it('invokes the manual tick endpoint when the operator clicks "Chạy ngay"', async () => {
    vi.mocked(postAdminMediaCleanupTick).mockResolvedValue({
      ...healthyCapability,
      lastClaimed: 1,
      lastCompleted: 1,
      lastFailed: 0,
    });
    renderPage();
    fireEvent.click(await screen.findByTestId('admin-cleanup-tick-now'));
    await waitFor(() => expect(postAdminMediaCleanupTick).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('admin-cleanup-tick-banner'))
      .toHaveTextContent(/Đã hoàn tất 1 nhiệm vụ/);
  });

  it('tolerates a transient capability fetch failure without breaking the summary', async () => {
    vi.mocked(getAdminMediaCleanupCapability).mockRejectedValueOnce(new Error('boom'));
    renderPage();
    // The page still renders the historical summary counts even when the
    // capability endpoint failed.
    const overview = await screen.findByRole('region', { name: 'Tổng quan dọn dẹp' });
    expect(within(overview).getByText('2')).toBeInTheDocument();
    expect(screen.getByTestId('admin-cleanup-worker-state'))
      .toHaveTextContent(/Không xác định/);
  });
});

const CONNECTION_REFUSED_LABEL = /Worker chạy nhưng có lỗi: CONNECTION_REFUSED/;
