import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive,
  BadgeCheck,
  CalendarDays,
  CircleAlert,
  FilePenLine,
  ImageOff,
  Images,
  MapPinned,
  UserPlus,
  Users,
} from 'lucide-react';
import AdminLayout from '../../layouts/AdminLayout';
import AdminStatsCard from '../../components/admin/AdminStatsCard';
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminPageHeader,
  AdminStatusBadge,
} from '../../components/admin/AdminUI';
import {
  getAdminDashboardAttention,
  getAdminDashboardAudit,
  getAdminDashboardMetrics,
  type AdminDashboardAttentionEvent,
  type AdminDashboardAuditEntry,
  type AdminDashboardMetrics,
} from '../../services/adminApi';
import { formatChronologyLabel } from '../../utils/chronology';

type SectionState<T> = {
  data: T | null;
  loading: boolean;
  error: string;
};

const initialState = <T,>(): SectionState<T> => ({ data: null, loading: true, error: '' });

const issueLabels: Record<string, string> = {
  MISSING_CORE_CONTENT: 'Thiếu nội dung cốt lõi',
  INVALID_CORE_CONTENT: 'Nội dung cốt lõi không hợp lệ',
  MISSING_THUMBNAIL: 'Thiếu ảnh đại diện',
  MISSING_ACTIVE_MEDIA: 'Thiếu media đang hoạt động',
  MISSING_GEOGRAPHY: 'Thiếu dữ liệu địa lý',
  INVALID_GEOGRAPHY: 'Dữ liệu địa lý không hợp lệ',
  MISSING_MAP_DATA: 'Thiếu map data',
  INVALID_MAP_DATA: 'Map data không hợp lệ',
  INVALID_CHRONOLOGY: 'Niên đại không hợp lệ',
  INVALID_CLASSIFICATION: 'Phân loại không hợp lệ',
  MISSING_GRADES: 'Thiếu khối lớp',
  INVALID_GRADES: 'Khối lớp không hợp lệ',
};

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

function isAbort(cause: unknown) {
  return cause instanceof DOMException && cause.name === 'AbortError';
}

function MetricLink({
  to,
  label,
  value,
  sub,
  icon,
  color,
  destinationLabel = 'Mở danh sách sự kiện',
}: {
  to: string;
  label: string;
  value: number;
  sub: string;
  icon: ReactNode;
  color: string;
  destinationLabel?: string;
}) {
  return (
    <Link
      to={to}
      aria-label={`${label}: ${value}. ${destinationLabel}`}
      className="rounded-[var(--admin-radius)] no-underline outline-none transition hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[var(--admin-accent)]"
    >
      <AdminStatsCard icon={icon} label={label} value={value} sub={sub} color={color} />
    </Link>
  );
}

function Section({
  title,
  description,
  children,
  id,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--admin-shadow)]">
      <header className="border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
        {description && <p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p>}
      </header>
      {children}
    </section>
  );
}

