import { useEffect, useMemo, useRef, useState } from 'react';
import {
  uploadAdminEventImage,
  type AdminEventDetail,
  type AdminEventImageKind,
} from '../../services/adminApi';
import { ApiRequestError } from '../../services/apiClient';
import { useObjectUrlRegistry } from './useObjectUrlRegistry';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_QUEUE = 10;
const MEANINGFUL_ALT = /[\p{L}\p{N}]/u;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png']);
const ALLOWED_EXTENSION = /\.(?:jpe?g|png)$/i;
let queueSequence = 0;

export type UploadStatus =
  | 'queued'
  | 'uploading'
  | 'succeeded'
  | 'validation_failed'
  | 'failed'
  | 'reconciliation_required';

type UploadMetadata = {
  altText: string;
  caption: string;
  sourceName: string;
  license: string;
};

type QueueItem = UploadMetadata & {
  id: string;
  file: File;
  previewUrl: string;
  previewLocal: boolean;
  status: UploadStatus;
  error: string;
};

type Props = {
  eventId: string;
  detail: AdminEventDetail;
  version: string;
  disabled?: boolean;
  onUpdated: (detail: AdminEventDetail) => void;
  onPersistentBlock: (message: string) => void;
  onBusyChange?: (busy: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
};

const emptyMetadata: UploadMetadata = {
  altText: '',
  caption: '',
  sourceName: '',
  license: '',
};

function queueId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  queueSequence += 1;
  return `admin-image-${Date.now()}-${queueSequence}`;
}

function fileError(file: File): string {
  if (file.size <= 0) return 'Tệp ảnh không được để trống.';
  if (file.size > MAX_FILE_BYTES) return 'Ảnh vượt quá giới hạn 10 MiB.';
  if (!ALLOWED_MIME.has(file.type) && !ALLOWED_EXTENSION.test(file.name)) {
    return 'Chỉ hỗ trợ tệp JPEG hoặc PNG.';
  }
  return '';
}

function metadataError(metadata: UploadMetadata): string {
  const alt = metadata.altText.trim();
  if (!alt || !MEANINGFUL_ALT.test(alt)) return 'Nhập mô tả thay thế có ý nghĩa.';
  if (alt.length > 500) return 'Mô tả thay thế không được vượt quá 500 ký tự.';
  if (metadata.caption.trim().length > 1000) return 'Chú thích không được vượt quá 1000 ký tự.';
  if (metadata.sourceName.trim().length > 255) return 'Tên nguồn không được vượt quá 255 ký tự.';
  if (metadata.license.trim().length > 255) return 'Giấy phép không được vượt quá 255 ký tự.';
  return '';
}

const reconciliationCodes = new Set([
  'API_ERROR',
  'EVENT_IMAGE_FINALIZE_FAILED',
  'EVENT_IMAGE_RESERVATION_INVALID',
  'EVENT_IMAGE_RESERVATION_EXPIRED',
  'CSRF_TOKEN_INVALID',
  'UNAUTHENTICATED',
]);

