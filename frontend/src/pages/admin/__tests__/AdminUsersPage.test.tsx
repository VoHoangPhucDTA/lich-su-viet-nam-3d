import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminUsersPage from '../AdminUsersPage';
import { getAdminUsers, type AdminUserListItem } from '../../../services/adminApi';
import { ApiRequestError } from '../../../services/apiClient';

vi.mock('../../../layouts/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../../services/adminApi', async () => {
  const actual = await vi.importActual<typeof import('../../../services/adminApi')>('../../../services/adminApi');
  return { ...actual, getAdminUsers: vi.fn() };
});

const users: AdminUserListItem[] = [
  {
    id: 'user-1',
    displayName: 'Nguyễn Quản trị',
    email: 'admin@example.test',
    primaryRole: 'admin',
    roles: ['admin', 'teacher', 'student'],
    status: 'active',
    emailVerified: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    lastMeaningfulActivityAt: '2026-01-03T00:00:00Z',
  },
  {
    id: 'user-2',
    displayName: null,
    email: 'teacher@example.test',
    primaryRole: 'teacher',
    roles: ['teacher'],
    status: 'deleted',
    emailVerified: false,
    createdAt: '2026-01-04T00:00:00Z',
    updatedAt: '2026-01-04T00:00:00Z',
    lastMeaningfulActivityAt: null,
  },
  {
    id: 'user-3',
    displayName: 'Không có quyền',
    email: 'none@example.test',
    primaryRole: null,
    roles: [],
    status: 'pending',
    emailVerified: false,
    createdAt: '2026-01-05T00:00:00Z',
    updatedAt: '2026-01-05T00:00:00Z',
    lastMeaningfulActivityAt: null,
  },
];

const page = {
  items: users,
  count: users.length,
  total: users.length,
  limit: 20,
  offset: 0,
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderPage(initialEntry = '/admin/users') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/admin/users" element={<><AdminUsersPage /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminUsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAdminUsers).mockResolvedValue(page);
  });

  it('renders loading, complete role/status data and a read-only detail link', async () => {
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải dữ liệu');

    expect(await screen.findByText('Nguyễn Quản trị')).toBeInTheDocument();
    expect(screen.getAllByText('Giáo viên').length).toBeGreaterThan(0);
    expect(screen.getByText('Chưa có quyền')).toBeInTheDocument();
    expect(screen.getByText('Đã xóa (trạng thái DB)')).toBeInTheDocument();
    expect(screen.getAllByText('Chưa có hoạt động').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Nguyễn Quản trị' }))
      .toHaveAttribute('href', '/admin/users/user-1');
    expect(screen.queryByRole('button', { name: /sửa|xóa|khóa/i })).not.toBeInTheDocument();
    expect(getAdminUsers).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'createdAt', sortDir: 'desc', limit: 20, offset: 0 }),
      expect.any(AbortSignal),
    );
  });

  it('drives filters, sort and pagination from the URL contract', async () => {
    vi.mocked(getAdminUsers).mockResolvedValue({ ...page, total: 45 });
    renderPage('/admin/users?q=Lan&role=teacher&status=active&verified=true&sortBy=email&sortDir=asc&limit=20');

    await waitFor(() => expect(getAdminUsers).toHaveBeenCalledWith(
      {
        q: 'Lan',
        role: 'teacher',
        status: 'active',
        verified: 'true',
        sortBy: 'email',
        sortDir: 'asc',
        limit: 20,
        offset: 0,
      },
      expect.any(AbortSignal),
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Trang 2' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('offset=20'));
    await waitFor(() => expect(getAdminUsers).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 20 }),
      expect.any(AbortSignal),
    ));
  });

  it('writes debounced search to the URL and cancels the stale request', async () => {
    let firstSignal: AbortSignal | undefined;
    vi.mocked(getAdminUsers)
      .mockImplementationOnce((_params, signal) => {
        firstSignal = signal;
        return new Promise(() => undefined);
      })
      .mockResolvedValue(page);
    renderPage();
    await waitFor(() => expect(getAdminUsers).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByPlaceholderText('Tìm theo tên hoặc email...'), {
      target: { value: '  An  ' },
    });

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('q=An'), { timeout: 1000 });
    await waitFor(() => expect(getAdminUsers).toHaveBeenCalledTimes(2));
    expect(firstSignal?.aborted).toBe(true);
    expect(await screen.findByText('Nguyễn Quản trị')).toBeInTheDocument();
  });

  it('renders empty, forbidden and retry states without treating AbortError as an error', async () => {
    vi.mocked(getAdminUsers).mockResolvedValueOnce({ ...page, items: [], count: 0, total: 0 });
    const first = renderPage();
    expect(await screen.findByText('Không tìm thấy tài khoản')).toBeInTheDocument();
    first.unmount();

    vi.mocked(getAdminUsers)
      .mockRejectedValueOnce(new ApiRequestError('FORBIDDEN', 'internal detail', 403))
      .mockResolvedValueOnce(page);
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('không có quyền');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Nguyễn Quản trị')).toBeInTheDocument();
  });

  it('corrects an out-of-range offset to the nearest valid server page', async () => {
    vi.mocked(getAdminUsers)
      .mockResolvedValueOnce({ items: [], count: 0, total: 21, limit: 20, offset: 80 })
      .mockResolvedValueOnce({ ...page, total: 21, offset: 20 });
    renderPage('/admin/users?offset=80');

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('offset=20'));
    await waitFor(() => expect(getAdminUsers).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 20 }),
      expect.any(AbortSignal),
    ));
  });
});
