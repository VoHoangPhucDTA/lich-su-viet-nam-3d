import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminUsersPage from '../AdminUsersPage';
import { deleteAdminUser, getAdminUsers, setAdminUserStatus } from '../../../services/adminApi';

vi.mock('../../../layouts/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../../components/admin/AdminUI', () => ({
  AdminPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  AdminSearchInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} aria-label="user-search" />
  ),
  AdminFilterSelect: ({
    value,
    onValueChange,
    label,
    options,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    label: string;
    options: Array<{ value: string; label: string }>;
  }) => (
    <label>{label}<select value={value} onChange={event => onValueChange(event.target.value)}>
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select></label>
  ),
  AdminStatusBadge: ({ status }: { status: string }) => <span data-testid={`status-${status}`}>{status}</span>,
  AdminRowActions: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AdminDataTable: ({
    columns,
    rows,
    loading,
    error,
    onRetry,
    emptyTitle,
  }: {
    columns: Array<{ key: string; render?: (row: { id: string } & Record<string, unknown>) => React.ReactNode }>;
    rows: Array<{ id: string } & Record<string, unknown>>;
    loading: boolean;
    error?: string;
    onRetry?: () => void;
    emptyTitle?: string;
  }) => {
    if (loading) return <div role="status">loading users</div>;
    if (error) return <div role="alert">{error}<button onClick={onRetry}>Retry users</button></div>;
    if (!rows.length) return <div>{emptyTitle}</div>;
    return <div>{rows.map(row => (
      <article key={row.id}>{columns.map(column => (
        <div key={column.key}>{column.render ? column.render(row) : null}</div>
      ))}</article>
    ))}</div>;
  },
  AdminConfirmDialog: ({
    open,
    title,
    description,
    confirmLabel,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    title: string;
    description?: string;
    confirmLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) => open ? <div role="dialog"><h2>{title}</h2><p>{description}</p><button onClick={onCancel}>Cancel</button><button onClick={onConfirm}>{confirmLabel}</button></div> : null,
  AdminPagination: ({ total, offset, limit, onChange }: { total: number; offset: number; limit: number; loading: boolean; onChange: (offset: number) => void }) => (
    <nav><span>{total}</span><button onClick={() => onChange(offset + limit)}>Next page</button>
    </nav>
  ),
}));

vi.mock('../../../services/adminApi', async () => {
  const actual = await vi.importActual<typeof import('../../../services/adminApi')>('../../../services/adminApi');
  return {
    ...actual,
    getAdminUsers: vi.fn(),
    setAdminUserStatus: vi.fn(),
    deleteAdminUser: vi.fn(),
  };
});

const page = {
  items: [{
    id: 'user-1',
    fullName: 'Nguyen Admin',
    email: 'admin@example.test',
    grade: 'other' as unknown as number,
    school: 'Demo school',
    avatarUrl: null,
    status: 'active' as const,
    role: 'admin' as const,
    createdAt: '2026-01-01T00:00:00Z',
    lastActivity: null,
  }],
  count: 1,
  total: 1,
  limit: 20,
  offset: 0,
};

describe('AdminUsersPage characterization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAdminUsers).mockResolvedValue(page);
    vi.mocked(setAdminUserStatus).mockResolvedValue({ id: 'user-1', status: 'disabled' });
    vi.mocked(deleteAdminUser).mockResolvedValue({ id: 'user-1' });
  });

  it('renders loading, status/role and empty activity state', async () => {
    render(<AdminUsersPage />);
    expect(screen.getByRole('status')).toHaveTextContent('loading users');
    await waitFor(() => expect(screen.getByText('Nguyen Admin')).toBeInTheDocument());
    expect(screen.getByTestId('status-active')).toBeInTheDocument();
    expect(screen.getByTestId('status-admin')).toBeInTheDocument();
    expect(screen.getByText('Chưa có hoạt động')).toBeInTheDocument();
  });

  it('confirms the current status mutation path', async () => {
    render(<AdminUsersPage />);
    await waitFor(() => expect(screen.getByText('Nguyen Admin')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Sửa Nguyen Admin' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Xác nhận thay đổi');
    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật' }));

    await waitFor(() => expect(setAdminUserStatus).toHaveBeenCalledWith('user-1', 'disabled'));
  });

  it('confirms the current delete/disable path and handles API errors', async () => {
    vi.mocked(deleteAdminUser).mockRejectedValueOnce(new Error('cannot disable'));
    render(<AdminUsersPage />);
    await waitFor(() => expect(screen.getByText('Nguyen Admin')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Xóa Nguyen Admin' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('sẽ bị vô hiệu hóa');
    fireEvent.click(screen.getByRole('button', { name: 'Xóa' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('cannot disable'));
  });

  it('renders empty state from an empty server page', async () => {
    vi.mocked(getAdminUsers).mockResolvedValue({ ...page, items: [], count: 0, total: 0 });
    render(<AdminUsersPage />);
    await waitFor(() => expect(screen.getByText('Không tìm thấy tài khoản')).toBeInTheDocument());
  });
});