const uploadMessages: Record<string, string> = {
  EVENT_IMAGE_FILE_REQUIRED: 'Hãy chọn một tệp ảnh.',
  EVENT_IMAGE_PAYLOAD_TOO_LARGE: 'Ảnh vượt quá giới hạn 10 MiB.',
  EVENT_IMAGE_ALT_TEXT_REQUIRED: 'Nhập mô tả thay thế có ý nghĩa.',
  EVENT_IMAGE_METADATA_INVALID: 'Metadata ảnh không hợp lệ hoặc quá dài.',
  EVENT_IMAGE_UNSUPPORTED_FORMAT: 'Chỉ hỗ trợ JPEG hoặc PNG tĩnh.',
  EVENT_IMAGE_ANIMATED_UNSUPPORTED: 'Ảnh động không được hỗ trợ.',
  EVENT_IMAGE_INVALID_CONTENT: 'Tệp không phải ảnh hợp lệ hoặc đã bị hỏng.',
  EVENT_IMAGE_DIMENSIONS_TOO_LARGE: 'Kích thước ảnh vượt giới hạn máy chủ.',
  EVENT_IMAGE_UPLOAD_UNAVAILABLE: 'Chức năng tải ảnh hiện chưa khả dụng.',
  EVENT_IMAGE_PROVIDER_UPLOAD_FAILED: 'Không thể tải ảnh lên dịch vụ lưu trữ. Hệ thống sẽ không tự gửi lại.',
  EVENT_IMAGE_PROVIDER_RESPONSE_INVALID: 'Dịch vụ lưu trữ trả về kết quả không hợp lệ.',
  EVENT_IMAGE_FINALIZE_FAILED: 'Ảnh có thể đã đến nơi lưu trữ. Hãy tải lại dữ liệu trước khi thao tác tiếp.',
  EVENT_IMAGE_RESERVATION_LIMIT_REACHED: 'Có quá nhiều ảnh đang được xử lý. Hãy đợi rồi thử lại.',
  EVENT_IMAGE_RESERVATION_INVALID: 'Trạng thái upload không còn xác định. Hãy tải lại dữ liệu.',
  EVENT_IMAGE_RESERVATION_EXPIRED: 'Phiên upload đã hết hạn và cần tải lại dữ liệu.',
  EVENT_MEDIA_LIMIT_REACHED: 'Sự kiện đã đạt giới hạn media.',
  EVENT_UPDATE_CONFLICT: 'Sự kiện đã thay đổi ở nơi khác. Hãy tải lại dữ liệu mới nhất.',
  UNSUPPORTED_MULTIPART_FIELD: 'Yêu cầu upload không đúng contract của máy chủ.',
  CSRF_TOKEN_INVALID: 'Phiên bảo mật không còn hợp lệ. Hãy tải lại trang.',
  UNAUTHENTICATED: 'Phiên đăng nhập đã hết hạn. Hãy tải lại và đăng nhập lại.',
  FORBIDDEN: 'Tài khoản không có quyền quản trị.',
};

function apiMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return uploadMessages[error.code] ?? 'Không thể tải ảnh. Vui lòng kiểm tra dữ liệu và thử lại.';
  }
  return 'Kết nối bị gián đoạn sau khi gửi ảnh. Không gửi lại trước khi tải lại dữ liệu.';
}

function requiresReconciliation(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (!(error instanceof ApiRequestError)) return true;
  return reconciliationCodes.has(error.code);
}

function UploadFields({
  prefix,
  value,
  disabled,
  error,
  onChange,
}: {
  prefix: string;
  value: UploadMetadata;
  disabled: boolean;
  error?: string;
  onChange: (value: UploadMetadata) => void;
}) {
  const altErrorId = `${prefix}-alt-error`;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-sm font-medium text-[var(--text-secondary)] md:col-span-2">
        Mô tả thay thế <span aria-hidden="true">*</span>
        <input
          required
          value={value.altText}
          maxLength={500}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? altErrorId : undefined}
          onChange={event => onChange({ ...value, altText: event.target.value })}
        />
      </label>
      {error && <p id={altErrorId} className="text-xs text-[var(--accent)] md:col-span-2">{error}</p>}
      <label className="text-sm text-[var(--text-secondary)]">
        Chú thích
        <input value={value.caption} maxLength={1000} disabled={disabled}
          onChange={event => onChange({ ...value, caption: event.target.value })} />
      </label>
      <label className="text-sm text-[var(--text-secondary)]">
        Nguồn
        <input value={value.sourceName} maxLength={255} disabled={disabled}
          onChange={event => onChange({ ...value, sourceName: event.target.value })} />
      </label>
      <label className="text-sm text-[var(--text-secondary)]">
        Giấy phép
        <input value={value.license} maxLength={255} disabled={disabled}
          onChange={event => onChange({ ...value, license: event.target.value })} />
      </label>
    </div>
  );
}

