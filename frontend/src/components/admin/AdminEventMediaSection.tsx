import { useState } from 'react';
import {
  addAdminEventMedia,
  removeAdminEventMedia,
  reorderAdminEventMedia,
  selectAdminEventThumbnail,
  updateAdminEventMedia,
  type AdminEventDetail,
  type AdminEventMediaCreateRequest,
  type AdminEventMediaPatchRequest,
} from '../../services/adminApi';
import { ApiRequestError } from '../../services/apiClient';

type Props = {
  eventId: string;
  detail: AdminEventDetail;
  version: string;
  disabled?: boolean;
  onUpdated: (detail: AdminEventDetail) => void;
  onConflict: () => void;
  onBusyChange?: (busy: boolean) => void;
};

const initialForm: Omit<AdminEventMediaCreateRequest, 'expectedUpdatedAt'> =
  { mediaType: 'image', url: '', status: 'active' };
type EditableMedia = Omit<AdminEventMediaPatchRequest, 'expectedUpdatedAt'>;

export default function AdminEventMediaSection({ eventId, detail, version, disabled, onUpdated, onConflict, onBusyChange }: Props) {
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editing, setEditing] = useState<EditableMedia | null>(null);
  const media = detail.media.items;

  const run = async (operation: () => Promise<AdminEventDetail>) => {
    if (disabled || busy) return;
    setBusy(true); onBusyChange?.(true); setError(''); setMessage('');
    try {
      onUpdated(await operation());
      setMessage('Đã cập nhật media.');
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.code === 'EVENT_UPDATE_CONFLICT') onConflict();
      setError(cause instanceof Error ? cause.message : 'Không thể cập nhật media.');
    } finally { setBusy(false); onBusyChange?.(false); }
  };

  const move = (index: number, delta: number) => {
    const next = index + delta;
    if (next < 0 || next >= media.length) return;
    const ids = media.map(item => item.id);
    [ids[index], ids[next]] = [ids[next], ids[index]];
    void run(() => reorderAdminEventMedia(eventId, version, ids));
  };

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5" aria-labelledby="admin-media-title">
      <h2 id="admin-media-title" className="text-lg font-bold text-[var(--text-primary)]">Media và thumbnail</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">Chỉ quản lý metadata và URL HTTP(S); không upload file hay sửa dữ liệu bản đồ.</p>
      {error && <p role="alert" className="mt-3 text-sm text-[var(--accent)]">{error}</p>}
      {message && <p role="status" className="mt-3 text-sm text-emerald-600">{message}</p>}
      <div className="mt-4 space-y-3">
        {media.length === 0 && <p className="text-sm text-[var(--text-muted)]">Chưa có media.</p>}
        {media.map((item, index) => (
          <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] p-3">
            {item.urlSafe && item.url ? (
              item.mediaType === 'image'
                ? <img src={item.url} alt={item.altText ?? ''} className="h-14 w-20 rounded object-cover" />
                : <a href={item.url} target="_blank" rel="noreferrer" className="text-sm underline">Mở liên kết</a>
            ) : <span className="text-xs text-[var(--text-muted)]">URL không an toàn đã ẩn</span>}
            <div className="min-w-48 flex-1 text-sm">
              <div className="font-semibold">
                {item.mediaType} · {item.status} · {item.storageType}
                {item.thumbnail ? ' · thumbnail' : ''}
              </div>
              <div className="text-xs text-[var(--text-muted)]">{item.caption ?? 'Không có chú thích'}</div>
            </div>
            <button type="button" disabled={disabled || busy || index === 0} onClick={() => move(index, -1)} aria-label="Di chuyển lên">↑</button>
            <button type="button" disabled={disabled || busy || index === media.length - 1} onClick={() => move(index, 1)} aria-label="Di chuyển xuống">↓</button>
            {editingId === item.id ? (
              <div className="grid w-full gap-2 rounded-lg bg-[var(--bg-secondary)] p-3 md:grid-cols-2">
                <label className="text-xs">Loại media
                  <select aria-label={`Loại media ${item.id}`} value={editing?.mediaType ?? item.mediaType}
                    onChange={event => setEditing(previous => ({ ...previous, mediaType: event.target.value as AdminEventMediaCreateRequest['mediaType'] }))}>
                    <option value="image">image</option><option value="video">video</option>
                    <option value="document">document</option><option value="audio">audio</option>
                  </select>
                </label>
                <label className="text-xs">Trạng thái
                  <select aria-label={`Trạng thái media ${item.id}`} value={editing?.status ?? item.status}
                    onChange={event => setEditing(previous => ({ ...previous, status: event.target.value as 'active' | 'hidden' | 'missing' }))}>
                    <option value="active">active</option><option value="hidden">hidden</option>
                    <option value="missing">missing</option>
                  </select>
                </label>
                <label className="text-xs md:col-span-2">URL
                  <input type="url" aria-label={`URL media ${item.id}`} value={editing?.url ?? ''}
                    placeholder={item.urlSafe ? 'https://...' : 'Nhập URL HTTP(S) an toàn để thay thế'}
                    onChange={event => setEditing(previous => ({ ...previous, url: event.target.value }))} />
                </label>
                <label className="text-xs">Chú thích
                  <input aria-label={`Chú thích media ${item.id}`} value={editing?.caption ?? ''}
                    onChange={event => setEditing(previous => ({ ...previous, caption: event.target.value }))} />
                </label>
                <label className="text-xs">Alt text
                  <input aria-label={`Alt text media ${item.id}`} value={editing?.altText ?? ''}
                    onChange={event => setEditing(previous => ({ ...previous, altText: event.target.value }))} />
                </label>
                <label className="text-xs">Nguồn
                  <input aria-label={`Nguồn media ${item.id}`} value={editing?.sourceName ?? ''}
                    onChange={event => setEditing(previous => ({ ...previous, sourceName: event.target.value }))} />
                </label>
                <label className="text-xs">Giấy phép
                  <input aria-label={`Giấy phép media ${item.id}`} value={editing?.license ?? ''}
                    onChange={event => setEditing(previous => ({ ...previous, license: event.target.value }))} />
                </label>
                <div className="flex gap-2 md:col-span-2">
                <button type="button" disabled={disabled || busy} onClick={() => void run(async () => {
                  const patch = editing ?? {};
                  const url = patch.url?.trim();
                  const updated = await updateAdminEventMedia(eventId, item.id, {
                    expectedUpdatedAt: version,
                    mediaType: patch.mediaType,
                    ...(url ? { url } : {}),
                    caption: patch.caption?.trim() || null,
                    altText: patch.altText?.trim() || null,
                    sourceName: patch.sourceName?.trim() || null,
                    license: patch.license?.trim() || null,
                    status: patch.status,
                  });
                  setEditingId(null);
                  setEditing(null);
                  return updated;
                })}>Lưu media</button>
                  <button type="button" onClick={() => { setEditingId(null); setEditing(null); }}>Hủy</button>
                </div>
              </div>
            ) : (
              <button type="button" disabled={disabled || busy} onClick={() => {
                setEditingId(item.id);
                setEditing({
                  mediaType: item.mediaType,
                  ...(item.urlSafe && item.url ? { url: item.url } : {}),
                  caption: item.caption,
                  altText: item.altText,
                  sourceName: item.sourceName,
                  license: item.license,
                  status: item.status,
                });
              }}>Sửa</button>
            )}
            <button type="button"
              disabled={disabled || busy || item.mediaType !== 'image' || item.status !== 'active' || !item.urlSafe}
              onClick={() => void run(() => selectAdminEventThumbnail(eventId, item.id, version))}>
              Chọn thumbnail
            </button>
            <button type="button" disabled={disabled || busy} onClick={() => {
              if (window.confirm('Xóa media khỏi sự kiện?')) void run(() => removeAdminEventMedia(eventId, item.id, version));
            }}>Xóa khỏi sự kiện</button>
          </div>
        ))}
      </div>
      <form className="mt-5 grid gap-3 md:grid-cols-[8rem_1fr_auto]" onSubmit={event => {
        event.preventDefault();
        void run(async () => {
          const updated = await addAdminEventMedia(eventId, { ...form, expectedUpdatedAt: version });
          setForm(initialForm);
          return updated;
        });
      }}>
        <select value={form.mediaType} onChange={event => setForm(previous => ({ ...previous, mediaType: event.target.value as AdminEventMediaCreateRequest['mediaType'] }))} disabled={disabled || busy} aria-label="Loại media">
          <option value="image">image</option><option value="video">video</option><option value="document">document</option><option value="audio">audio</option>
        </select>
        <input required type="url" value={form.url} onChange={event => setForm(previous => ({ ...previous, url: event.target.value }))} disabled={disabled || busy} placeholder="https://..." aria-label="URL media" />
        <button type="submit" disabled={disabled || busy || media.length >= 200}>Thêm media</button>
      </form>
    </section>
  );
}
