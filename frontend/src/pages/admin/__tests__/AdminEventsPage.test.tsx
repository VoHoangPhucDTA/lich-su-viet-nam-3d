import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminEventsPage from '../AdminEventsPage';
import { getAdminEvents, type AdminEvent } from '../../../services/adminApi';
import { ApiRequestError } from '../../../services/apiClient';

vi.mock('../../../layouts/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../../components/admin/AdminUI', () => ({
  AdminTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AdminPageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => <><h1>{title}</h1>{actions}</>,
  AdminSearchInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} aria-label="event-search" />
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
  AdminStatusBadge: ({ label, status }: { label?: string; status: string }) => <span>{label ?? status}</span>,
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
    columns: Array<{ key: string; render: (row: AdminEvent) => React.ReactNode }>;
    rows: AdminEvent[];
    loading: boolean;
    error?: string;
    onRetry?: () => void;
    emptyTitle?: string;
    footer?: React.ReactNode;
  }) => {
    if (loading) return <div role="status">loading events</div>;
    if (error) return <div role="alert">{error}<button onClick={onRetry}>Retry events</button></div>;
    if (!rows.length) return <div>{emptyTitle}{footer}</div>;
    return <div>{rows.map(row => (
      <article key={row.id}>{columns.map(column => <div key={column.key}>{column.render(row)}</div>)}</article>
    ))}{footer}</div>;
  },
  AdminPagination: ({ total, offset, limit, onChange }: { total: number; offset: number; limit: number; loading: boolean; onChange: (offset: number) => void }) => (
    <nav><span>{total}</span><button onClick={() => onChange(offset + limit)}>Next page</button></nav>
  ),
}));

vi.mock('../../../services/adminApi', async () => {
  const actual = await vi.importActual<typeof import('../../../services/adminApi')>('../../../services/adminApi');
  return { ...actual, getAdminEvents: vi.fn() };
});

vi.mock('../../../components/admin/AdminEventPublicationActions', () => ({
  default: ({
    status,
    onUpdated,
  }: {
    status: AdminEvent['status'];
    onUpdated: (detail: {
      publication: { status: AdminEvent['status']; updatedAt: string };
      completeness: AdminEvent['completeness'];
    }) => void;
  }) => (
    <button type="button" onClick={() => onUpdated({
      publication: { status: 'published', updatedAt: '2026-01-03T00:00:00.000001Z' },
      completeness: item.completeness,
    })}>
      {status === 'draft' ? 'Xuất bản row' : 'Đổi trạng thái row'}
    </button>
  ),
}));

const item: AdminEvent = {
  id: 'event-1',
  slug: 'event-1',
  title: 'Bạch Đằng',
  shortTitle: null,
  eventLevel: 'atomic',
  eventType: 'military',
  eventSubtype: null,
  chronology: {
    startYear: null,
    endYear: null,
    effectiveEndYear: null,
    displayDate: null,
    datePrecision: null,
  },
  cardSummary: 'Tóm tắt',
  status: 'draft',
  grades: [],
  normalizedGeoType: 'single_point',
  canonicalGeoType: 'point',
  thumbnail: null,
  activeMediaCount: 0,
  flags: { showOnHomepage: false, showOnTimeline: false, featured: false },
  completeness: {
    complete: false,
    issueCount: 2,
    issues: [
      { code: 'MISSING_THUMBNAIL', section: 'media', severity: 'WARNING', fields: ['thumbnail'] },
      { code: 'MISSING_GRADES', section: 'classification', severity: 'WARNING', fields: ['grades'] },
    ],
  },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
};

const page = { items: [item], count: 1, total: 21, limit: 20, offset: 0 };

