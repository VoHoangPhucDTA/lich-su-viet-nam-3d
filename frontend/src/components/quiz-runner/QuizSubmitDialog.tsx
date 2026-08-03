import { FileCheck2, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useRef, type KeyboardEvent } from 'react';

export interface QuizSubmitSummary {
  total: number;
  completed: number;
  partial?: number;
  unanswered: number;
  flagged?: number;
}

interface QuizSubmitDialogProps {
  isOpen: boolean;
  summary: QuizSubmitSummary;
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  title?: string;
  cancelLabel?: string;
  confirmLabel?: string;
}

export default function QuizSubmitDialog({
  isOpen,
  summary,
  onConfirm,
  onCancel,
  isSubmitting = false,
  title = 'Xác nhận nộp bài',
  cancelLabel = 'Quay lại làm tiếp',
  confirmLabel = 'Xác nhận nộp',
}: QuizSubmitDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const confirmedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    confirmedRef.current = false;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frameId = window.requestAnimationFrame(() => cancelButtonRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(frameId);
      if (!confirmedRef.current && previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const safeSummary = {
    total: Math.max(0, summary.total),
    completed: Math.max(0, summary.completed),
    partial: Math.max(0, summary.partial ?? 0),
    unanswered: Math.max(0, summary.unanswered),
    flagged: Math.max(0, summary.flagged ?? 0),
  };

  function handleConfirm() {
    if (isSubmitting || confirmedRef.current) return;
    confirmedRef.current = true;
    onConfirm();
  }

  function handleCancel() {
    if (isSubmitting) return;
    confirmedRef.current = false;
    onCancel();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !isSubmitting) {
      event.preventDefault();
      handleCancel();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = [cancelButtonRef.current, confirmButtonRef.current]
      .filter((element): element is HTMLButtonElement => Boolean(element && !element.disabled));
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const description = safeSummary.partial > 0
    ? `Bạn còn ${safeSummary.partial} câu đang làm dở và ${safeSummary.unanswered} câu chưa làm. Bạn có chắc chắn muốn nộp bài ngay lúc này không?`
    : safeSummary.unanswered > 0
      ? `Bạn còn ${safeSummary.unanswered} câu chưa làm. Bạn vẫn có thể nộp bài hoặc quay lại kiểm tra.`
      : 'Bạn đã hoàn thành tất cả câu hỏi. Bạn có muốn nộp bài ngay?';

  return (
    <div
      className="quiz-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
        className="exam-submit-dialog"
      >
        <div className="exam-submit-dialog-icon">
          {safeSummary.unanswered > 0 || safeSummary.partial > 0
            ? <TriangleAlert aria-hidden="true" />
            : <FileCheck2 aria-hidden="true" />}
        </div>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        <dl className="exam-submit-breakdown">
          <div><dt>Tổng</dt><dd>{safeSummary.total}</dd></div>
          <div><dt>Hoàn thành</dt><dd className="is-complete">{safeSummary.completed}</dd></div>
          <div><dt>Đang làm dở</dt><dd className="is-partial">{safeSummary.partial}</dd></div>
          <div><dt>Chưa làm</dt><dd className="is-untouched">{safeSummary.unanswered}</dd></div>
          <div><dt>Đánh dấu</dt><dd className="is-flagged">{safeSummary.flagged}</dd></div>
        </dl>
        <div className="exam-submit-dialog-actions">
          <button
            ref={cancelButtonRef}
            type="button"
            disabled={isSubmitting}
            onClick={handleCancel}
            className="exam-focusable exam-submit-cancel"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            disabled={isSubmitting}
            onClick={handleConfirm}
            className="exam-focusable exam-submit-confirm"
          >
            {isSubmitting ? 'Đang nộp...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
