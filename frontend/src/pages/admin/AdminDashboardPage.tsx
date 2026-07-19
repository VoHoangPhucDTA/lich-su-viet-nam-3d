import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FilePenLine,
  Layers3,
  Pencil,
  Plus,
} from 'lucide-react';
import AdminLayout from '../../layouts/AdminLayout';
import AdminStatsCard from '../../components/admin/AdminStatsCard';
import {
  AdminDataTable,
  AdminFilterSelect,
  AdminPageHeader,
  AdminRowActions,
  AdminSearchInput,
  AdminStatusBadge,
  type AdminDataColumn,
} from '../../components/admin/AdminUI';
import { HISTORICAL_PERIODS, getPeriodQueryRange } from '../../data/historicalPeriods';
import {
  getAdminDashboard,
  getAdminEvents,
  type AdminDashboard,
  type AdminEvent,
} from '../../services/adminApi';

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;
const inputClass = 'min-h-11 rounded-[var(--admin-radius)] border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text-secondary)] outline-none transition focus:border-[var(--admin-accent)]';

function getEventPeriod(year: number) {
  return HISTORICAL_PERIODS.find(period => (
    (period.startYearInclusive == null || year >= period.startYearInclusive)
    && (period.endYearExclusive == null || year < period.endYearExclusive)
  ));
}

function formatAuditAction(action: string) {
  return action.replace('event.', 'Sự kiện: ').replace('user.', 'Người dùng: ').replaceAll('_', ' ');
}
function getPageItems(currentPage: number, pageCount: number): Array<number | 'ellipsis-start' | 'ellipsis-end'> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  if (currentPage <= 4) return [1, 2, 3, 4, 5, 'ellipsis-end', pageCount];
  if (currentPage >= pageCount - 3) return [1, 'ellipsis-start', pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount];
  return [1, 'ellipsis-start', currentPage - 1, currentPage, currentPage + 1, 'ellipsis-end', pageCount];
}

