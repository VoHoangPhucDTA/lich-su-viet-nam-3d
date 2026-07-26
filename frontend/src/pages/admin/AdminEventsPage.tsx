import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import AdminLayout from '../../layouts/AdminLayout';
import {
  AdminDataTable,
  AdminFilterSelect,
  AdminPageHeader,
  AdminPagination,
  AdminSearchInput,
  AdminStatusBadge,
  type AdminDataColumn,
} from '../../components/admin/AdminUI';
import { getAdminEvents, type AdminEvent } from '../../services/adminApi';
import { ApiRequestError } from '../../services/apiClient';
import { formatChronologyLabel } from '../../utils/chronology';
import AdminEventPublicationActions from '../../components/admin/AdminEventPublicationActions';
import { publicationIssueTargetId } from '../../components/admin/adminEventPublication';

const LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 300;

const options = {
  status: [
    { value: '', label: 'Trạng thái: Tất cả' },
    { value: 'draft', label: 'Bản nháp' },
    { value: 'published', label: 'Đã xuất bản' },
    { value: 'archived', label: 'Lưu trữ' },
  ],
  level: [
    { value: '', label: 'Cấp độ: Tất cả' },
    { value: 'atomic', label: 'Sự kiện đơn' },
    { value: 'collection', label: 'Bộ sưu tập' },
  ],
  type: [
    { value: '', label: 'Loại: Tất cả' },
    { value: 'political', label: 'Chính trị' },
    { value: 'military', label: 'Quân sự' },
    { value: 'economic', label: 'Kinh tế' },
    { value: 'cultural', label: 'Văn hóa - xã hội' },
  ],
  grade: [
    { value: '', label: 'Khối: Tất cả' },
    { value: '10', label: 'Khối 10' }, { value: '11', label: 'Khối 11' }, { value: '12', label: 'Khối 12' },
  ],
  geo: [
    { value: '', label: 'Địa lý: Tất cả' },
    { value: 'point', label: 'Một điểm' },
    { value: 'multi_point', label: 'Nhiều điểm' },
    { value: 'multi_polygon', label: 'Nhiều vùng' },
    { value: 'mixed', label: 'Hỗn hợp' },
    { value: 'nationwide', label: 'Toàn quốc' },
    { value: 'no_location', label: 'Không địa điểm' },
  ],
  chronology: [
    { value: '', label: 'Niên đại: Tất cả' },
    { value: 'known', label: 'Đã xác định' },
    { value: 'unknown', label: 'Không rõ' },
  ],
  quality: [
    { value: '', label: 'Dữ liệu: Tất cả' },
    { value: 'thumbnail', label: 'Thiếu thumbnail' },
    { value: 'media', label: 'Thiếu media' },
    { value: 'mapData', label: 'Thiếu map data' },
  ],
  sort: [
    { value: 'updatedAt:desc', label: 'Cập nhật mới nhất' },
    { value: 'updatedAt:asc', label: 'Cập nhật cũ nhất' },
    { value: 'title:asc', label: 'Tên A–Z' },
    { value: 'title:desc', label: 'Tên Z–A' },
    { value: 'chronology:asc', label: 'Niên đại tăng dần' },
    { value: 'chronology:desc', label: 'Niên đại giảm dần' },
    { value: 'createdAt:desc', label: 'Tạo mới nhất' },
  ],
};

