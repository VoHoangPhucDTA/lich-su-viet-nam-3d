import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminDashboardPage from '../AdminDashboardPage';
import {
  getAdminDashboardAttention,
  getAdminDashboardAudit,
  getAdminDashboardMetrics,
} from '../../../services/adminApi';

vi.mock('../../../layouts/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-layout">{children}</div>
  ),
}));

vi.mock('../../../components/admin/AdminStatsCard', () => ({
  default: ({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) => (
    <article data-testid={`stat-${label}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </article>
  ),
}));

vi.mock('../../../services/adminApi', async () => {
  const actual = await vi.importActual<typeof import('../../../services/adminApi')>(
    '../../../services/adminApi',
  );
  return {
    ...actual,
    getAdminDashboardMetrics: vi.fn(),
    getAdminDashboardAttention: vi.fn(),
    getAdminDashboardAudit: vi.fn(),
  };
});

const metrics = {
  events: {
    total: 12,
    published: 7,
    draft: 3,
    archived: 2,
    missingThumbnail: 4,
    missingActiveMedia: 5,
    missingOrInvalidMapData: 6,
    withCompletenessIssues: 8,
  },
  users: { activeTotal: 20, createdLast7Days: 3 },
};

const attention = [{
  id: 'event-needs-review',
  title: 'Sự kiện cần rà soát',
  chronology: {
    startYear: null,
    endYear: null,
    effectiveEndYear: null,
    displayDate: null,
    datePrecision: null,
  },
  status: 'draft' as const,
  thumbnail: null,
  completeness: {
    complete: false,
    issueCount: 2,
    issues: [
      { code: 'MISSING_CORE_CONTENT', section: 'CONTENT', severity: 'ERROR' as const, fields: ['cardSummary'] },
      { code: 'MISSING_THUMBNAIL', section: 'MEDIA', severity: 'WARNING' as const, fields: ['thumbnail'] },
    ],
  },
  updatedAt: '2026-01-01T00:00:00Z',
  reasonCode: 'MISSING_CORE_CONTENT',
  recommendedFilter: 'status=draft',
}];

const audit = [{
  actor: { displayName: 'Quản trị viên' },
  action: 'event.status_updated',
  entityType: 'historical_event',
  entityId: 'event-needs-review',
  timestamp: '2026-01-02T00:00:00Z',
}];

describe('AdminDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAdminDashboardMetrics).mockResolvedValue(metrics);
    vi.mocked(getAdminDashboardAttention).mockResolvedValue(attention);
    vi.mocked(getAdminDashboardAudit).mockResolvedValue(audit);
  });

  const renderPage = () => render(
    <MemoryRouter>
      <AdminDashboardPage />
    </MemoryRouter>,
  );

  it('keeps metrics, attention and audit loading states independent from empty states', () => {
    vi.mocked(getAdminDashboardMetrics).mockReturnValue(new Promise(() => undefined));
    vi.mocked(getAdminDashboardAttention).mockReturnValue(new Promise(() => undefined));
    vi.mocked(getAdminDashboardAudit).mockReturnValue(new Promise(() => undefined));

    renderPage();

    expect(screen.getByText('Đang tải số liệu sự kiện…')).toBeInTheDocument();
    expect(screen.getByText('Đang tải hàng đợi xử lý…')).toBeInTheDocument();
    expect(screen.getByText('Đang tải hoạt động quản trị…')).toBeInTheDocument();
    expect(screen.queryByText('Không có sự kiện cần xử lý')).not.toBeInTheDocument();
    expect(screen.queryByText('Chưa có hoạt động quản trị')).not.toBeInTheDocument();
  });

  it('renders actionable cards, user metrics and detail links without the duplicated table or mutations', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId('stat-Tổng sự kiện')).toBeInTheDocument());
    expect(screen.getByTestId('stat-Người dùng hoạt động')).toHaveTextContent('20');
    expect(screen.getByTestId('stat-Mới trong 7 ngày')).toHaveTextContent('3');
    expect(screen.getByTestId('stat-Người dùng hoạt động').closest('a')).toBeNull();
    expect(screen.getByTestId('stat-Mới trong 7 ngày').closest('a')).toBeNull();
    expect(screen.getByRole('link', { name: /Bản nháp: 3/ })).toHaveAttribute(
      'href', '/admin/events?status=draft',
    );
    expect(screen.getByRole('link', { name: /Thiếu thumbnail: 4/ })).toHaveAttribute(
      'href', '/admin/events?missingThumbnail=true',
    );
    expect(screen.getByRole('link', { name: /Thiếu media: 5/ })).toHaveAttribute(
      'href', '/admin/events?missingMedia=true',
    );
    expect(screen.getByRole('link', { name: /Map data cần xử lý: 6/ })).toHaveAttribute(
      'href', '/admin/dashboard#attention-queue',
    );
    expect(screen.getByRole('link', { name: /Chưa hoàn thiện: 8/ })).toHaveAttribute(
      'href', '/admin/dashboard#attention-queue',
    );
    expect(screen.getByText('Sự kiện cần rà soát').closest('a')).toHaveAttribute(
      'href', '/admin/events/event-needs-review',
    );
    expect(screen.getByText('Quản trị viên')).toBeInTheDocument();
    expect(getAdminDashboardMetrics).toHaveBeenCalledTimes(1);
    expect(getAdminDashboardAttention).toHaveBeenCalledTimes(1);
    expect(getAdminDashboardAudit).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('event-table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tạo sự kiện|sửa sự kiện|xóa sự kiện/i }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /tạo sự kiện|sửa sự kiện|xóa sự kiện/i }))
      .not.toBeInTheDocument();
  });

  it('renders explicit attention and audit empty states only after loading succeeds', async () => {
    vi.mocked(getAdminDashboardAttention).mockResolvedValue([]);
    vi.mocked(getAdminDashboardAudit).mockResolvedValue([]);

    renderPage();

    await waitFor(() => expect(screen.getByText('Không có sự kiện cần xử lý')).toBeInTheDocument());
    expect(screen.getByText('Chưa có hoạt động quản trị')).toBeInTheDocument();
    expect(screen.queryByText('Đang tải hoạt động quản trị…')).not.toBeInTheDocument();
  });

  it('shows a partial audit error and clears it after a successful retry', async () => {
    vi.mocked(getAdminDashboardAudit)
      .mockRejectedValueOnce(new Error('Lỗi audit tạm thời'))
      .mockResolvedValueOnce(audit);

    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Lỗi audit tạm thời'));
    expect(screen.getByTestId('stat-Tổng sự kiện')).toBeInTheDocument();
    expect(screen.getByText('Sự kiện cần rà soát')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    await waitFor(() => expect(screen.getByText('Quản trị viên')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(getAdminDashboardAudit).toHaveBeenCalledTimes(2);
  });
});
