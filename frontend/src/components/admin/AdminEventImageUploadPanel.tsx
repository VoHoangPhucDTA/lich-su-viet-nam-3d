import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  getAdminImageUploadCapability,
  uploadAdminEventImage,
  type AdminEventDetail,
  type AdminImageUploadCapability,
  type AdminEventImageKind,
} from '../../services/adminApi';
import { ApiRequestError } from '../../services/apiClient';
import { AdminActionButton } from './AdminUI';
import { useObjectUrlRegistry } from './useObjectUrlRegistry';

const DEFAULT_MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_QUEUE = 10;
const MEANINGFUL_ALT = /[\p{L}\p{N}]/u;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSION = /\.(?:jpe?g|png|webp)$/i;
let queueSequence = 0;

export type UploadStatus =
  | 'queued'
  | 'uploading'
  | 'succeeded'
  | 'validation_failed'
  | 'failed'
  | 'reconciliation_required';

const STATUS_LABEL: Record<UploadStatus, string> = {
  queued: 'Chờ tải',
  uploading: 'Đang tải',
  succeeded: 'Đã tải',
  validation_failed: 'Cần chỉnh sửa',
  failed: 'Không thành công',
  reconciliation_required: 'Cần tải lại dữ liệu',
};

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
  errorCode?: string;
  /**
   * The exact {@link ApiRequestError} instance captured when this item was
   * failed. We keep it alongside the human-friendly message so the queue
   * card can render an expandable violations list for the published-event
   * guard without re-parsing strings.
   */
  errorCause?: unknown;
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatFromName(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  if (!extension) return 'Ảnh';
  return extension.toUpperCase();
}

function fileError(file: File, maxBytes: number): string {
  if (file.size <= 0) return 'Tệp ảnh không được để trống.';
  if (file.size > maxBytes) return `Ảnh vượt quá giới hạn ${formatBytes(maxBytes)}.`;
  if (!ALLOWED_MIME.has(file.type) && !ALLOWED_EXTENSION.test(file.name)) {
    return 'Chỉ hỗ trợ tệp JPEG, PNG hoặc WebP.';
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

const PUBLISHED_GUARD_CODE = 'PUBLISHED_EVENT_WOULD_BECOME_INVALID';

const uploadMessages: Record<string, string> = {
  EVENT_IMAGE_FILE_REQUIRED: 'Hãy chọn một tệp ảnh.',
  EVENT_IMAGE_PAYLOAD_TOO_LARGE: 'Ảnh vượt quá giới hạn dung lượng.',
  EVENT_IMAGE_ALT_TEXT_REQUIRED: 'Nhập mô tả thay thế có ý nghĩa.',
  EVENT_IMAGE_METADATA_INVALID: 'Metadata ảnh không hợp lệ hoặc quá dài.',
  EVENT_IMAGE_UNSUPPORTED_FORMAT: 'Chỉ hỗ trợ JPEG, PNG hoặc WebP tĩnh.',
  EVENT_IMAGE_ANIMATED_UNSUPPORTED: 'Ảnh động không được hỗ trợ.',
  EVENT_IMAGE_INVALID_CONTENT: 'Tệp không phải ảnh hợp lệ hoặc đã bị hỏng.',
  EVENT_IMAGE_DIMENSIONS_TOO_LARGE: 'Kích thước ảnh vượt giới hạn máy chủ.',
  EVENT_IMAGE_UPLOAD_UNAVAILABLE: 'Dịch vụ lưu trữ ảnh hiện chưa sẵn sàng. Vui lòng thử lại sau.',
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
  // Diff-based guard outcome for managed image uploads. The button keeps
  // the original published-context wording because the guard never turns a
  // valid upload into an invalidating one — legacy-incomplete events can
  // still load, the only blocking case is when the upload itself introduces
  // a new ERROR code on a published event, which is exactly what the
  // friendly message lays out. Machine code remains in the technical
  // details expander so support engineers can correlate.
  PUBLISHED_EVENT_WOULD_BECOME_INVALID:
    'Sự kiện đang xuất bản chưa đáp ứng điều kiện cần thiết để ghi nhận ảnh mới. Hãy gỡ xuất bản, sửa các điều kiện rồi tải lại ảnh.',
};

function apiMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return uploadMessages[error.code] ?? 'Không thể tải ảnh. Vui lòng kiểm tra dữ liệu và thử lại.';
  }
  return 'Kết nối bị gián đoạn sau khi gửi ảnh. Không gửi lại trước khi tải lại dữ liệu.';
}