function numberValue(value: string | null): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function errorMessage(cause: unknown) {
  if (cause instanceof ApiRequestError) {
    if (cause.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    if (cause.status === 403) return 'Bạn không có quyền xem dữ liệu quản trị này.';
    return cause.message;
  }
  return cause instanceof Error ? cause.message : 'Không thể tải danh sách sự kiện.';
}

export default function AdminEventsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<AdminEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [publicationBusyId, setPublicationBusyId] = useState<string | null>(null);
  const urlQuery = params.get('q') ?? '';
  const [search, setSearch] = useState(urlQuery);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(urlQuery), 0);
    return () => window.clearTimeout(timer);
  }, [urlQuery]);
  useEffect(() => {
    if (search.trim() === urlQuery) return;
    const timer = window.setTimeout(() => {
      setParams(previous => {
        const next = new URLSearchParams(previous);
        const value = search.trim();
        if (value) next.set('q', value); else next.delete('q');
        next.delete('offset');
        return next;
      }, { replace: true });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search, setParams, urlQuery]);

  const state = useMemo(() => {
    const quality = params.get('quality') ?? '';
    const [sortBy = 'updatedAt', sortDir = 'desc'] = (params.get('sort') ?? 'updatedAt:desc').split(':');
    return {
      q: urlQuery || undefined,
      status: params.get('status') || undefined,
      eventLevel: params.get('eventLevel') || undefined,
      eventType: params.get('eventType') || undefined,
      grade: numberValue(params.get('grade')),
      geoType: params.get('geoType') || undefined,
      chronology: params.get('chronology') || undefined,
      startYearFrom: numberValue(params.get('yearFrom')),
      startYearTo: numberValue(params.get('yearTo')),
      missingThumbnail: quality === 'thumbnail' ? true : undefined,
      missingMedia: quality === 'media' ? true : undefined,
      missingMapData: quality === 'mapData' ? true : undefined,
      sortBy,
      sortDir,
      limit: LIMIT,
      offset: numberValue(params.get('offset')) ?? 0,
    };
  }, [params, urlQuery]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await getAdminEvents({
          ...state,
          startYearTo: state.startYearTo == null ? undefined : state.startYearTo + 1,
        }, controller.signal);
        if (response.items.length === 0 && state.offset > 0 && state.offset >= response.total) {
          const nearestOffset = Math.max(
            0,
            Math.floor(Math.max(response.total - 1, 0) / LIMIT) * LIMIT,
          );
          setParams(previous => {
            const next = new URLSearchParams(previous);
            if (nearestOffset > 0) next.set('offset', String(nearestOffset));
            else next.delete('offset');
            return next;
          }, { replace: true });
          return;
        }
        setItems(response.items);
        setTotal(response.total);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(errorMessage(cause));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [state, retry, setParams]);

  const setValue = (key: string, value: string, resetOffset = true) => {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value); else next.delete(key);
      if (resetOffset) next.delete('offset');
      return next;
    });
  };
  const clearFilters = () => {
    setSearch('');
    setParams({});
  };
  const hasFilters = Array.from(params.keys()).some(key => key !== 'offset');

  const columns: AdminDataColumn<AdminEvent>[] = [
    {
      key: 'name', header: 'Sự kiện',
      render: event => <div className="flex min-w-72 items-center gap-3">
        {event.thumbnail
          ? <img src={event.thumbnail.url} alt={event.thumbnail.altText ?? ''} className="h-12 w-16 rounded object-cover" />
          : <div className="flex h-12 w-16 items-center justify-center rounded bg-[var(--bg-surface)] text-[10px] text-[var(--text-muted)]">Không ảnh</div>}
        <div><Link to={`/admin/events/${encodeURIComponent(event.id)}`} state={{ from: `${location.pathname}${location.search}` }} className="font-semibold text-[var(--admin-accent)]">{event.title}</Link>
          <p className="mt-1 truncate text-xs text-[var(--text-muted)]">{event.slug}</p></div>
      </div>,
    },
    { key: 'year', header: 'Niên đại', render: event => <span>{formatChronologyLabel(event.chronology)}</span> },
    { key: 'classification', header: 'Phân loại', render: event => <span className="text-xs">{event.eventLevel} · {event.eventType}<br />{event.grades.length ? `Lớp ${event.grades.join(', ')}` : 'Chưa gán lớp'}</span> },
    { key: 'geo', header: 'Địa lý', render: event => <span className="text-xs">{event.canonicalGeoType ?? 'Không hợp lệ'}</span> },
    { key: 'quality', header: 'Độ đầy đủ', render: event => event.completeness.complete
      ? <AdminStatusBadge status="active" label="Đầy đủ" />
      : <AdminStatusBadge status="draft" label={`${event.completeness.issueCount} vấn đề`} /> },
    { key: 'status', header: 'Trạng thái', render: event => <AdminStatusBadge status={event.status} /> },
    { key: 'updatedAt', header: 'Cập nhật', render: event => <time dateTime={event.updatedAt}>{new Date(event.updatedAt).toLocaleDateString('vi-VN')}</time> },
    {
      key: 'actions',
      header: 'Xuất bản',
      render: event => (
        <AdminEventPublicationActions
          compact
          eventId={event.id}
          status={event.status}
          version={event.updatedAt}
          disabled={publicationBusyId !== null && publicationBusyId !== event.id}
          onBusyChange={busy => setPublicationBusyId(busy ? event.id : null)}
          onUpdated={detail => {
            setItems(previous => previous.map(item => item.id === event.id ? {
              ...item,
              status: detail.publication.status,
              updatedAt: detail.publication.updatedAt,
              completeness: detail.completeness,
            } : item));
            setRetry(value => value + 1);
          }}
          onReload={() => setRetry(value => value + 1)}
          onIssueSelect={issue => navigate(
            `/admin/events/${encodeURIComponent(event.id)}/edit#${publicationIssueTargetId(issue.section)}`,
          )}
        />
      ),
    },
  ];

  return <AdminLayout title="Sự kiện lịch sử">
    <AdminPageHeader title="Sự kiện lịch sử" description="Tìm kiếm, rà soát và quản lý trạng thái xuất bản an toàn." />
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
      <p role="note" className="border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
        Hard delete vẫn bị khóa. Mọi thay đổi trạng thái dùng version chính xác và quy tắc độ đầy đủ dùng chung.
      </p>
      <div className="space-y-3 border-b border-[var(--border)] p-4">
        <AdminSearchInput value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm tên, slug hoặc tóm tắt…" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <AdminFilterSelect label="Trạng thái" value={params.get('status') ?? ''} onValueChange={value => setValue('status', value)} options={options.status} />
          <AdminFilterSelect label="Cấp độ" value={params.get('eventLevel') ?? ''} onValueChange={value => setValue('eventLevel', value)} options={options.level} />
          <AdminFilterSelect label="Loại" value={params.get('eventType') ?? ''} onValueChange={value => setValue('eventType', value)} options={options.type} />
          <AdminFilterSelect label="Khối" value={params.get('grade') ?? ''} onValueChange={value => setValue('grade', value)} options={options.grade} />
          <AdminFilterSelect label="Địa lý" value={params.get('geoType') ?? ''} onValueChange={value => setValue('geoType', value)} options={options.geo} />
          <AdminFilterSelect label="Niên đại" value={params.get('chronology') ?? ''} onValueChange={value => setValue('chronology', value)} options={options.chronology} />
          <AdminFilterSelect label="Dữ liệu thiếu" value={params.get('quality') ?? ''} onValueChange={value => setValue('quality', value)} options={options.quality} />
          <AdminFilterSelect label="Sắp xếp" value={params.get('sort') ?? 'updatedAt:desc'} onValueChange={value => setValue('sort', value)} options={options.sort} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="Năm bắt đầu" inputMode="numeric" placeholder="Năm từ" value={params.get('yearFrom') ?? ''} onChange={event => setValue('yearFrom', event.target.value)} className="admin-input w-28" />
          <input aria-label="Năm kết thúc" inputMode="numeric" placeholder="Năm đến" value={params.get('yearTo') ?? ''} onChange={event => setValue('yearTo', event.target.value)} className="admin-input w-28" />
          <span className="ml-auto text-xs text-[var(--text-muted)]">{total} sự kiện</span>
          {hasFilters && <button type="button" className="admin-text-button" onClick={clearFilters}>Xóa bộ lọc</button>}
        </div>
      </div>
      <AdminDataTable
        columns={columns} rows={items} getKey={event => event.id} minWidth="1280px"
        loading={loading && items.length === 0} error={error || undefined}
        onRetry={() => setRetry(value => value + 1)}
        emptyTitle="Không có sự kiện phù hợp"
        emptyDescription="Thử thay đổi từ khóa hoặc bộ lọc."
        footer={<AdminPagination total={total} offset={state.offset} limit={LIMIT} loading={loading}
          onChange={offset => setValue('offset', String(offset), false)} />}
      />
    </section>
  </AdminLayout>;
}
