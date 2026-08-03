import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, PlayCircle, RefreshCw, TriangleAlert } from 'lucide-react';
import AdminLayout from '../../layouts/AdminLayout';
import { AdminActionButton, AdminFilterSelect, AdminIconButton } from '../../components/admin/AdminUI';
import {
  getAdminMediaCleanup,
  getAdminMediaCleanupCapability,
  getAdminMediaCleanupSummary,
  postAdminMediaCleanupTick,
  type AdminMediaCleanupItem,
  type AdminMediaCleanupCapability,
  type AdminMediaCleanupSummary,
} from '../../services/adminApi';

const PAGE_SIZE = 25;

function formatTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : '—';
}

function formatRelativeFuture(iso: string | null | undefined, now: number) {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  const delta = target - now;
  if (delta <= 0) return 'Quá hạn';
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'trong <1 phút';
  if (minutes < 60) return `trong ${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `trong ${hours} giờ`;
  const days = Math.floor(hours / 24);
  return `trong ${days} ngày`;
}

/**
 * ## Sort criteria used by the Admin cleanup page
 *
 * - We sort by `nextAttemptAt ASC` so the operator sees the most overdue
 *   task first.
 * - Overdue PENDING rows get an inline badge so the runtime evidence in the
 *   screenshot (next_attempt_at in the past, status still PENDING) is no
 *   longer ambiguous.
 * - The worker capability panel surfaces both the scheduler feature flag
 *   and the last observed tick state so operators don't have to read
 *   backend logs.
 */
function describeWorkerState(
  capability: AdminMediaCleanupCapability | null,
  error: string
): { label: string; tone: 'success' | 'warning' | 'error' | 'info' } {
  if (error) return { label: 'Không xác định', tone: 'warning' };
  if (!capability) return { label: 'Đang kiểm tra…', tone: 'info' };
  if (!capability.enabled) {
    return { label: 'Đã tắt (cấu hình APP_EVENT_IMAGE_CLEANUP_ENABLED=false)', tone: 'warning' };
  }
  if (!capability.storageAvailable) {
    return { label: 'Cloudinary chưa sẵn sàng', tone: 'error' };
  }
  // Surface the overdue count even if the worker is otherwise healthy so
  // operators can diagnose a stuck backlog without watching the table.
  const overdueSuffix = capability.overduePending > 0
    ? ` · ${capability.overduePending} nhiệm vụ quá hạn`
    : '';
  if (capability.lastErrorCode) {
    return {
      label: `Worker chạy nhưng có lỗi: ${capability.lastErrorCode}${overdueSuffix}`,
      tone: 'warning',
    };
  }
  if (capability.overduePending > 0) {
    return {
      label: `Worker hoạt động${overdueSuffix}`,
      tone: 'warning',
    };
  }
  return { label: 'Worker hoạt động bình thường', tone: 'success' };
}

function formatTickAgo(iso: string | null | undefined, now: number): string {
  if (!iso) return '—';
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return '—';
  const delta = now - target;
  if (delta < 5_000) return 'vừa xong';
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return `${seconds} giây trước`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return `${days} ngày trước`;
}

export default function AdminMediaCleanupPage() {
  const [summary, setSummary] = useState<AdminMediaCleanupSummary | null>(null);
  const [capability, setCapability] = useState<AdminMediaCleanupCapability | null>(null);
  const [capabilityError, setCapabilityError] = useState('');
  const [items, setItems] = useState<AdminMediaCleanupItem[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ticking, setTicking] = useState(false);
  const [error, setError] = useState('');
  const [tickBanner, setTickBanner] = useState<string>('');
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setCapabilityError('');
    try {
      const [nextSummary, capabilityResult, page] = await Promise.all([
        getAdminMediaCleanupSummary(),
        getAdminMediaCleanupCapability().catch((cause: unknown) => {
          setCapabilityError(
            cause instanceof Error ? cause.message : 'Không đọc được trạng thái worker.');
          return null;
        }),
        getAdminMediaCleanup({
          ...(status ? { status: status as AdminMediaCleanupItem['status'] } : {}),
          sortBy: 'nextAttemptAt', sortDir: 'asc', limit: PAGE_SIZE, offset,
        }),
      ]);
      setSummary(nextSummary);
      setCapability(capabilityResult);
      setItems(page.items);
      setTotal(page.total);
    } catch {
      setError('Không thể tải trạng thái dọn dẹp media. Hãy thử lại.');
    } finally {
      setLoading(false);
    }
  }, [offset, status]);

  const tickNow = useCallback(async () => {
    setTicking(true);
    try {
      const capabilityResult = await postAdminMediaCleanupTick();
      setCapability(capabilityResult);
      setTickBanner(
        capabilityResult.lastCompleted > 0
          ? `Đã hoàn tất ${capabilityResult.lastCompleted} nhiệm vụ trong lần chạy vừa rồi.`
          : capabilityResult.lastClaimed === 0
            ? 'Worker chạy nhưng không tìm thấy nhiệm vụ đủ điều kiện.'
            : 'Worker đã chạy nhưng chưa hoàn tất nhiệm vụ nào trong lượt này.',
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Không thể chạy worker: ${cause.message}`
          : 'Không thể chạy worker.',
      );
    } finally {
      setTicking(false);
    }
  }, [load]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const workerState = describeWorkerState(capability, capabilityError);

  return <AdminLayout title="Dọn dẹp media">
    <header className="mb-6">
      <h1 className="text-2xl font-bold">Dọn dẹp media</h1>
      <p className="mt-1 max-w-3xl text-sm text-[var(--text-muted)]">
        Hàng đợi xử lý asset cũ/orphan trên Cloudinary — không phải thư viện ảnh. Tác vụ được tạo
        sau khi thay thế ảnh hoặc lỗi hoàn tất upload; worker nền là chủ thể duy nhất thực thi xoá.
        Trang này chỉ để theo dõi và không bao giờ ảnh hưởng tới ảnh đang hoạt động (READY).
      </p>
    </header>
    {error && <p role="alert" className="mb-4 text-sm text-[var(--accent)]">{error}</p>}
    <section
      aria-label="Trạng thái worker dọn dẹp"
      className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4"
      data-testid="admin-cleanup-worker-panel"
    >
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-72">
          <p className="text-xs text-[var(--text-muted)]">Trạng thái worker</p>
          <p
            className={`mt-1 text-sm font-semibold ${
              workerState.tone === 'error' ? 'text-[var(--accent)]' :
              workerState.tone === 'warning' ? 'text-amber-700' :
              workerState.tone === 'success' ? 'text-emerald-700' :
              'text-[var(--text-secondary)]'
            }`}
            data-testid="admin-cleanup-worker-state"
            role="status"
          >
            {workerState.label}
          </p>
          {capability?.lastTickAt && (
            <p className="mt-1 text-xs text-[var(--text-muted)]" data-testid="admin-cleanup-last-tick">
              Tick gần nhất: <span className="font-mono">{formatTime(capability.lastTickAt)}</span> ({formatTickAgo(capability.lastTickAt, now)}) · Poll mỗi {Math.round(capability.intervalMs / 1000)}s
            </p>
          )}
          {!capability && !capabilityError && (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Worker chưa chạy lần nào kể từ khi tiến trình khởi động.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminActionButton
            type="button"
            variant="secondary"
            pending={ticking || loading}
            disabled={ticking || loading}
            onClick={() => void tickNow()}
            data-testid="admin-cleanup-tick-now"
          >
            <PlayCircle size={14} aria-hidden="true" className="mr-1.5" />
            Chạy ngay
          </AdminActionButton>
        </div>
      </div>
      {tickBanner && (
        <p
          className="mt-3 text-xs text-[var(--text-secondary)]"
          data-testid="admin-cleanup-tick-banner"
          role="status"
        >
          {tickBanner}
        </p>
      )}
    </section>
    <section aria-label="Tổng quan dọn dẹp" className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[
        ['Đang chờ', summary?.pending], ['Đã nhận', summary?.claimed],
        ['Thất bại', summary?.failed], ['Hoàn tất', summary?.completed],
      ].map(([label, count]) => <div key={String(label)} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <p className="text-xs text-[var(--text-muted)]">{label}</p>
        <p className="mt-1 text-2xl font-bold">{count ?? '—'}</p>
      </div>)}
    </section>
    <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm">Trạng thái</span>
          <AdminFilterSelect
            label="Lọc trạng thái cleanup"
            value={status}
            onValueChange={value => { setStatus(value); setOffset(0); }}
            options={[
              { value: '', label: 'Tất cả' },
              { value: 'PENDING', label: 'Đang chờ' },
              { value: 'CLAIMED', label: 'Đã nhận' },
              { value: 'FAILED', label: 'Thất bại' },
              { value: 'COMPLETED', label: 'Hoàn tất' },
            ]}
          />
        </div>
        <AdminActionButton type="button" variant="secondary" pending={loading} onClick={() => void load()}>
          <RefreshCw size={14} aria-hidden="true" className="mr-1.5" />
          Làm mới
        </AdminActionButton>
      </div>
      {loading ? <p role="status">Đang tải…</p> : <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr><th>Trạng thái</th><th>Tài sản</th><th>Thao tác</th><th>Lần thử</th><th>Lần kế tiếp</th><th>Tạo lúc</th><th>Lỗi</th></tr></thead>
          <tbody>{items.map(item => {
            const relative = item.status === 'PENDING'
              ? formatRelativeFuture(item.nextAttemptAt, now)
              : null;
            const overdue = item.status === 'PENDING' && item.nextAttemptAt
              && new Date(item.nextAttemptAt).getTime() < now;
            return <tr key={item.id} className="border-t border-[var(--border)]">
              <td>
                <span>{item.status}</span>
                {overdue && (
                  <span
                    className="ml-2 inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                    data-testid="admin-cleanup-overdue-badge"
                    title={`Quá hạn xử lý kể từ ${formatTime(item.nextAttemptAt)}`}
                  >
                    <TriangleAlert size={11} aria-hidden="true" />
                    Quá hạn xử lý
                  </span>
                )}
              </td>
              <td>
                <code className="block max-w-56 truncate text-xs" title={item.publicId}>{item.publicId}</code>
                {item.eventId && <div className="text-xs text-[var(--text-muted)]">Sự kiện: {item.eventId}</div>}
              </td>
              <td>{item.provider} · {item.operation}</td>
              <td>{item.attempts}</td>
              <td>
                <div>{formatTime(item.nextAttemptAt)}</div>
                {relative && (
                  <div className="text-xs text-[var(--text-muted)]">{relative}</div>
                )}
              </td>
              <td>{formatTime(item.createdAt)}</td>
              <td>{item.lastErrorCode ?? '—'}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
      {!loading && !items.length && <p className="py-5 text-sm text-[var(--text-muted)]">
        {status ? 'Không có mục dọn dẹp phù hợp với bộ lọc.' : 'Không có tác vụ dọn dẹp đang chờ xử lý.'}
      </p>}
      <div className="mt-4 flex items-center justify-between text-sm">
        <span>{total} mục</span>
        <div className="flex gap-2">
          <AdminIconButton
            label="Trang trước"
            tooltip="Trang trước"
            variant="outline"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </AdminIconButton>
          <AdminIconButton
            label="Trang sau"
            tooltip="Trang sau"
            variant="outline"
            disabled={loading || offset + PAGE_SIZE >= total}
            onClick={() => setOffset(value => value + PAGE_SIZE)}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </AdminIconButton>
        </div>
      </div>
    </section>
  </AdminLayout>;
}
