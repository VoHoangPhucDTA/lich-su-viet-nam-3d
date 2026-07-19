import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import AdminLayout from '../../layouts/AdminLayout';
import {
  AdminConfirmDialog,
  AdminDataTable,
  AdminFilterSelect,
  AdminPageHeader,
  AdminPagination,
  AdminRowActions,
  AdminSearchInput,
  AdminStatusBadge,
  type AdminDataColumn,
} from '../../components/admin/AdminUI';
import { deleteAdminEvent, getAdminEvents, type AdminEvent } from '../../services/adminApi';

const LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 300;
const inputClass = 'min-h-11 rounded-[var(--admin-radius)] border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text-secondary)] outline-none transition focus:border-[var(--admin-accent)]';

export default function AdminEventsPage() {
  const [items, setItems] = useState<AdminEvent[]>([]);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [status, setStatus] = useState('');
  const [level, setLevel] = useState('');
  const [eventType, setEventType] = useState('');
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deletingEvent, setDeletingEvent] = useState<AdminEvent | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const from = yearFrom.trim() ? Number(yearFrom) : undefined;
      const to = yearTo.trim() ? Number(yearTo) + 1 : undefined;
      const response = await getAdminEvents({
        q: appliedQuery || undefined,
        status: status || undefined,
        eventLevel: level || undefined,
        eventType: eventType || undefined,
        startYearFrom: Number.isFinite(from) ? from : undefined,
        startYearTo: Number.isFinite(to) ? to : undefined,
        limit: LIMIT,
        offset,
      });
      setItems(response.items);
      setTotal(response.total);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải danh sách sự kiện.');
    } finally {
      setLoading(false);
    }
  }, [appliedQuery, eventType, level, offset, status, yearFrom, yearTo]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized === appliedQuery) return;
    const timer = window.setTimeout(() => {
      setOffset(0);
      setAppliedQuery(normalized);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [appliedQuery, query]);

  const changeFilter = (setter: (value: string) => void, value: string) => {
    setOffset(0);
    setter(value);
  };

  const clearFilters = () => {
    setQuery('');
    setAppliedQuery('');
    setStatus('');
    setLevel('');
    setEventType('');
    setYearFrom('');
    setYearTo('');
    setOffset(0);
  };

  const confirmDelete = async () => {
    if (!deletingEvent || deleting) return;
    const event = deletingEvent;
    setDeleting(true);
    setError('');
    try {
      await deleteAdminEvent(event.id);
      setDeletingEvent(null);
      if (items.length === 1 && offset > 0) setOffset(Math.max(0, offset - LIMIT));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể xóa sự kiện.');
    } finally {
      setDeleting(false);
    }
  };

  const hasFilters = Boolean(appliedQuery || status || level || eventType || yearFrom || yearTo);
  const searchPending = query.trim() !== appliedQuery;

  const columns: AdminDataColumn<AdminEvent>[] = [
    {
      key: 'name',
      header: 'Tên sự kiện',
      render: event => <div className="min-w-64"><p className="font-semibold text-[var(--text-primary)]">{event.title}</p><p className="mt-1 truncate text-xs text-[var(--text-muted)]">{event.slug}</p></div>,
    },
    {
      key: 'year',
      header: 'Năm',
      render: event => <span className="whitespace-nowrap text-[var(--text-secondary)]">{event.startYear == null ? 'Không rõ' : `${event.startYear}${event.endYear != null ? `–${event.endYear}` : ''}`}</span>,
    },
    {
      key: 'level',
      header: 'Cấp độ',
      render: event => <span className="text-xs font-medium text-[var(--text-secondary)]">{event.eventLevel}</span>,
    },
    {
      key: 'eventType',
      header: 'Loại sự kiện',
      render: event => <span className="text-xs text-[var(--text-secondary)]">{event.eventType}</span>,
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: event => <AdminStatusBadge status={event.status} label={event.status} />,
    },
    {
      key: 'updatedAt',
      header: 'Cập nhật',
      render: event => <time dateTime={event.updatedAt} className="whitespace-nowrap text-xs text-[var(--text-muted)]">{new Date(event.updatedAt).toLocaleDateString('vi-VN')}</time>,
    },
    {
      key: 'actions',
      header: 'Thao tác',
      width: '116px',
      render: event => <AdminRowActions><Link to={`/admin/events/${event.id}/edit`} className="admin-icon-button" aria-label={`Edit ${event.title}`} title="Edit"><Pencil size={15} aria-hidden="true" /></Link><button type="button" className="admin-icon-button text-[var(--accent)]" aria-label={`Delete ${event.title}`} title="Delete" onClick={() => setDeletingEvent(event)}><Trash2 size={15} aria-hidden="true" /></button></AdminRowActions>,
    },
  ];
  return (
    <AdminLayout title="Sự kiện lịch sử">
      <AdminPageHeader
        title="Sự kiện lịch sử"
        description="Tìm kiếm, lọc và quản lý dữ liệu sự kiện lịch sử."
        actions={<Link to="/admin/events/new" className="admin-primary-button inline-flex items-center gap-2 no-underline"><Plus size={16} aria-hidden="true" />Tạo sự kiện</Link>}
      />

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--admin-shadow)]">
        <div className="space-y-3 border-b border-[var(--border)] p-4 sm:p-5">
          <div className="flex flex-col gap-2 lg:flex-row">
            <AdminSearchInput
              value={query}
              onChange={event => setQuery(event.target.value)}
              onSubmit={() => {
                setOffset(0);
                setAppliedQuery(query.trim());
              }}
              placeholder="Tìm theo tên, slug hoặc tóm tắt..."
            />
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <AdminFilterSelect value={status} onValueChange={value => changeFilter(setStatus, value)} label="Trạng thái" options={[{ value: '', label: 'Trạng thái: Tất cả' }, { value: 'draft', label: 'Bản nháp' }, { value: 'published', label: 'Đã xuất bản' }, { value: 'archived', label: 'Lưu trữ' }]} />
              <AdminFilterSelect value={level} onValueChange={value => changeFilter(setLevel, value)} label="Cấp độ" options={[{ value: '', label: 'Cấp độ: Tất cả' }, { value: 'atomic', label: 'Sự kiện đơn' }, { value: 'collection', label: 'Bộ sưu tập' }]} />
              <AdminFilterSelect value={eventType} onValueChange={value => changeFilter(setEventType, value)} label="Loại sự kiện" options={[{ value: '', label: 'Loại: Tất cả' }, { value: 'political', label: 'Chính trị' }, { value: 'military', label: 'Quân sự' }, { value: 'economic', label: 'Kinh tế' }, { value: 'cultural', label: 'Văn hóa - xã hội' }]} />
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <input value={yearFrom} onChange={event => changeFilter(setYearFrom, event.target.value)} inputMode="numeric" placeholder="Năm từ" aria-label="Năm bắt đầu" className={`${inputClass} w-32`} />
              <span aria-hidden="true" className="text-[var(--text-muted)]">–</span>
              <input value={yearTo} onChange={event => changeFilter(setYearTo, event.target.value)} inputMode="numeric" placeholder="Năm đến" aria-label="Năm kết thúc" className={`${inputClass} w-32`} />
              {searchPending && <span className="text-xs text-[var(--text-muted)]">Đang tìm…</span>}
            </div>
            <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
              <span>{total} sự kiện</span>
              {hasFilters && <button type="button" onClick={clearFilters} className="admin-text-button">Xóa bộ lọc</button>}
            </div>
          </div>
        </div>

        <AdminDataTable
          columns={columns}
          rows={items}
          getKey={event => event.id}
          minWidth="800px"
          loading={loading}
          error={error || undefined}
          onRetry={() => void load()}
          emptyTitle="Không có sự kiện phù hợp"
          emptyDescription="Thử thay đổi từ khóa hoặc bộ lọc để tìm dữ liệu khác."
          footer={<AdminPagination total={total} offset={offset} limit={LIMIT} loading={loading} onChange={setOffset} />}
        />
      </section>
      <AdminConfirmDialog
        open={Boolean(deletingEvent)}
        title="Xóa sự kiện?"
        description={deletingEvent ? `Sự kiện “${deletingEvent.title}” sẽ bị xóa vĩnh viễn.` : undefined}
        confirmLabel="Xóa"
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeletingEvent(null)}
      />
    </AdminLayout>
  );
}