export default function AdminEventImageUploadPanel({
  eventId,
  detail,
  version,
  disabled,
  onUpdated,
  onPersistentBlock,
  onBusyChange,
  onDirtyChange,
}: Props) {
  const urls = useObjectUrlRegistry();
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState('');
  const [thumbnailMeta, setThumbnailMeta] = useState(emptyMetadata);
  const [thumbnailError, setThumbnailError] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectionError, setSelectionError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const stopAfterCurrent = useRef(false);
  const versionRef = useRef(version);
  const mounted = useRef(true);
  const onBusyRef = useRef(onBusyChange);

  useEffect(() => {
    if (!busy) versionRef.current = version;
  }, [busy, version]);

  useEffect(() => {
    onBusyRef.current = onBusyChange;
  }, [onBusyChange]);

  useEffect(() => () => {
    mounted.current = false;
    onBusyRef.current?.(false);
  }, []);

  const dirty = Boolean(thumbnailFile)
    || queue.some(item => item.status !== 'succeeded');
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const currentThumbnail = detail.media.thumbnail;
  const queuedCount = queue.filter(item => item.status !== 'succeeded').length;
  const controlsDisabled = Boolean(disabled || busy);

  const persistentBlock = (message: string) => {
    setActionError(message);
    onPersistentBlock(message);
  };

  const applyResponse = (
    response: Awaited<ReturnType<typeof uploadAdminEventImage>>,
  ): string | null => {
    const nestedVersion = response.event.publication.updatedAt;
    if (response.updatedAt !== nestedVersion) {
      persistentBlock(
        'Máy chủ trả về hai phiên bản sự kiện không nhất quán. Hãy tải lại dữ liệu trước khi thao tác tiếp.',
      );
      return null;
    }
    versionRef.current = response.updatedAt;
    onUpdated(response.event);
    return response.updatedAt;
  };

  const runUpload = async (
    kind: AdminEventImageKind,
    item: { file: File } & UploadMetadata,
    signal?: AbortSignal,
  ) => uploadAdminEventImage(eventId, {
    ...item,
    expectedUpdatedAt: versionRef.current,
    kind,
    altText: item.altText.trim(),
  }, signal);

  const chooseThumbnail = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const error = fileError(file);
    if (error) {
      setThumbnailError(error);
      return;
    }
    const preview = urls.create('thumbnail', file);
    setThumbnailFile(file);
    setThumbnailPreview(preview);
    setThumbnailError('');
    setActionError('');
  };

  const resetThumbnail = () => {
    setThumbnailFile(null);
    setThumbnailPreview('');
    setThumbnailMeta(emptyMetadata);
    setThumbnailError('');
    urls.revokeAfterDetach('thumbnail');
  };

  const uploadThumbnail = async () => {
    if (!thumbnailFile || controlsDisabled) return;
    const error = fileError(thumbnailFile) || metadataError(thumbnailMeta);
    if (error) {
      setThumbnailError(error);
      return;
    }
    setBusy(true);
    onBusyChange?.(true);
    setActionError('');
    setStatusMessage('Đang tải ảnh đại diện…');
    try {
      const response = await runUpload('thumbnail', { file: thumbnailFile, ...thumbnailMeta });
      if (!applyResponse(response)) {
        setThumbnailError('Cần tải lại dữ liệu trước khi tiếp tục.');
        return;
      }
      resetThumbnail();
      setStatusMessage('Đã tải ảnh đại diện. Ảnh đại diện trước vẫn là một media thường.');
    } catch (error) {
      const message = apiMessage(error);
      setThumbnailError(message);
      if (
        requiresReconciliation(error)
        || (error instanceof ApiRequestError && error.code === 'EVENT_UPDATE_CONFLICT')
      ) {
        persistentBlock(message);
      }
    } finally {
      if (mounted.current) setBusy(false);
      onBusyChange?.(false);
    }
  };

  const chooseGallery = (files: FileList | null) => {
    const selected = Array.from(files ?? []);
    if (!selected.length) return;
    if (queue.length + selected.length > MAX_QUEUE) {
      setSelectionError(`Mỗi hàng đợi chỉ được tối đa ${MAX_QUEUE} ảnh. Toàn bộ lựa chọn mới đã bị từ chối.`);
      return;
    }
    const additions = selected.map(file => {
      const id = queueId();
      const error = fileError(file);
      return {
        id,
        file,
        previewUrl: urls.create(id, file),
        previewLocal: true,
        ...emptyMetadata,
        status: error ? 'validation_failed' as const : 'queued' as const,
        error,
      };
    });
    setQueue(previous => [...previous, ...additions]);
    setSelectionError('');
    setActionError('');
  };

  const changeQueueItem = (id: string, metadata: UploadMetadata) => {
    setQueue(previous => previous.map(item => item.id === id
      ? {
        ...item,
        ...metadata,
        status: item.status === 'validation_failed' || item.status === 'failed'
          ? 'queued' : item.status,
        error: '',
      }
      : item));
  };

  const removeQueueItem = (id: string) => {
    setQueue(previous => previous.filter(item => item.id !== id));
    urls.revokeAfterDetach(id);
  };

  const validateQueueItem = (item: QueueItem) => fileError(item.file) || metadataError(item);

  const uploadItems = async (onlyId?: string) => {
    if (controlsDisabled) return;
    const targets = queue.filter(item => onlyId
      ? item.id === onlyId && item.status === 'failed'
      : item.status === 'queued');
    if (!targets.length) return;

    let invalid = false;
    setQueue(previous => previous.map(item => {
      if (!targets.some(target => target.id === item.id)) return item;
      const error = validateQueueItem(item);
      if (!error) return item;
      invalid = true;
      return { ...item, status: 'validation_failed', error };
    }));
    if (invalid) {
      setActionError('Hãy sửa các ảnh có lỗi trước khi bắt đầu upload.');
      return;
    }

    stopAfterCurrent.current = false;
    setBusy(true);
    onBusyChange?.(true);
    setActionError('');
    try {
      for (const target of targets) {
        if (stopAfterCurrent.current) break;
        setQueue(previous => previous.map(item => item.id === target.id
          ? { ...item, status: 'uploading', error: '' } : item));
        setStatusMessage(`Đang tải ${target.file.name}…`);
        try {
          const response = await runUpload('gallery', target);
          if (!applyResponse(response)) {
            setQueue(previous => previous.map(item => item.id === target.id
              ? {
                ...item,
                status: 'reconciliation_required',
                error: 'Phiên bản response không nhất quán; cần tải lại dữ liệu.',
              } : item));
            break;
          }
          const serverUrl = response.event.media.items
            .find(item => item.id === response.mediaId)?.url ?? '';
          setQueue(previous => previous.map(item => item.id === target.id
            ? {
              ...item,
              status: 'succeeded',
              previewUrl: serverUrl,
              previewLocal: false,
              error: '',
            } : item));
          urls.revokeAfterDetach(target.id);
          setStatusMessage(`Đã tải ${target.file.name}.`);
        } catch (error) {
          const message = apiMessage(error);
          const conflict = error instanceof ApiRequestError && error.code === 'EVENT_UPDATE_CONFLICT';
          const reconcile = conflict || requiresReconciliation(error);
          setQueue(previous => previous.map(item => item.id === target.id
            ? {
              ...item,
              status: reconcile ? 'reconciliation_required' : 'failed',
              error: message,
            } : item));
          if (reconcile) persistentBlock(message);
          else setActionError(message);
          break;
        }
      }
    } finally {
      if (mounted.current) setBusy(false);
      onBusyChange?.(false);
    }
  };

  const remainingQueued = useMemo(
    () => queue.filter(item => item.status === 'queued').length,
    [queue],
  );

  return (
    <div className="mt-5 space-y-5">
      <div role="status" aria-live="polite" aria-atomic="true" className="min-h-5 text-sm text-emerald-700">
        {statusMessage}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true" className="min-h-5 text-sm text-[var(--accent)]">
        {actionError}
      </div>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4" aria-labelledby="admin-thumbnail-upload-title">
        <h3 id="admin-thumbnail-upload-title" className="font-semibold text-[var(--text-primary)]">Tải ảnh đại diện</h3>
        <p id="admin-thumbnail-help" className="mt-1 text-xs text-[var(--text-muted)]">
          JPEG hoặc PNG tĩnh, tối đa 10 MiB. Ảnh cũ vẫn là media thường cho đến khi xóa riêng.
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-[12rem_1fr]">
          <div className="space-y-2">
            {(thumbnailPreview || currentThumbnail?.url) && (
              <img
                src={thumbnailPreview || currentThumbnail?.url}
                alt={thumbnailPreview && thumbnailFile
                  ? `Xem trước cục bộ: ${thumbnailFile.name}`
                  : currentThumbnail?.altText ?? 'Ảnh đại diện hiện tại'}
                className="h-36 w-full rounded-lg border border-[var(--border)] object-contain"
              />
            )}
            <label className="block text-sm font-medium text-[var(--text-secondary)]">
              Chọn ảnh đại diện
              <input
                type="file"
                accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                disabled={controlsDisabled}
                aria-describedby="admin-thumbnail-help"
                onChange={event => {
                  chooseThumbnail(event.target.files);
                  event.target.value = '';
                }}
              />
            </label>
          </div>
          <div>
            <UploadFields prefix="admin-thumbnail" value={thumbnailMeta}
              disabled={controlsDisabled} error={thumbnailError}
              onChange={value => { setThumbnailMeta(value); setThumbnailError(''); }} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="admin-primary-button"
                disabled={controlsDisabled || !thumbnailFile}
                onClick={() => void uploadThumbnail()}>
                Tải lên làm ảnh đại diện
              </button>
              {thumbnailFile && (
                <button type="button" disabled={controlsDisabled} onClick={resetThumbnail}>
                  Bỏ ảnh đã chọn
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4" aria-labelledby="admin-gallery-upload-title">
        <h3 id="admin-gallery-upload-title" className="font-semibold text-[var(--text-primary)]">Tải ảnh thư viện</h3>
        <p id="admin-gallery-help" className="mt-1 text-xs text-[var(--text-muted)]">
          Chọn tối đa 10 ảnh cho một hàng đợi. Ảnh chỉ được gửi khi bạn bấm bắt đầu.
        </p>
        <label className="mt-3 block text-sm font-medium text-[var(--text-secondary)]">
          Chọn ảnh thư viện
          <input type="file" multiple accept=".jpg,.jpeg,.png,image/jpeg,image/png"
            disabled={controlsDisabled}
            aria-describedby={`admin-gallery-help${selectionError ? ' admin-gallery-selection-error' : ''}`}
            aria-invalid={Boolean(selectionError)}
            onChange={event => {
              chooseGallery(event.target.files);
              event.target.value = '';
            }} />
        </label>
        {selectionError && <p id="admin-gallery-selection-error" className="mt-2 text-sm text-[var(--accent)]">{selectionError}</p>}

        <ol className="mt-4 space-y-3">
          {queue.map(item => (
            <li key={item.id} className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 lg:grid-cols-[10rem_1fr]">
              <div className="min-w-0">
                {item.previewUrl && (
                  <img src={item.previewUrl}
                    alt={item.previewLocal ? `Xem trước cục bộ: ${item.file.name}` : item.altText}
                    className="h-28 w-full rounded object-contain" />
                )}
                <p className="mt-1 break-all text-xs text-[var(--text-muted)]">{item.file.name}</p>
                <p className="text-xs font-semibold" data-status={item.status}>{item.status}</p>
              </div>
              <div>
                <UploadFields prefix={`admin-gallery-${item.id}`} value={item}
                  disabled={controlsDisabled || item.status === 'succeeded'}
                  error={item.error}
                  onChange={value => changeQueueItem(item.id, value)} />
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.status !== 'succeeded' && (
                    <button type="button" disabled={controlsDisabled}
                      aria-label={`Bỏ ${item.file.name} khỏi hàng đợi`}
                      onClick={() => removeQueueItem(item.id)}>
                      Bỏ ảnh
                    </button>
                  )}
                  {item.status === 'failed' && (
                    <button type="button" disabled={controlsDisabled}
                      onClick={() => void uploadItems(item.id)}>
                      Thử lại ảnh này
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" className="admin-primary-button"
            disabled={controlsDisabled || remainingQueued === 0}
            onClick={() => void uploadItems()}>
            Tải lần lượt ảnh đang chờ
          </button>
          {busy && (
            <button type="button" onClick={() => { stopAfterCurrent.current = true; }}>
              Dừng sau ảnh hiện tại
            </button>
          )}
          {queue.some(item => item.status === 'succeeded') && !busy && (
            <button type="button" disabled={Boolean(disabled)}
              onClick={() => setQueue(previous => previous.filter(item => item.status !== 'succeeded'))}>
              Dọn ảnh đã tải khỏi hàng đợi
            </button>
          )}
          <span className="text-xs text-[var(--text-muted)]">
            {queuedCount}/{MAX_QUEUE} ảnh chưa hoàn tất
          </span>
        </div>
        {(disabled || busy) && (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Các thao tác sự kiện khác bị khóa trong khi upload hoặc đang chờ tải lại dữ liệu.
          </p>
        )}
      </section>
    </div>
  );
}