function apiErrorCode(error: unknown): string | undefined {
  return error instanceof ApiRequestError ? error.code : undefined;
}

type PublishedRequirement = {
  section: string;
  code: string;
  requirement: string;
  fields: string[];
};

function publishedGuardRequirements(error: unknown): PublishedRequirement[] {
  if (!(error instanceof ApiRequestError) || error.code !== PUBLISHED_GUARD_CODE) {
    return [];
  }
  if (!Array.isArray(error.issues) || error.issues.length === 0) {
    return [];
  }
  return error.issues.map(issue => ({
    section: issue.section,
    code: issue.code,
    requirement: requirementLabel(issue.code, issue.section),
    fields: [],
  }));
}

const REQUIREMENT_LABELS: Record<string, string> = {
  MISSING_CORE_CONTENT: 'Thiếu nội dung cốt lõi (tiêu đề, tóm tắt, nội dung, key facts)',
  INVALID_CORE_CONTENT: 'Nội dung cốt lõi không hợp lệ (key facts)',
  INVALID_THUMBNAIL: 'Ảnh đại diện có cấu hình không hợp lệ',
  MISSING_GEOGRAPHY: 'Thiếu dữ liệu địa lý',
  INVALID_GEOGRAPHY: 'Dữ liệu địa lý không hợp lệ',
  MISSING_MAP_DATA: 'Thiếu dữ liệu bản đồ',
  INVALID_MAP_DATA: 'Dữ liệu bản đồ không hợp lệ',
  INVALID_CHRONOLOGY: 'Niên đại sự kiện không hợp lệ',
  INVALID_CLASSIFICATION: 'Phân loại sự kiện không hợp lệ',
  INVALID_GRADES: 'Khối lớp không hợp lệ',
};

