import { FileCheck2, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useRef, type KeyboardEvent } from 'react';

interface ExamSubmitDialogProps {
  unansweredCount?: number;
  answeredCount?: number;
  totalQuestions?: number;
  completedCount?: number;
  partialCount?: number;
  untouchedCount?: number;
  flaggedCount?: number;
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export default function ExamSubmitDialog({
  unansweredCount,
  answeredCount,
  totalQuestions,
  completedCount,
  partialCount = 0,
  untouchedCount,
  flaggedCount = 0,
  isOpen,
  onConfirm,
  onCancel,
  isSubmitting = false,
}: ExamSubmitDialogProps) {
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
    const frameId = window.requestAnimationFrame(() => {
      cancelButtonRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      if (!confirmedRef.current && previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const safeUnansweredCount = Math.max(0, unansweredCount ?? untouchedCount ?? 0);
  const safeTotalQuestions = totalQuestions == null ? undefined : Math.max(0, totalQuestions);
  const safeAnsweredCount = completedCount ?? answeredCount ?? (
    safeTotalQuestions == null ? undefined : Math.max(0, safeTotalQuestions - safeUnansweredCount)
  );

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

  return (
    <div
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleCancel();
      }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}
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
                {safeUnansweredCount > 0 || partialCount > 0 ? <TriangleAlert aria-hidden="true" /> : <FileCheck2 aria-hidden="true" />}
            </div>
            
            <h2 id={titleId} style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', color: 'var(--text-primary)' }}>
                Xác nhận nộp bài
            </h2>
            
            <p id={descriptionId} style={{ margin: '0 0 1.25rem 0', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {partialCount > 0
                    ? `Bạn còn ${partialCount} câu đang làm dở và ${safeUnansweredCount} câu chưa làm. Bạn có chắc chắn muốn nộp bài ngay lúc này không?`
                    : safeUnansweredCount > 0
                      ? `Bạn còn ${safeUnansweredCount} câu chưa làm. Bạn có chắc chắn muốn nộp bài ngay lúc này không?`
                      : 'Bạn đã hoàn thành tất cả câu hỏi. Bạn có muốn nộp bài ngay?'}
            </p>

            {safeTotalQuestions != null && safeAnsweredCount != null && (
              <dl className="exam-submit-breakdown">
                <div><dt>Tổng</dt><dd>{safeTotalQuestions}</dd></div>
                <div><dt>Hoàn thành</dt><dd className="is-complete">{safeAnsweredCount}</dd></div>
                <div><dt>Đang làm dở</dt><dd className="is-partial">{partialCount}</dd></div>
                <div><dt>Chưa làm</dt><dd className="is-untouched">{safeUnansweredCount}</dd></div>
                <div><dt>Đánh dấu</dt><dd className="is-flagged">{flaggedCount}</dd></div>
              </dl>
            )}
            
            <div className="exam-submit-dialog-actions">
                {(
                    <button 
                      ref={cancelButtonRef}
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleCancel}
                      className="exam-focusable exam-submit-cancel"
                    >
                        Quay lại làm tiếp
                    </button>
                )}
                <button 
                  ref={confirmButtonRef}
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleConfirm}
                  className="exam-focusable exam-submit-confirm"
                >
                    {isSubmitting ? 'Đang nộp...' : 'Xác nhận nộp'}
                </button>
            </div>
        </div>
    </div>
  );
}
