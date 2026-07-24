import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminDashboardPage from '../AdminDashboardPage';
import { getAdminDashboard, getAdminEvents } from '../../../services/adminApi';

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

vi.mock('../../../components/admin/AdminUI', () => ({
  AdminPageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <header><h1>{title}</h1>{actions}</header>
  ),
  AdminSearchInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} aria-label="search-events" />
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
  AdminStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  AdminRowActions: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AdminDataTable: ({
    columns,
    rows,
    loading,
    error,
    onRetry,
    emptyTitle,
    footer,
  }: {
    columns: Array<{ key: string; render?: (row: { id: string } & Record<string, unknown>) => React.ReactNode }>;
    rows: Array<{ id: string } & Record<string, unknown>>;
    loading: boolean;
    error?: string;
    onRetry?: () => void;
    emptyTitle?: string;
    footer?: React.ReactNode;
  }) => {
    if (loading) return <div role="status">loading events</div>;
    if (error) return <div role="alert">{error}<button onClick={onRetry}>Retry events</button></div>;
    if (!rows.length) return <div>{emptyTitle}{footer}</div>;
    return <div data-testid="event-table">{rows.map(row => (
      <div key={row.id}>{columns.map(column => (
        <div key={column.key}>{column.render ? column.render(row) : null}</div>
      ))}</div>
    ))}{footer}</div>;
  },
}));

vi.mock('../../../services/adminApi', async () => {
  const actual = await vi.importActual<typeof import('../../../services/adminApi')>('../../../services/adminApi');
  return {
    ...actual,
    getAdminDashboard: vi.fn(),
    getAdminEvents: vi.fn(),
  };
});

const dashboard = {
  users: { total: 12, active: 10, pending: 1, disabled: 1, newLast7Days: 3 },
  events: { total: 2, published: 1, draft: 1, archived: 0, atomic: 1, collection: 1, needsContent: 1 },
  recentAudit: [],
};

const eventsPage = {
  items: [{
    id: 'event-unknown-year',
    slug: 'event-unknown-year',
    title: 'Undated event',
    shortTitle: null,
    eventLevel: 'atomic' as const,
    eventType: 'political' as const,
    eventSubtype: null,
    chronology: {
      startYear: null,
      endYear: null,
      effectiveEndYear: null,
      displayDate: null,
      datePrecision: null,
    },
    startYear: null,
    endYear: null,
    status: 'draft' as const,
    grades: [],
    normalizedGeoType: 'no_location',
    canonicalGeoType: 'no_location' as const,
    thumbnail: null,
    activeMediaCount: 0,
    flags: { showOnHomepage: false, showOnTimeline: false, featured: false },
    featured: false,
    cardSummary: null,
    thumbnailUrl: null,
    completeness: { complete: false, issueCount: 1, issues: [] },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }],
  count: 1,
  total: 1,
  limit: 10,
  offset: 0,
};

describe('AdminDashboardPage characterization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAdminDashboard).mockResolvedValue(dashboard);
    vi.mocked(getAdminEvents).mockResolvedValue(eventsPage);
  });

  const renderPage = () => render(
    <MemoryRouter>
      <AdminDashboardPage />
    </MemoryRouter>,
  );

  it('loads metrics and the duplicated event table through separate API requests', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId('stat-Tổng sự kiện')).toBeInTheDocument());
    expect(getAdminDashboard).toHaveBeenCalledTimes(1);
    expect(getAdminEvents).toHaveBeenCalledWith(expect.objectContaining({ limit: 10, offset: 0 }));
    expect(screen.getByText('Undated event')).toBeInTheDocument();
    expect(screen.getByText('Chưa phân kỳ')).toBeInTheDocument();
    expect(screen.queryByText('3 người dùng mới')).not.toBeInTheDocument();
  });

  it('documents that user metrics are returned but not rendered by the current dashboard', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId('stat-Tổng sự kiện')).toBeInTheDocument());
    expect(getAdminDashboard).toHaveBeenCalled();
    expect(screen.queryByText('12')).not.toBeInTheDocument();
    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });

  it('characterizes the current retry defect: a prior event error remains after a successful retry', async () => {
    vi.mocked(getAdminEvents)
      .mockRejectedValueOnce(new Error('temporary event failure'))
      .mockResolvedValueOnce(eventsPage);

    renderPage();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('temporary event failure'));

    fireEvent.click(screen.getByRole('button', { name: 'Retry events' }));
    await waitFor(() => expect(getAdminEvents).toHaveBeenCalledTimes(2));

    expect(screen.getByRole('alert')).toHaveTextContent('temporary event failure');
    expect(screen.queryByText('Undated event')).not.toBeInTheDocument();
  });

  it('characterizes the empty audit state when the API returns no audit rows', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('Chưa có hoạt động quản trị gần đây.')).toBeInTheDocument());
  });

  it('characterizes audit loading as the same message currently used for an empty audit', () => {
    vi.mocked(getAdminDashboard).mockReturnValue(
      new Promise<Awaited<ReturnType<typeof getAdminDashboard>>>(() => undefined),
    );

    renderPage();

    expect(screen.getByText('Chưa có hoạt động quản trị gần đây.')).toBeInTheDocument();
  });
});
