import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../../layouts/AdminLayout';
import {
  getAdminMediaCleanup,
  getAdminMediaCleanupSummary,
  type AdminMediaCleanupItem,
  type AdminMediaCleanupSummary,
} from '../../services/adminApi';

const PAGE_SIZE = 25;

function formatTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : '—';
}

export default function AdminMediaCleanupPage() {
  const [summary, setSummary] = useState<AdminMediaCleanupSummary | null>(null);
  const [items, setItems] = useState<AdminMediaCleanupItem[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextSummary, page] = await Promise.all([
        getAdminMediaCleanupSummary(),
        getAdminMediaCleanup({
          ...(status ? { status: status as AdminMediaCleanupItem['status'] } : {}),
          sortBy: 'nextAttemptAt', sortDir: 'asc', limit: PAGE_SIZE, offset,
        }),
      ]);
      setSummary(nextSummary);
      setItems(page.items);
      setTotal(page.total);
    } catch {
      setError('Không thể tải trạng thái dọn dẹp media. Hãy thử lại.');
    } finally {
      setLoading(false);
    }
  }, [offset, status]);

  useEffect(() => { void load(); }, [load]);

  return <AdminLayout title="Dọn dẹp media">
    <header className="mb-6">
      <h1 className="text-2xl font-bold">Dọn dẹp media</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Chỉ quan sát hàng đợi. Worker nền là chủ thể duy nhất thực thi xoá Cloudinary.
      </p>
    </header>
    {error && <p role="alert" className="mb-4 text-sm text-[var(--accent)]">{error}</p>}
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
        <label className="text-sm">Trạng thái
          <select aria-label="Lọc trạng thái cleanup" value={status} className="ml-2" onChange={event => {
            setStatus(event.target.value); setOffset(0);
          }}>
            <option value="">Tất cả</option>
            <option value="PENDING">Đang chờ</option>
            <option value="CLAIMED">Đã nhận</option>
            <option value="FAILED">Thất bại</option>
            <option value="COMPLETED">Hoàn tất</option>
          </select>
        </label>
        <button type="button" onClick={() => void load()} disabled={loading}>Làm mới</button>
      </div>
      {loading ? <p role="status">Đang tải…</p> : <>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr><th>Trạng thái</th><th>Tài sản</th><th>Thao tác</th><th>Lần thử</th><th>Lần kế tiếp</th><th>Lỗi</th></tr></thead>
            <tbody>{items.map(item => <tr key={item.id} className="border-t border-[var(--border)]">
              <td>{item.status}</td>
              <td><code className="text-xs">{item.publicId}</code>{item.eventId && <div className="text-xs text-[var(--text-muted)]">Sự kiện: {item.eventId}</div>}</td>
              <td>{item.operation}</td><td>{item.attempts}</td><td>{formatTime(item.nextAttemptAt)}</td>
              <td>{item.lastErrorCode ?? '—'}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {!items.length && <p className="py-5 text-sm text-[var(--text-muted)]">Không có mục dọn dẹp phù hợp.</p>}
        <div className="mt-4 flex items-center justify-between text-sm">
          <span>{total} mục</span>
          <div className="flex gap-2"><button type="button" disabled={offset === 0 || loading} onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))}>Trước</button>
            <button type="button" disabled={loading || offset + PAGE_SIZE >= total} onClick={() => setOffset(value => value + PAGE_SIZE)}>Sau</button></div>
        </div>
      </>}
    </section>
  </AdminLayout>;
}