function DashboardPagination({ total, offset, loading, onChange }: { total: number; offset: number; loading: boolean; onChange: (offset: number) => void }) {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(pageCount, Math.floor(offset / PAGE_SIZE) + 1);
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);
  const pageItems = getPageItems(currentPage, pageCount);
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--text-muted)] sm:px-5"><span>Hiển thị {from}–{to} trong {total} sự kiện</span><nav aria-label="Phân trang sự kiện" className="flex items-center gap-1"><button type="button" className="admin-icon-button" aria-label="Trang trước" disabled={currentPage === 1 || loading} onClick={() => onChange(Math.max(0, offset - PAGE_SIZE))}><ChevronLeft size={15} aria-hidden="true" /></button>{pageItems.map((item, index) => typeof item === 'number' ? <button key={item} type="button" aria-label={`Trang ${item}`} aria-current={item === currentPage ? 'page' : undefined} disabled={loading} onClick={() => onChange((item - 1) * PAGE_SIZE)} className="inline-flex h-9 min-w-9 items-center justify-center rounded-[var(--admin-radius)] border px-2 text-xs font-semibold transition" style={{ borderColor: item === currentPage ? 'var(--accent)' : 'transparent', background: item === currentPage ? 'var(--accent)' : 'transparent', color: item === currentPage ? '#fff' : 'var(--text-secondary)' }}>{item}</button> : <span key={`${item}-${index}`} className="inline-flex h-9 min-w-7 items-center justify-center" aria-hidden="true">…</span>)}<button type="button" className="admin-icon-button" aria-label="Trang sau" disabled={currentPage === pageCount || loading} onClick={() => onChange(offset + PAGE_SIZE)}><ChevronRight size={15} aria-hidden="true" /></button></nav><span className="hidden sm:inline">{PAGE_SIZE} / trang</span></div>;
}
export default function AdminDashboardPage() {
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [items, setItems] = useState<AdminEvent[]>([]);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [period, setPeriod] = useState('');
  const [status, setStatus] = useState('');
  const [level, setLevel] = useState('');
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [summaryError, setSummaryError] = useState('');
  const [eventsError, setEventsError] = useState('');
  const [eventsLoading, setEventsLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    try {
      setSummaryError('');
      setDashboard(await getAdminDashboard());
    } catch (cause) {
      setSummaryError(cause instanceof Error ? cause.message : 'Không thể tải dữ liệu tổng quan.');
    }
  }, []);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const periodRange = getPeriodQueryRange(period);
      const manualFrom = yearFrom.trim() ? Number(yearFrom) : undefined;
      const manualTo = yearTo.trim() ? Number(yearTo) + 1 : undefined;
      const startYearFrom = Math.max(
        periodRange?.startYearFrom ?? Number.NEGATIVE_INFINITY,
        Number.isFinite(manualFrom) ? manualFrom! : Number.NEGATIVE_INFINITY,
      );
      const startYearTo = Math.min(
        periodRange?.startYearTo ?? Number.POSITIVE_INFINITY,
        Number.isFinite(manualTo) ? manualTo! : Number.POSITIVE_INFINITY,
      );

      if (startYearFrom >= startYearTo) {
        setItems([]);
        setTotal(0);
        return;
      }

      const response = await getAdminEvents({
        q: appliedQuery || undefined,
        status: status || undefined,
        eventLevel: level || undefined,
        startYearFrom: Number.isFinite(startYearFrom) ? startYearFrom : undefined,
        startYearTo: Number.isFinite(startYearTo) ? startYearTo : undefined,
        limit: PAGE_SIZE,
        offset,
      });
      setItems(response.items);
      setTotal(response.total);
    } catch (cause) {
      setEventsError(cause instanceof Error ? cause.message : 'Không thể tải danh sách sự kiện.');
    } finally {
      setEventsLoading(false);
    }
  }, [appliedQuery, level, offset, period, status, yearFrom, yearTo]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDashboard(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard]);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadEvents(), 0);
    return () => window.clearTimeout(timer);
  }, [loadEvents]);
  useEffect(() => {
    const normalized = query.trim();
    if (normalized === appliedQuery) return;
    const timer = window.setTimeout(() => { setOffset(0); setAppliedQuery(normalized); }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [appliedQuery, query]);
  const changeFilter = (setter: (value: string) => void, value: string) => { setOffset(0); setter(value); };
  const clearFilters = () => { setQuery(''); setAppliedQuery(''); setPeriod(''); setStatus(''); setLevel(''); setYearFrom(''); setYearTo(''); setOffset(0); };
  const hasFilters = Boolean(appliedQuery || period || status || level || yearFrom || yearTo);
  const searchPending = query.trim() !== appliedQuery;

  const columns: AdminDataColumn<AdminEvent>[] = [
    {
      key: 'name',
      header: 'T\u00ean s\u1ef1 ki\u1ec7n',
      render: event => <div className="flex min-w-72 items-center gap-3">{event.thumbnailUrl && <img src={event.thumbnailUrl} alt="" loading="lazy" className="h-12 w-20 shrink-0 rounded-md object-cover" />}<div className="min-w-0"><p className="line-clamp-1 font-semibold text-[var(--text-primary)]">{event.title}</p><p className="mt-1 line-clamp-1 text-xs text-[var(--text-muted)]">{event.cardSummary || event.slug}</p></div></div>,
    },
    {
      key: 'period',
      header: 'Th\u1eddi k\u1ef3',
      render: event => <span className="text-xs text-[var(--text-secondary)]">{event.startYear == null ? 'Chưa phân kỳ' : getEventPeriod(event.startYear)?.shortLabel ?? 'Chưa phân kỳ'}</span>,
    },
    {
      key: 'level',
      header: 'C\u1ea5p \u0111\u1ed9',
      render: event => <span className="text-xs font-medium text-[var(--text-secondary)]">{event.eventLevel}</span>,
    },
    {
      key: 'eventType',
      header: 'Lo\u1ea1i s\u1ef1 ki\u1ec7n',
      render: event => <span className="text-xs text-[var(--text-secondary)]">{event.eventType}</span>,
    },
    {
      key: 'year',
      header: 'N\u0103m',
      render: event => <span className="whitespace-nowrap text-[var(--text-secondary)]">{event.startYear}{event.endYear ? `\u2013${event.endYear}` : ''}</span>,
    },
    { key: 'status', header: 'Tr\u1ea1ng th\u00e1i', render: event => <AdminStatusBadge status={event.status} label={event.status} /> },
    { key: 'updatedAt', header: 'C\u1eadp nh\u1eadt', render: event => <time dateTime={event.updatedAt} className="whitespace-nowrap text-xs text-[var(--text-muted)]">{new Date(event.updatedAt).toLocaleDateString('vi-VN')}</time> },
    { key: 'actions', header: 'Thao t\u00e1c', width: '88px', render: event => <AdminRowActions><Link to={`/admin/events/${event.id}/edit`} className="admin-icon-button" aria-label={`S\u1eeda s\u1ef1 ki\u1ec7n ${event.title}`} title="S\u1eeda s\u1ef1 ki\u1ec7n"><Pencil size={15} aria-hidden="true" /></Link></AdminRowActions> },
  ];  const tableToolbar = <div className="space-y-3"><div className="grid gap-2 lg:grid-cols-[minmax(18rem,1fr)_repeat(3,minmax(9rem,auto))]"><AdminSearchInput value={query} onChange={event => setQuery(event.target.value)} onSubmit={() => { setOffset(0); setAppliedQuery(query.trim()); }} placeholder="Tìm kiếm sự kiện..." /><AdminFilterSelect value={period} onValueChange={value => changeFilter(setPeriod, value)} label="Thời kỳ" options={[{ value: '', label: 'Thời kỳ: Tất cả' }, ...HISTORICAL_PERIODS.map(item => ({ value: item.id, label: item.shortLabel }))]} /><AdminFilterSelect value={status} onValueChange={value => changeFilter(setStatus, value)} label="Trạng thái" options={[{ value: '', label: 'Trạng thái: Tất cả' }, { value: 'published', label: 'published' }, { value: 'draft', label: 'draft' }, { value: 'archived', label: 'archived' }]} /><AdminFilterSelect value={level} onValueChange={value => changeFilter(setLevel, value)} label="Cấp độ" options={[{ value: '', label: 'Cấp độ: Tất cả' }, { value: 'atomic', label: 'atomic' }, { value: 'collection', label: 'collection' }]} /></div><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-wrap items-center gap-2"><input value={yearFrom} onChange={event => changeFilter(setYearFrom, event.target.value)} inputMode="numeric" placeholder="Năm từ" aria-label="Năm bắt đầu" className={`${inputClass} w-32`} /><span aria-hidden="true" className="text-[var(--text-muted)]">–</span><input value={yearTo} onChange={event => changeFilter(setYearTo, event.target.value)} inputMode="numeric" placeholder="Năm đến" aria-label="Năm kết thúc" className={`${inputClass} w-32`} />{searchPending && <span className="text-xs text-[var(--text-muted)]">Đang tìm…</span>}</div><div className="flex items-center gap-3 text-xs text-[var(--text-muted)]"><span>{total} sự kiện</span>{hasFilters && <button type="button" onClick={clearFilters} className="admin-text-button">Xóa bộ lọc</button>}</div></div></div>;  return (
    <AdminLayout title="Tổng quan">
      <AdminPageHeader title="Quản trị sự kiện lịch sử" description="Quản lý, rà soát và xuất bản các sự kiện lịch sử trên hệ thống." actions={<Link to="/admin/events/new" className="admin-primary-button inline-flex items-center gap-2 no-underline"><Plus size={16} aria-hidden="true" />Tạo sự kiện</Link>} />
      {summaryError && <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--accent)]"><span>{summaryError}</span><button type="button" onClick={() => void loadDashboard()} className="admin-text-button">Thử lại</button></div>}
      {dashboard && <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStatsCard icon={<CalendarDays size={18} aria-hidden="true" />} label="Tổng sự kiện" value={dashboard.events.total} sub={`${dashboard.events.atomic} sự kiện đơn · ${dashboard.events.collection} bộ sưu tập`} color="var(--accent)" />
        <AdminStatsCard icon={<BadgeCheck size={18} aria-hidden="true" />} label="Đã xuất bản" value={dashboard.events.published} sub={`${dashboard.events.total ? Math.round((dashboard.events.published / dashboard.events.total) * 100) : 0}% tổng số sự kiện`} color="var(--success)" />
        <AdminStatsCard icon={<FilePenLine size={18} aria-hidden="true" />} label="Bản nháp" value={dashboard.events.draft} sub={`${dashboard.events.needsContent} sự kiện cần bổ sung nội dung`} color="var(--warning)" />
        <AdminStatsCard icon={<Layers3 size={18} aria-hidden="true" />} label="Bộ sưu tập" value={dashboard.events.collection} sub="Nhóm nội dung lịch sử theo chủ đề" color="var(--admin-accent)" />
      </div>}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <section className="min-w-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--admin-shadow)]"><div className="border-b border-[var(--border)] p-4 sm:p-5">{tableToolbar}</div><AdminDataTable columns={columns} rows={items} getKey={event => event.id} minWidth="1080px" loading={eventsLoading} error={eventsError || undefined} onRetry={() => void loadEvents()} emptyTitle="Không có sự kiện phù hợp" emptyDescription="Thử thay đổi từ khóa hoặc bộ lọc để tìm dữ liệu khác." footer={<DashboardPagination total={total} offset={offset} loading={eventsLoading} onChange={setOffset} />} /></section>
        <aside><section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--admin-shadow)]"><div className="border-b border-[var(--border)] px-5 py-4"><h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--admin-accent)]">Hoạt động gần đây</h2></div>{!dashboard || dashboard.recentAudit.length === 0 ? <p className="px-5 py-6 text-xs leading-5 text-[var(--text-muted)]">Chưa có hoạt động quản trị gần đây.</p> : <div className="divide-y divide-[var(--border)]">{dashboard.recentAudit.slice(0, 4).map((item, index) => <article key={`${item.createdAt}-${index}`} className="px-5 py-4"><p className="text-xs leading-5 text-[var(--text-secondary)]"><strong className="font-semibold text-[var(--text-primary)]">{item.actorName}</strong>{' · '}{formatAuditAction(item.action)}</p><time dateTime={item.createdAt} className="mt-1 block text-[10px] text-[var(--text-muted)]">{new Date(item.createdAt).toLocaleString('vi-VN')}</time></article>)}</div>}</section></aside>
      </div>
    </AdminLayout>
  );
}