describe('AdminEventsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAdminEvents).mockResolvedValue(page);
  });

  function DestinationProbe() {
    const location = useLocation();
    return <p data-testid="event-return">{(location.state as { from?: string } | null)?.from}</p>;
  }

  const renderPage = (initialEntry = '/admin/events') => render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/admin/events" element={<AdminEventsPage />} />
        <Route path="/admin/events/new" element={<DestinationProbe />} />
        <Route path="/admin/events/:id" element={<DestinationProbe />} />
        <Route path="/admin/events/:id/edit" element={<DestinationProbe />} />
      </Routes>
    </MemoryRouter>,
  );

  it('renders loading, typed data, unknown chronology and completeness', async () => {
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('loading events');
    await waitFor(() => expect(screen.getByText('Bạch Đằng')).toBeInTheDocument());
    expect(screen.getAllByText('Không rõ')).toHaveLength(2);
    expect(screen.getByText('2 vấn đề')).toBeInTheDocument();
    expect(getAdminEvents).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20, offset: 0, sortBy: 'updatedAt', sortDir: 'desc' }),
      expect.any(AbortSignal),
    );
  });

  it('hydrates URL filters and sends server pagination with an exclusive year upper bound', async () => {
    renderPage('/admin/events?eventType=military&yearFrom=938&yearTo=939&offset=20');
    await waitFor(() => expect(screen.getByText('Bạch Đằng')).toBeInTheDocument());
    expect(getAdminEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'military',
        startYearFrom: 938,
        startYearTo: 940,
        offset: 20,
      }),
      expect.any(AbortSignal),
    );

    fireEvent.change(screen.getByLabelText('Loại'), { target: { value: 'political' } });
    await waitFor(() => expect(getAdminEvents).toHaveBeenLastCalledWith(
      expect.objectContaining({ eventType: 'political', offset: 0 }),
      expect.any(AbortSignal),
    ));
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(getAdminEvents).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 20 }),
      expect.any(AbortSignal),
    ));
  });

  it('renders empty state', async () => {
    vi.mocked(getAdminEvents).mockResolvedValue({ ...page, items: [], count: 0, total: 0 });
    renderPage();
    expect(await screen.findByText('Không có sự kiện phù hợp')).toBeInTheDocument();
  });

  it('renders error and retries the request', async () => {
    vi.mocked(getAdminEvents)
      .mockRejectedValueOnce(new Error('events unavailable'))
      .mockResolvedValueOnce(page);
    renderPage();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('events unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Retry events' }));
    await waitFor(() => expect(screen.getByText('Bạch Đằng')).toBeInTheDocument());
    expect(getAdminEvents).toHaveBeenCalledTimes(2);
  });

  it('renders an authorization state for forbidden API responses', async () => {
    vi.mocked(getAdminEvents).mockRejectedValue(new ApiRequestError('FORBIDDEN', 'internal', 403));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('không có quyền');
  });

  it('aborts the stale request after a URL filter changes', async () => {
    const pending = new Promise<never>(() => undefined);
    vi.mocked(getAdminEvents).mockReturnValue(pending);
    renderPage();
    await waitFor(() => expect(getAdminEvents).toHaveBeenCalledTimes(1));
    const firstSignal = vi.mocked(getAdminEvents).mock.calls[0][1]!;
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'published' } });
    await waitFor(() => expect(getAdminEvents).toHaveBeenCalledTimes(2));
    expect(firstSignal.aborted).toBe(true);
  });

  it('exposes create, view and edit routes while keeping typed publication actions', async () => {
    renderPage('/admin/events?status=draft');
    await screen.findByText('Bạch Đằng');
    expect(screen.getByRole('link', { name: 'Bạch Đằng' })).toHaveAttribute('href', '/admin/events/event-1');
    expect(screen.getByRole('link', { name: 'Tạo sự kiện' })).toHaveAttribute('href', '/admin/events/new');
    expect(screen.getByRole('link', { name: 'Xem Bạch Đằng' })).toHaveAttribute('href', '/admin/events/event-1');
    expect(screen.getByRole('link', { name: 'Chỉnh sửa Bạch Đằng' })).toHaveAttribute('href', '/admin/events/event-1/edit');
    expect(screen.getByRole('button', { name: 'Xuất bản row' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Hard delete vẫn bị khóa');
    expect(screen.queryByRole('button', { name: /xóa sự kiện/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Chỉnh sửa Bạch Đằng' }));
    expect(screen.getByTestId('event-return')).toHaveTextContent('/admin/events?status=draft');
  });

  it('shows the active-filter count and clears filters without dropping sort', async () => {
    renderPage('/admin/events?status=draft&grade=10&sort=title%3Aasc');
    await screen.findByText('Bạch Đằng');
    expect(screen.getByText('2 bộ lọc đang dùng')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
    await waitFor(() => expect(getAdminEvents).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: undefined, grade: undefined, sortBy: 'title', sortDir: 'asc' }),
      expect.any(AbortSignal),
    ));
  });

  it('refetches the URL-filtered page after publication succeeds', async () => {
    renderPage('/admin/events?status=draft');
    await screen.findByText('Bạch Đằng');
    fireEvent.click(screen.getByRole('button', { name: 'Xuất bản row' }));
    await waitFor(() => expect(getAdminEvents).toHaveBeenCalledTimes(2));
    expect(getAdminEvents).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'draft', offset: 0 }),
      expect.any(AbortSignal),
    );
  });

  it('moves an empty out-of-range page to the nearest previous page', async () => {
    vi.mocked(getAdminEvents)
      .mockResolvedValueOnce({ ...page, items: [], count: 0, total: 21, offset: 40 })
      .mockResolvedValueOnce({ ...page, total: 21, offset: 20 });
    renderPage('/admin/events?status=draft&offset=40');

    await waitFor(() => expect(getAdminEvents).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'draft', offset: 20 }),
      expect.any(AbortSignal),
    ));
  });
});
