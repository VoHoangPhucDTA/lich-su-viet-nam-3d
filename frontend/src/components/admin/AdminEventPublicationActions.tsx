import { useEffect, useId, useRef, useState } from 'react';
import {
  updateAdminEventPublication,
  type AdminEvent,
  type AdminEventDetail,
  type AdminEventPublicationAction,
} from '../../services/adminApi';
import { ApiRequestError, type ApiIssue } from '../../services/apiClient';
import { AdminConfirmDialog } from './AdminUI';

type Props = {
  eventId: string;
  status: AdminEvent['status'];
  version: string;
  disabled?: boolean;
  disabledReason?: string;
  compact?: boolean;
  onUpdated: (detail: AdminEventDetail) => void;
  onBusyChange?: (busy: boolean) => void;
  onReload?: () => void;
  onIssueSelect?: (issue: ApiIssue) => void;
};

const actionLabels: Record<AdminEventPublicationAction, string> = {
  publish: 'Xuất bản',
  unpublish: 'Gỡ xuất bản',
  archive: 'Lưu trữ',
  restore: 'Khôi phục',
};

function actionsFor(status: AdminEvent['status']): AdminEventPublicationAction[] {
  if (status === 'draft') return ['publish', 'archive'];
  if (status === 'published') return ['unpublish', 'archive'];
  return ['restore'];
}

function confirmCopy(action: AdminEventPublicationAction) {
  if (action === 'unpublish') {
    return {
      title: 'Gỡ xuất bản sự kiện?',
      description: 'Sự kiện sẽ biến mất khỏi các trang công khai nhưng dữ liệu lịch sử được giữ nguyên.',
    };
  }
  return {
    title: 'Lưu trữ sự kiện?',
    description: 'Sự kiện sẽ bị ẩn khỏi nội dung công khai. Có thể khôi phục về bản nháp sau.',
  };
}

export default function AdminEventPublicationActions({
  eventId,
  status,
  version,
  disabled = false,
  disabledReason,
  compact = false,
  onUpdated,
  onBusyChange,
  onReload,
  onIssueSelect,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [issues, setIssues] = useState<ApiIssue[]>([]);
  const [conflict, setConflict] = useState(false);
  const [confirmation, setConfirmation] =
    useState<AdminEventPublicationAction | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const disabledReasonId = useId();

  useEffect(() => () => controllerRef.current?.abort(), []);

  const execute = async (action: AdminEventPublicationAction) => {
    if (disabled || busy) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    onBusyChange?.(true);
    setError('');
    setIssues([]);
    setConflict(false);
    try {
      const detail = await updateAdminEventPublication(
        eventId,
        { expectedUpdatedAt: version, action },
        controller.signal,
      );
      onUpdated(detail);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      if (cause instanceof ApiRequestError) {
        if (cause.code === 'EVENT_PUBLISH_BLOCKED') {
          setError('Sự kiện chưa đủ điều kiện xuất bản.');
          setIssues(cause.issues.filter(issue => issue.severity === 'ERROR'));
          return;
        }
        if (cause.code === 'EVENT_UPDATE_CONFLICT') {
          setConflict(true);
          setError('Sự kiện đã thay đổi ở nơi khác. Hãy tải lại và kiểm tra trước khi tiếp tục.');
          return;
        }
      }
      setError(cause instanceof Error ? cause.message : 'Không thể cập nhật trạng thái xuất bản.');
    } finally {
      controllerRef.current = null;
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  const requestAction = (action: AdminEventPublicationAction) => {
    if (action === 'unpublish' || action === 'archive') {
      setConfirmation(action);
    } else {
      void execute(action);
    }
  };

  return (
    <div className={compact ? 'min-w-44' : 'space-y-3'}>
      <div className="flex flex-wrap gap-2">
        {actionsFor(status).map(action => (
          <button
            key={action}
            type="button"
            disabled={disabled || busy}
            aria-describedby={disabled && disabledReason ? disabledReasonId : undefined}
            onClick={() => requestAction(action)}
            className={
              action === 'archive'
                ? 'admin-danger-button disabled:cursor-not-allowed disabled:opacity-50'
                : 'admin-secondary-button disabled:cursor-not-allowed disabled:opacity-50'
            }
          >
            {busy ? 'Đang xử lý…' : actionLabels[action]}
          </button>
        ))}
      </div>
      {disabled && disabledReason && (
        <p id={disabledReasonId} className="mt-2 text-xs text-[var(--text-muted)]">
          {disabledReason}
        </p>
      )}
      {error && (
        <div role="alert" className="mt-2 rounded-lg border border-[var(--accent)]/20 bg-[var(--danger-soft)] p-3 text-xs text-[var(--accent)]">
          <p>{error}</p>
          {issues.length > 0 && (
            <ul className="mt-2 space-y-1">
              {issues.map(issue => (
                <li key={`${issue.code}-${issue.section}`}>
                  <button
                    type="button"
                    className="text-left font-semibold underline"
                    onClick={() => onIssueSelect?.(issue)}
                  >
                    {issue.code} · {issue.fields.join(', ')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {conflict && onReload && (
            <button type="button" className="mt-2 font-semibold underline" onClick={onReload}>
              Tải lại để xem phiên bản mới
            </button>
          )}
        </div>
      )}
      <AdminConfirmDialog
        open={confirmation !== null}
        title={confirmation ? confirmCopy(confirmation).title : ''}
        description={confirmation ? confirmCopy(confirmation).description : undefined}
        confirmLabel={confirmation ? actionLabels[confirmation] : undefined}
        danger={confirmation === 'archive'}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          const action = confirmation;
          setConfirmation(null);
          if (action) void execute(action);
        }}
      />
    </div>
  );
}
