import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminUserDetailPage from '../AdminUserDetailPage';
import { safeAdminUsersReturnLocation } from '../adminUserNavigation';
import {
  getAdminUserDetail,
  replaceAdminUserRoles,
  updateAdminUserStatus,
  type AdminUserDetail,
} from '../../../services/adminApi';
import { ApiRequestError } from '../../../services/apiClient';

vi.mock('../../../layouts/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

let currentUserId = 'user-1';
vi.mock('../../../auth/AuthContext', () => ({
  useAuth: () => ({
    currentUser: {
      id: currentUserId,
      fullName: 'Current admin',
      email: 'current-admin@example.test',
      role: 'admin',
      roles: ['admin'],
    },
  }),
}));

vi.mock('../../../services/adminApi', async () => {
  const actual = await vi.importActual<typeof import('../../../services/adminApi')>('../../../services/adminApi');
  return {
    ...actual,
    getAdminUserDetail: vi.fn(),
    replaceAdminUserRoles: vi.fn(),
    updateAdminUserStatus: vi.fn(),
  };
});

const detail: AdminUserDetail = {
  account: {
    id: 'user-1',
    displayName: 'Nguyễn Quản trị',
    email: 'admin@example.test',
    primaryRole: 'admin',
    roles: ['admin', 'teacher', 'student'],
    status: 'active',
    emailVerified: true,
    emailVerifiedAt: '2026-01-01T00:00:00Z',
    grade: '12',
    school: 'Trường thử nghiệm',
    avatarUrl: 'https://cdn.example.test/avatar.png',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00.123456Z',
  },
  sessions: {
    trackingMode: 'STATELESS_JWT',
    trackingAvailable: false,
    activeRefreshSessionCount: null,
  },
  learning: {
    progress: {
      eventsViewed: 12,
      distinctEventsViewed: 8,
      totalMinutes: 45,
      lastActivityAt: '2026-01-03T00:00:00Z',
    },
    quizzes: {
      submittedCount: 3,
      averageScore10: 8.5,
      lastSubmittedAt: '2026-01-04T00:00:00Z',
    },
    exams: {
      submittedCount: 2,
      averageScore10: 9,
      lastSubmittedAt: '2026-01-05T00:00:00Z',
    },
  },
  activity: {
    lastMeaningfulActivityAt: '2026-01-05T00:00:00Z',
    recent: [{
      kind: 'exam_submitted',
      timestamp: '2026-01-05T00:00:00Z',
      title: 'Bài thi lịch sử',
      score10: 9,
    }],
  },
  recentAdminAudit: [{
    action: 'USER_STATUS_UPDATED',
    relation: 'target',
    actor: { displayName: 'Quản trị khác' },
    entityType: 'user',
    entityId: 'user-1',
    timestamp: '2026-01-06T00:00:00Z',
  }],
};

function renderPage(state: unknown = { from: '/admin/users?role=teacher&status=active' }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/admin/users/user-1', state }]}>
      <Routes>
        <Route path="/admin/users/:id" element={<AdminUserDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminUserDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUserId = 'user-1';
    vi.mocked(getAdminUserDetail).mockResolvedValue(detail);
  });

  it('renders typed read-only account, learning, activity, audit and unavailable session data', async () => {
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải chi tiết');
    expect(await screen.findByRole('heading', { name: 'Nguyễn Quản trị' })).toBeInTheDocument();
    for (const heading of [
      'Tài khoản',
      'Xác thực và phiên',
      'Tổng hợp học tập',
      'Hoạt động học gần đây',
      'Audit quản trị gần đây',
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
    expect(screen.getByText('Không thể thống kê')).toBeInTheDocument();
    expect(screen.getAllByText('Quản trị').length).toBeGreaterThan(0);
    expect(screen.getByText('Nộp bài kiểm tra cuối')).toBeInTheDocument();
    expect(screen.getByText('Nộp bài thi cuối')).toBeInTheDocument();
    expect(screen.getByText('Bài thi lịch sử')).toBeInTheDocument();
    expect(screen.getByText('USER_STATUS_UPDATED')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Quay lại danh sách' }))
      .toHaveAttribute('href', '/admin/users?role=teacher&status=active');
    expect(screen.queryByRole('button', { name: /sửa|xóa|khóa|đổi quyền/i })).not.toBeInTheDocument();
    expect(getAdminUserDetail).toHaveBeenCalledWith('user-1', expect.any(AbortSignal));
  });

  it('renders empty activity/audit sections and does not expose private fields', async () => {
    vi.mocked(getAdminUserDetail).mockResolvedValue({
      ...detail,
      account: { ...detail.account, avatarUrl: null },
      activity: { lastMeaningfulActivityAt: null, recent: [] },
      recentAdminAudit: [],
    });
    const { container } = renderPage();
    expect(await screen.findByText('Chưa có hoạt động học')).toBeInTheDocument();
    expect(screen.getByText('Chưa có audit liên quan')).toBeInTheDocument();
    for (const forbidden of [
      'passwordHash', 'tokenHash', 'providerId', 'providerEmail',
      'failedLoginCount', 'lockedUntil', 'beforeJson', 'afterJson', 'ipAddress', 'userAgent',
    ]) {
      expect(container).not.toHaveTextContent(forbidden);
    }
  });

  it('renders authorization/not-found errors and retries a transient error', async () => {
    vi.mocked(getAdminUserDetail)
      .mockRejectedValueOnce(new ApiRequestError('FORBIDDEN', 'internal', 403))
      .mockResolvedValueOnce(detail);
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('không có quyền');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('heading', { name: 'Nguyễn Quản trị' })).toBeInTheDocument();

    vi.mocked(getAdminUserDetail).mockRejectedValueOnce(new ApiRequestError('NOT_FOUND', 'internal', 404));
    const second = renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tìm thấy tài khoản');
    second.unmount();
  });

  it('renders a dedicated expired-session state for unauthorized responses', async () => {
    vi.mocked(getAdminUserDetail).mockRejectedValue(
      new ApiRequestError('UNAUTHENTICATED', 'internal', 401),
    );
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('hết hạn');
  });

  it('aborts the request on unmount without rendering an application error', async () => {
    let signal: AbortSignal | undefined;
    vi.mocked(getAdminUserDetail).mockImplementation((_id, requestSignal) => {
      signal = requestSignal;
      return new Promise(() => undefined);
    });
    const view = renderPage();
    await waitFor(() => expect(signal).toBeDefined());
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('replaces the complete canonical role set after confirmation using the opaque version', async () => {
    currentUserId = 'current-admin';
    const updated: AdminUserDetail = {
      ...detail,
      account: {
        ...detail.account,
        primaryRole: 'teacher' as const,
        roles: ['teacher', 'student'],
        updatedAt: '2026-01-02T00:00:00.654321Z',
      },
    };
    vi.mocked(replaceAdminUserRoles).mockResolvedValue(updated);
    renderPage();
    await screen.findByRole('heading', { name: 'Quản lý quyền và trạng thái' });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Quản trị' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu tập quyền' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('thay thế tập quyền');
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => expect(replaceAdminUserRoles).toHaveBeenCalledWith(
      'user-1',
      {
        expectedUpdatedAt: '2026-01-02T00:00:00.123456Z',
        roles: ['teacher', 'student'],
      },
      expect.any(AbortSignal),
    ));
    expect(await screen.findByText(/Đã cập nhật quyền/)).toBeInTheDocument();
    expect(updateAdminUserStatus).not.toHaveBeenCalled();
  });

  it('shows only valid next statuses, confirms disable and replaces the detail on success', async () => {
    currentUserId = 'current-admin';
    const updated = {
      ...detail,
      account: {
        ...detail.account,
        status: 'disabled' as const,
        updatedAt: '2026-01-02T00:00:00.223456Z',
      },
    };
    vi.mocked(updateAdminUserStatus).mockResolvedValue(updated);
    renderPage();
    await screen.findByRole('button', { name: 'Vô hiệu hóa' });
    expect(screen.queryByRole('button', { name: 'Kích hoạt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /chờ xác thực/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Vô hiệu hóa' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => expect(updateAdminUserStatus).toHaveBeenCalledWith(
      'user-1',
      {
        expectedUpdatedAt: '2026-01-02T00:00:00.123456Z',
        status: 'disabled',
      },
      expect.any(AbortSignal),
    ));
    expect(await screen.findByText(/Đã cập nhật trạng thái/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kích hoạt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chuyển về chờ xác thực' })).toBeInTheDocument();
  });

  it('uses one shared mutation lock and reloads conflicts without replaying', async () => {
    currentUserId = 'current-admin';
    let rejectMutation: ((reason: unknown) => void) | undefined;
    vi.mocked(updateAdminUserStatus).mockImplementation(() => new Promise((_resolve, reject) => {
      rejectMutation = reject;
    }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Vô hiệu hóa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => expect(updateAdminUserStatus).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Đang xử lý…' })).toBeDisabled();
    for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).toBeDisabled();

    rejectMutation?.(new ApiRequestError('USER_UPDATE_CONFLICT', 'conflict', 409));
    expect(await screen.findByRole('alert')).toHaveTextContent('đã thay đổi ở nơi khác');
    await waitFor(() => expect(getAdminUserDetail).toHaveBeenCalledTimes(2));
    expect(updateAdminUserStatus).toHaveBeenCalledTimes(1);
  });

  it('hides all mutation controls for self and deleted users', async () => {
    const self = renderPage();
    await screen.findByRole('heading', { name: 'Nguyễn Quản trị' });
    expect(screen.queryByRole('heading', { name: 'Quản lý quyền và trạng thái' }))
      .not.toBeInTheDocument();
    self.unmount();

    currentUserId = 'current-admin';
    vi.mocked(getAdminUserDetail).mockResolvedValue({
      ...detail,
      account: { ...detail.account, status: 'deleted' },
    });
    renderPage();
    await screen.findByText('Đã xóa (trạng thái DB)');
    expect(screen.queryByRole('heading', { name: 'Quản lý quyền và trạng thái' }))
      .not.toBeInTheDocument();
  });
});

describe('safeAdminUsersReturnLocation', () => {
  it('preserves only the exact Admin user-list path and its query', () => {
    expect(safeAdminUsersReturnLocation({ from: '/admin/users?role=teacher&offset=20' }))
      .toBe('/admin/users?role=teacher&offset=20');
    for (const unsafe of [
      { from: '/admin/users/user-1' },
      { from: '/admin/events' },
      { from: '//evil.example/admin/users' },
      { from: 'https://evil.example/admin/users' },
      null,
    ]) {
      expect(safeAdminUsersReturnLocation(unsafe)).toBe('/admin/users');
    }
  });
});
