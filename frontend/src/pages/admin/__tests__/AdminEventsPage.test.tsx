import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminEventsPage from '../AdminEventsPage';
import { deleteAdminEvent, getAdminEvents } from '../../../services/adminApi';

vi.mock('../../../layouts/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../../components/admin/AdminUI', () => ({
  AdminPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
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
    return <div>{rows.map(row => (
      <article key={row.id}>{columns.map(column => (
        <div key={column.key}>{column.render ? column.render(row) : null}</div>
      ))}</article>
    ))}{footer}</div>;
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
    <nav><span>{total}</span><button onClick={() => onChange(offset + limit)}>Next page</button></nav>
  ),
}));

vi.mock('../../../services/adminApi', async () => {
  const actual = await vi.importActual<typeof import('../../../services/adminApi')>('../../../services/adminApi');
  return {
    ...actual,
    getAdminEvents: vi.fn(),
    deleteAdminEvent: vi.fn(),
  };
});

const page = {
  items: [{
    id: 'event-1',
    slug: 'event-1',
    title: 'Bach Dang',
    eventLevel: 'atomic' as const,
    eventType: 'military' as const,
    startYear: null,
    endYear: null,
    status: 'draft' as const,
    featured: false,
    cardSummary: 'Summary',
    thumbnailUrl: null,
    updatedAt: '2026-01-01T00:00:00Z',
  }],
  count: 1,
  total: 21,
  limit: 20,
  offset: 0,
};

describe('AdminEventsPage characterization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAdminEvents).mockResolvedValue(page);
    vi.mocked(deleteAdminEvent).mockResolvedValue({ id: 'event-1' });
  });

  const renderPage = () => render(
    <MemoryRouter>
      <AdminEventsPage />
    </MemoryRouter>,
  );

  it('renders loading, successful data and unknown chronology', async () => {
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('loading events');
    await waitFor(() => expect(screen.getByText('Bach Dang')).toBeInTheDocument());
    expect(screen.getByText('Không rõ')).toBeInTheDocument();
    expect(getAdminEvents).toHaveBeenCalledWith(expect.objectContaining({ limit: 20, offset: 0 }));
  });

  it('passes filter changes and server pagination to the API', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Bach Dang')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Loại sự kiện'), { target: { value: 'military' } });
    await waitFor(() => expect(getAdminEvents).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'military',
      offset: 0,
    })));

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(getAdminEvents).toHaveBeenCalledWith(expect.objectContaining({ offset: 20 })));
  });

  it('renders error and retries the request', async () => {
    vi.mocked(getAdminEvents)
      .mockRejectedValueOnce(new Error('events unavailable'))
      .mockResolvedValueOnce(page);

    renderPage();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('events unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Retry events' }));
    await waitFor(() => expect(screen.getByText('Bach Dang')).toBeInTheDocument());
    expect(getAdminEvents).toHaveBeenCalledTimes(2);
  });

  it('characterizes current delete confirmation and mutation feedback path', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Bach Dang')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Delete Bach Dang' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Xóa sự kiện?');
    fireEvent.click(screen.getByRole('button', { name: 'Xóa' }));

    await waitFor(() => expect(deleteAdminEvent).toHaveBeenCalledWith('event-1'));
  });
});