function requirementLabel(code: string, section: string): string {
  if (REQUIREMENT_LABELS[code]) return REQUIREMENT_LABELS[code];
  return `Yêu cầu ${section}/${code}`;
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
    <div className="grid gap-3 md:grid-cols-3">
      <label className="text-sm font-medium text-[var(--text-secondary)] md:col-span-3">
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
      {error && <p id={altErrorId} className="text-xs text-[var(--accent)] md:col-span-3">{error}</p>}
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

function FileDropZone({
  id,
  label,
  hint,
  multiple,
  accept,
  disabled,
  filesSelected,
  onFiles,
}: {
  id: string;
  label: string;
  hint: string;
  multiple?: boolean;
  accept: string;
  disabled: boolean;
  filesSelected: boolean;
  onFiles: (files: FileList | null) => void;
}) {
  const inputId = `${id}-input`;
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  };

  const onDragEnter = (event: DragEvent) => {
    if (disabled) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };

  const onDragOver = (event: DragEvent) => {
    if (disabled) return;
    event.preventDefault();
    setDragging(true);
  };

  const onDragLeave = (event: DragEvent) => {
    if (disabled) return;
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const onDrop = (event: DragEvent) => {
    if (disabled) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    onFiles(event.dataTransfer.files);
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-controls={inputId}
      onClick={openPicker}
      onKeyDown={onKeyDown}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`admin-dropzone${dragging ? ' admin-dropzone-dragging' : ''}${disabled ? ' admin-dropzone-disabled' : ''}${filesSelected ? ' admin-dropzone-has-files' : ''}`}
    >
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        disabled={disabled}
        // Only the role=button wrapper is in the tab order; the input stays
        // reachable for getByLabelText/upload tests and drag interactions.
        tabIndex={-1}
        aria-label={label}
        className="admin-dropzone-input"
        onChange={event => {
          onFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs text-[var(--text-muted)]">{hint}</span>
    </div>
  );
}

function FailedItemDetail({ item }: { item: QueueItem }) {
  const [open, setOpen] = useState(false);
  const requirements = publishedGuardRequirements(item.errorCause);
  const showMachineCode = !(item.errorCause instanceof ApiRequestError
    && item.errorCause.code === PUBLISHED_GUARD_CODE);
  return (
    <div className="mt-2 space-y-1">
      <p role="alert" className="text-xs text-[var(--accent)]">
        {item.error}
        {showMachineCode && item.errorCode && (
          <span className="ml-1 opacity-70">Mã lỗi: {item.errorCode}</span>
        )}
      </p>
      {requirements.length > 0 && (
        <details
          className="text-xs text-[var(--text-muted)]"
          data-testid="admin-published-guard-requirements"
          open={open}
          onToggle={event => setOpen(event.currentTarget.open)}
        >
          <summary className="cursor-pointer select-none font-semibold text-[var(--accent)]">
            Xem chi tiết ({requirements.length})
          </summary>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {requirements.map(req => (
              <li key={`${req.section}-${req.code}`}>
                <span className="font-semibold text-[var(--text-secondary)]">[{req.section}]</span>{' '}
                {req.requirement}
                <span className="ml-1 opacity-70">{req.code}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
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
  const [capability, setCapability] = useState<AdminImageUploadCapability | null>(null);
  const [capabilityState, setCapabilityState] = useState<'checking' | 'ready' | 'unavailable'>('checking');
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

  const checkCapability = useCallback(() => {
    setCapabilityState('checking');
    getAdminImageUploadCapability()
      .then(value => {
        if (!mounted.current) return;
        setCapability(value);
        setCapabilityState(value.uploadReady ? 'ready' : 'unavailable');
      })
      .catch(() => {
        // The capability endpoint itself may be unreachable (network/backend down).
        // Keep the UI usable; a real upload attempt will surface a mapped error.
        if (!mounted.current) return;
        setCapabilityState('ready');
      });
  }, []);

  useEffect(() => {
    checkCapability();
  }, [checkCapability]);

  const maxFileBytes = capability?.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;

  const dirty = Boolean(thumbnailFile)
    || queue.some(item => item.status !== 'succeeded');
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const currentThumbnail = detail.media.thumbnail;
  const succeededCount = queue.filter(item => item.status === 'succeeded').length;
  const failedCount = queue.filter(item => item.status === 'failed').length;
  const reconciliationCount = queue.filter(
    item => item.status === 'reconciliation_required',
  ).length;
  // `inFlightCount` lets the rendered indicators (spinner, counters, button
  // label) stay consistent even if the parent component re-renders the panel
  // while a request is still awaiting a final settlement. We derive this
  // purely from item state so the UI is always coherent with the queue.
  const inFlightCount = queue.filter(item => item.status === 'uploading').length;
  const queuedCount = queue.filter(item => item.status === 'queued').length;
  const uploadUnavailable = capabilityState === 'unavailable';
  const controlsDisabled = Boolean(disabled || busy || uploadUnavailable);

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
    if (uploadUnavailable) return;
    const file = files?.[0];
    if (!file) return;
    const error = fileError(file, maxFileBytes);
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
    const error = fileError(thumbnailFile, maxFileBytes) || metadataError(thumbnailMeta);
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
      if (error instanceof ApiRequestError && error.code === 'EVENT_IMAGE_UPLOAD_UNAVAILABLE') {
        setCapabilityState('unavailable');
      }
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
    if (uploadUnavailable) return;
    const selected = Array.from(files ?? []);
    if (!selected.length) return;
    if (queue.length + selected.length > MAX_QUEUE) {
      setSelectionError(`Mỗi hàng đợi chỉ được tối đa ${MAX_QUEUE} ảnh. Toàn bộ lựa chọn mới đã bị từ chối.`);
      return;
    }
    const additions = selected.map(file => {
      const id = queueId();
      const error = fileError(file, maxFileBytes);
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
        errorCode: undefined,
        errorCause: undefined,
      }
      : item));
  };

  const removeQueueItem = (id: string) => {
    setQueue(previous => previous.filter(item => item.id !== id));
    urls.revokeAfterDetach(id);
  };

  const validateQueueItem = (item: QueueItem) =>
    fileError(item.file, maxFileBytes) || metadataError(item);

  /**
   * Marks a single item as failed. Centralizing this keeps the {@code try /
   * finally} block of {@link #uploadItems} symmetric: the success path
   * updates {@code status='succeeded'}, the failure path here updates
   * {@code status='failed'} (or {@code 'reconciliation_required'}) — both end
   * up at the same post-state slots, so the {@code finally} block can
   * release {@code busy} in absolute confidence that item state is
   * already final.
   */
  const failItem = (id: string, error: unknown) => {
    const message = apiMessage(error);
    const code = apiErrorCode(error);
    const conflict = error instanceof ApiRequestError
      && error.code === 'EVENT_UPDATE_CONFLICT';
    const reconcile = conflict || requiresReconciliation(error);
    if (error instanceof ApiRequestError
        && error.code === 'EVENT_IMAGE_UPLOAD_UNAVAILABLE') {
      setCapabilityState('unavailable');
    }
    setQueue(previous => previous.map(item => item.id === id
      ? {
        ...item,
        status: reconcile ? 'reconciliation_required' : 'failed',
        error: message,
        errorCode: code,
        errorCause: error,
      }
      : item));
    if (reconcile) persistentBlock(message);
    else setActionError(message);
  };

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
    // Make sure `busy` is released EVEN if an unexpected exception escapes the
    // inner try-catch (e.g. error during setStatusMessage). The outer finally
    // handles release. We also avoid any silent fall-through by hard-coding
    // the `finally` to the very last statement.
    try {
      for (const target of targets) {
        if (stopAfterCurrent.current) break;
        setQueue(previous => previous.map(item => item.id === target.id
          ? { ...item, status: 'uploading', error: '', errorCode: undefined, errorCause: undefined } : item));
        setStatusMessage(`Đang tải ${target.file.name}…`);
        try {
          const response = await runUpload('gallery', target);
          if (!applyResponse(response)) {
            setQueue(previous => previous.map(item => item.id === target.id
              ? {
                ...item,
                status: 'reconciliation_required',
                error: 'Phiên bản response không nhất quán; cần tải lại dữ liệu.',
                errorCause: new ApiRequestError(
                  'EVENT_IMAGE_RESERVATION_INVALID', 'inconsistent-version', 409),
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
              errorCode: undefined,
              errorCause: undefined,
            } : item));
          urls.revokeAfterDetach(target.id);
          setStatusMessage('Đã tải ảnh lên thư viện.');
        } catch (error) {
          failItem(target.id, error);
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

  const capacityHint = `PNG, JPEG hoặc WebP tĩnh · tối đa ${formatBytes(maxFileBytes)}`;
  // Display label uses `inFlightCount` (queue-derived) rather than `busy`
  // so the spinner and counters mirror the true underlying state. If the
  // parent component re-renders while the request is still in flight the
  // `busy` boolean may briefly flip false before `finally` runs; deriving
  // from `inFlightCount` keeps the UI consistent.
  const batchRunning = inFlightCount > 0 && queuedCount > 0;
  const batchSpinnerActive = inFlightCount > 0;
  const successfulAfterFailure = succeededCount > 0 && queue.length === succeededCount + failedCount + reconciliationCount;
  // Fully settled batch state: every queue item ended in a terminal status
  // (succeeded/failed/reconciliation_required) and nothing is queued or in
  // flight. The spec calls for hiding the "Tải tất cả (N)" action entirely
  // and surfacing a final "X/Y ảnh đã tải thành công" label instead, so
  // operators don't see a disabled button that visually mimics an action in
  // progress. We keep the action visible while there is still work to do
  // (failed or queued items) and only collapse it once `failedCount===0`
  // AND `queuedCount===0` AND `inFlightCount===0`.
  const batchSettled = !batchRunning && queuedCount === 0 && inFlightCount === 0;
  const showBatchAction = !batchSettled || failedCount > 0 || reconciliationCount > 0;

  return (
    <div className="mt-5 space-y-5">
      <div role="status" aria-live="polite" aria-atomic="true" className="min-h-5 text-sm text-emerald-700">
        {statusMessage}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true" className="min-h-5 text-sm text-[var(--accent)]">
        {actionError}
      </div>

      {uploadUnavailable && (
        <div role="alert" className="rounded-xl border border-[var(--accent)]/25 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--accent)]">
          <p className="font-medium">Dịch vụ lưu trữ ảnh hiện chưa sẵn sàng. Vui lòng thử lại sau.</p>
          <p className="mt-1 text-xs opacity-80">Upload chỉ được mở khi backend đã bật tính năng và Cloudinary được cấu hình.</p>
          <button type="button" disabled={busy} onClick={checkCapability} className="mt-2 text-xs font-semibold underline">
            Thử lại trạng thái
          </button>
        </div>
      )}

      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4" aria-labelledby="admin-thumbnail-upload-title">
        <h3 id="admin-thumbnail-upload-title" className="font-semibold text-[var(--text-primary)]">Tải ảnh đại diện</h3>
        <p id="admin-thumbnail-help" className="mt-1 text-xs text-[var(--text-muted)]">
          {capacityHint}. Ảnh cũ vẫn là media thường cho đến khi xóa riêng.
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
            <FileDropZone
              id="admin-thumbnail"
              label="Chọn ảnh đại diện"
              hint={thumbnailFile
                ? `${thumbnailFile.name} · ${formatBytes(thumbnailFile.size)}`
                : 'Kéo thả hoặc bấm để chọn'}
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              disabled={controlsDisabled}
              filesSelected={Boolean(thumbnailFile)}
              onFiles={chooseThumbnail}
            />
          </div>
          <div>
            <UploadFields prefix="admin-thumbnail" value={thumbnailMeta}
              disabled={controlsDisabled} error={thumbnailError}
              onChange={value => { setThumbnailMeta(value); setThumbnailError(''); }} />
            <div className="mt-3 flex flex-wrap gap-2">
              <AdminActionButton type="button" variant="primary" pending={busy}
                disabled={controlsDisabled || !thumbnailFile}
                onClick={() => void uploadThumbnail()}>
                Tải lên làm ảnh đại diện
              </AdminActionButton>
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
          Thêm tối đa {MAX_QUEUE} ảnh cho sự kiện. {capacityHint}.
        </p>
        <div className="mt-3">
          <FileDropZone
            id="admin-gallery"
            label="Chọn ảnh thư viện"
            hint={queue.length
              ? `${queue.length} ảnh trong hàng đợi`
              : 'Kéo và thả ảnh vào đây hoặc bấm để chọn'}
            multiple
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            disabled={controlsDisabled}
            filesSelected={queue.length > 0}
            onFiles={chooseGallery}
          />
        </div>
        {selectionError && <p id="admin-gallery-selection-error" role="alert" className="mt-2 text-sm text-[var(--accent)]">{selectionError}</p>}

        {queue.length > 0 && (
          <ol className="mt-4 space-y-3">
            {queue.map(item => (
              <li key={item.id} className="admin-queue-card">
                <div className="min-w-0">
                  {item.previewUrl && (
                    <img src={item.previewUrl}
                      alt={item.previewLocal ? `Xem trước cục bộ: ${item.file.name}` : item.altText}
                      className="h-28 w-full rounded border border-[var(--border)] object-contain" />
                  )}
                  <p className="mt-1 truncate text-xs text-[var(--text-muted)]" title={item.file.name}>
                    {item.file.name}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {formatBytes(item.file.size)} · {formatFromName(item.file.name)}
                  </p>
                  <p className={`admin-upload-status admin-upload-status-${item.status} mt-1 text-xs font-semibold`}
                    data-status={item.status}>
                    {item.status === 'uploading' && batchSpinnerActive && (
                      <span className="admin-spinner" aria-hidden="true" />
                    )}
                    {STATUS_LABEL[item.status]}
                  </p>
                </div>
                <div>
                  <UploadFields prefix={`admin-gallery-${item.id}`} value={item}
                    disabled={controlsDisabled || item.status === 'succeeded'}
                    error={item.status === 'validation_failed' ? item.error : undefined}
                    onChange={value => changeQueueItem(item.id, value)} />
                  {item.status === 'failed' && item.error && (
                    <FailedItemDetail item={item} />
                  )}
                  {item.status === 'reconciliation_required' && item.error && (
                    <p role="alert" className="mt-2 text-xs text-[var(--accent)]">
                      {item.error}
                      {item.errorCode && <span className="ml-1 opacity-70">Mã lỗi: {item.errorCode}</span>}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.status !== 'succeeded' && (
                      <button type="button"
                        disabled={busy}
                        aria-label={`Bỏ ${item.file.name} khỏi hàng đợi`}
                        onClick={() => removeQueueItem(item.id)}>
                        Bỏ ảnh
                      </button>
                    )}
                    {item.status === 'failed' && (
                      <AdminActionButton type="button" variant="secondary"
                        pending={busy}
                        disabled={busy}
                        onClick={() => void uploadItems(item.id)}>
                        Thử lại ảnh này
                      </AdminActionButton>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2" data-testid="admin-gallery-toolbar">
          {showBatchAction && (
            <AdminActionButton type="button" variant="primary" pending={busy}
              disabled={controlsDisabled || remainingQueued === 0 || busy}
              onClick={() => void uploadItems()}>
              {batchRunning
                ? `Đang tải ${succeededCount + 1}/${queue.length || MAX_QUEUE} ảnh…`
                : `Tải tất cả (${remainingQueued})`}
            </AdminActionButton>
          )}
          {batchRunning && (
            <button type="button" onClick={() => { stopAfterCurrent.current = true; }}
              aria-label="Dừng sau ảnh hiện tại">
              Dừng sau ảnh hiện tại
            </button>
          )}
          {successfulAfterFailure && !busy && (
            <button type="button" disabled={Boolean(disabled)}
              onClick={() => setQueue(previous => previous.filter(item => item.status !== 'succeeded'))}>
              Dọn ảnh đã tải khỏi hàng đợi
            </button>
          )}
          {batchSettled && succeededCount > 0 && failedCount === 0 && (
            <span
              className="text-xs font-semibold text-emerald-700"
              data-testid="admin-gallery-settled-success"
              role="status"
              aria-live="polite"
            >
              {succeededCount}/{queue.length || succeededCount} ảnh đã tải thành công
            </span>
          )}
          {failedCount > 0 && !busy && (
            <span className="text-xs text-[var(--accent)]" data-testid="admin-gallery-failed-count">
              <span>
                {failedCount} ảnh không thành công ·{' '}
              </span>
              <button type="button" className="underline"
                onClick={() => setQueue(previous => previous.filter(item => item.status !== 'failed'))}>
                Xóa ảnh lỗi
              </button>
            </span>
          )}
          {queue.length > 0 && (
            <span className="text-xs text-[var(--text-muted)]" data-testid="admin-gallery-success-count">
              <span>
                {remainingQueued} ảnh chờ tải · {succeededCount}/{queue.length} đã tải thành công
              </span>
            </span>
          )}
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