function formatAuditAction(action: string) {
  return action
    .replace('event.', 'Sự kiện: ')
    .replace('user.', 'Người dùng: ')
    .replaceAll('_', ' ');
}

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<SectionState<AdminDashboardMetrics>>(initialState);
  const [attention, setAttention] =
    useState<SectionState<AdminDashboardAttentionEvent[]>>(initialState);
  const [audit, setAudit] = useState<SectionState<AdminDashboardAuditEntry[]>>(initialState);

  const loadMetrics = useCallback(async (signal?: AbortSignal) => {
    setMetrics(previous => ({ ...previous, loading: true, error: '' }));
    try {
      const data = await getAdminDashboardMetrics(signal);
      setMetrics({ data, loading: false, error: '' });
    } catch (cause) {
      if (isAbort(cause)) return;
      setMetrics(previous => ({
        ...previous,
        loading: false,
        error: errorMessage(cause, 'Không thể tải số liệu tổng quan.'),
      }));
    }
  }, []);

  const loadAttention = useCallback(async (signal?: AbortSignal) => {
    setAttention(previous => ({ ...previous, loading: true, error: '' }));
    try {
      const data = await getAdminDashboardAttention(signal);
      setAttention({ data, loading: false, error: '' });
    } catch (cause) {
      if (isAbort(cause)) return;
      setAttention(previous => ({
        ...previous,
        loading: false,
        error: errorMessage(cause, 'Không thể tải danh sách cần xử lý.'),
      }));
    }
  }, []);

  const loadAudit = useCallback(async (signal?: AbortSignal) => {
    setAudit(previous => ({ ...previous, loading: true, error: '' }));
    try {
      const data = await getAdminDashboardAudit(signal);
      setAudit({ data, loading: false, error: '' });
    } catch (cause) {
      if (isAbort(cause)) return;
      setAudit(previous => ({
        ...previous,
        loading: false,
        error: errorMessage(cause, 'Không thể tải hoạt động quản trị.'),
      }));
    }
  }, []);

  useEffect(() => {
    const metricsController = new AbortController();
    const attentionController = new AbortController();
    const auditController = new AbortController();
    void loadMetrics(metricsController.signal);
    void loadAttention(attentionController.signal);
    void loadAudit(auditController.signal);
    return () => {
      metricsController.abort();
      attentionController.abort();
      auditController.abort();
    };
  }, [loadAttention, loadAudit, loadMetrics]);

  const eventMetrics = metrics.data?.events;
  const userMetrics = metrics.data?.users;

  return (
    <AdminLayout title="Tổng quan">
      <AdminPageHeader
        eyebrow="Vận hành"
        title="Tổng quan quản trị"
        description="Theo dõi chất lượng dữ liệu và mở thẳng các danh sách cần xử lý."
      />

      <Section title="Sự kiện lịch sử" description="Các chỉ số đều dùng chung quy tắc hoàn thiện với danh sách và trang chi tiết.">
        {metrics.loading && !metrics.data && <AdminLoadingState label="Đang tải số liệu sự kiện…" />}
        {metrics.error && <AdminErrorState message={metrics.error} onRetry={() => void loadMetrics()} />}
        {!metrics.loading && !metrics.error && eventMetrics && (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricLink to="/admin/events" label="Tổng sự kiện" value={eventMetrics.total}
              sub="Mở toàn bộ danh sách" color="var(--accent)"
              icon={<CalendarDays size={18} aria-hidden="true" />} />
            <MetricLink to="/admin/events?status=published" label="Đã xuất bản"
              value={eventMetrics.published} sub="Lọc theo trạng thái published" color="var(--success)"
              icon={<BadgeCheck size={18} aria-hidden="true" />} />
            <MetricLink to="/admin/events?status=draft" label="Bản nháp" value={eventMetrics.draft}
              sub="Lọc theo trạng thái draft" color="var(--warning)"
              icon={<FilePenLine size={18} aria-hidden="true" />} />
            <MetricLink to="/admin/events?status=archived" label="Đã lưu trữ"
              value={eventMetrics.archived} sub="Lọc theo trạng thái archived" color="var(--text-muted)"
              icon={<Archive size={18} aria-hidden="true" />} />
            <MetricLink to="/admin/events?missingThumbnail=true" label="Thiếu thumbnail"
              value={eventMetrics.missingThumbnail} sub="Mở các sự kiện thiếu ảnh đại diện"
              color="var(--warning)" icon={<ImageOff size={18} aria-hidden="true" />} />
            <MetricLink to="/admin/events?missingMedia=true" label="Thiếu media"
              value={eventMetrics.missingActiveMedia} sub="Mở các sự kiện thiếu media hoạt động"
              color="var(--warning)" icon={<Images size={18} aria-hidden="true" />} />
            <MetricLink to="/admin/dashboard#attention-queue" label="Map data cần xử lý"
              value={eventMetrics.missingOrInvalidMapData}
              sub="Mở hàng đợi gồm các sự kiện cần xử lý" color="var(--accent)"
              destinationLabel="Mở hàng đợi cần xử lý"
              icon={<MapPinned size={18} aria-hidden="true" />} />
            <MetricLink to="/admin/dashboard#attention-queue" label="Chưa hoàn thiện"
              value={eventMetrics.withCompletenessIssues}
              sub="Mở hàng đợi gồm các sự kiện cần xử lý" color="var(--accent)"
              destinationLabel="Mở hàng đợi cần xử lý"
              icon={<CircleAlert size={18} aria-hidden="true" />} />
          </div>
        )}
      </Section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]">
        <Section id="attention-queue" title="Cần xử lý" description="Tối đa 10 sự kiện chưa lưu trữ, ưu tiên bản đã xuất bản và lỗi nghiêm trọng.">
          {attention.loading && !attention.data && <AdminLoadingState label="Đang tải hàng đợi xử lý…" />}
          {attention.error && <AdminErrorState message={attention.error} onRetry={() => void loadAttention()} />}
          {!attention.loading && !attention.error && attention.data?.length === 0 && (
            <AdminEmptyState
              title="Không có sự kiện cần xử lý"
              description="Tất cả sự kiện đang hoạt động đã vượt qua kiểm tra hoàn thiện."
            />
          )}
          {!attention.error && attention.data && attention.data.length > 0 && (
            <div className="divide-y divide-[var(--border)]">
              {attention.data.map(item => {
                const returnTo = `/admin/events?${item.recommendedFilter}`;
                return (
                  <Link
                    key={item.id}
                    to={`/admin/events/${encodeURIComponent(item.id)}`}
                    state={{ from: returnTo }}
                    className="group grid gap-3 px-5 py-4 no-underline outline-none transition hover:bg-[var(--bg-elevated)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-accent)] sm:grid-cols-[4.5rem_minmax(0,1fr)_auto]"
                  >
                    <div className="h-14 w-[4.5rem] overflow-hidden rounded-lg bg-[var(--bg-elevated)]">
                      {item.thumbnail?.url ? (
                        <img src={item.thumbnail.url} alt={item.thumbnail.altText || ''} className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full items-center justify-center text-[var(--text-muted)]" aria-hidden="true">
                          <ImageOff size={18} />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--admin-accent)]">
                          {item.title}
                        </h3>
                        <AdminStatusBadge status={item.status} label={item.status} />
                      </div>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {formatChronologyLabel(item.chronology)}
                      </p>
                      <p className="mt-2 text-xs font-medium text-[var(--accent)]">
                        {issueLabels[item.reasonCode] ?? item.reasonCode}
                        {item.completeness.issueCount > 1 && ` · ${item.completeness.issueCount} vấn đề`}
                      </p>
                    </div>
                    <time dateTime={item.updatedAt} className="text-xs text-[var(--text-muted)]">
                      {new Date(item.updatedAt).toLocaleDateString('vi-VN')}
                    </time>
                  </Link>
                );
              })}
            </div>
          )}
        </Section>

        <div className="space-y-6">
          <Section title="Người dùng">
            {metrics.loading && !metrics.data && <AdminLoadingState label="Đang tải số liệu người dùng…" />}
            {metrics.error && <AdminErrorState message={metrics.error} onRetry={() => void loadMetrics()} />}
            {!metrics.loading && !metrics.error && userMetrics && (
              <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-1">
                <AdminStatsCard icon={<Users size={18} aria-hidden="true" />} label="Người dùng hoạt động"
                  value={userMetrics.activeTotal} sub="Tài khoản có trạng thái active" color="var(--success)" />
                <AdminStatsCard icon={<UserPlus size={18} aria-hidden="true" />} label="Mới trong 7 ngày"
                  value={userMetrics.createdLast7Days} sub="Tài khoản được tạo gần đây" color="var(--admin-accent)" />
              </div>
            )}
          </Section>

          <Section title="Hoạt động quản trị gần đây">
            {audit.loading && !audit.data && <AdminLoadingState label="Đang tải hoạt động quản trị…" />}
            {audit.error && <AdminErrorState message={audit.error} onRetry={() => void loadAudit()} />}
            {!audit.loading && !audit.error && audit.data?.length === 0 && (
              <AdminEmptyState
                title="Chưa có hoạt động quản trị"
                description="Các thao tác quản trị gần đây sẽ xuất hiện tại đây."
              />
            )}
            {!audit.error && audit.data && audit.data.length > 0 && (
              <div className="divide-y divide-[var(--border)]">
                {audit.data.map((item, index) => (
                  <article key={`${item.timestamp}-${item.entityId ?? index}`} className="px-5 py-4">
                    <p className="text-xs leading-5 text-[var(--text-secondary)]">
                      <strong className="font-semibold text-[var(--text-primary)]">
                        {item.actor.displayName}
                      </strong>
                      {' · '}
                      {formatAuditAction(item.action)}
                    </p>
                    <p className="mt-1 break-all text-[10px] text-[var(--text-muted)]">
                      {item.entityType}{item.entityId ? ` · ${item.entityId}` : ''}
                    </p>
                    <time dateTime={item.timestamp} className="mt-1 block text-[10px] text-[var(--text-muted)]">
                      {new Date(item.timestamp).toLocaleString('vi-VN')}
                    </time>
                  </article>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>
    </AdminLayout>
  );
}
