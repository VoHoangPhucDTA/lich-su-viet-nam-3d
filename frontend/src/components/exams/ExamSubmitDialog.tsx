import { useEffect, useId, useRef, type KeyboardEvent } from 'react';

interface ExamSubmitDialogProps {
  unansweredCount: number;
  answeredCount?: number;
  totalQuestions?: number;
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isTimeUp?: boolean;
  isSubmitting?: boolean;
}

export default function ExamSubmitDialog({
  unansweredCount,
  answeredCount,
  totalQuestions,
  isOpen,
  onConfirm,
  onCancel,
  isTimeUp = false,
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
      (isTimeUp ? confirmButtonRef.current : cancelButtonRef.current)?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      if (!confirmedRef.current && previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen, isTimeUp]);

  if (!isOpen) return null;

  const safeUnansweredCount = Math.max(0, unansweredCount);
  const safeTotalQuestions = totalQuestions == null ? undefined : Math.max(0, totalQuestions);
  const safeAnsweredCount = answeredCount ?? (
    safeTotalQuestions == null ? undefined : Math.max(0, safeTotalQuestions - safeUnansweredCount)
  );

  function handleConfirm() {
    if (isSubmitting) return;
    confirmedRef.current = true;
    onConfirm();
  }

  function handleCancel() {
    if (isTimeUp || isSubmitting) return;
    confirmedRef.current = false;
    onCancel();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !isTimeUp && !isSubmitting) {
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
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1.25rem', padding: '2rem', maxWidth: '400px', width: '100%', boxShadow: 'var(--shadow)', textAlign: 'center' }}
        >
            
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
                {isTimeUp ? '⌛' : unansweredCount > 0 ? '⚠️' : '📝'}
            </div>
            
            <h2 id={titleId} style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', color: 'var(--text-primary)' }}>
                {isTimeUp ? 'Đã hết thời gian làm bài!' : 'Xác nhận nộp bài'}
            </h2>
            
            <p id={descriptionId} style={{ margin: '0 0 1.25rem 0', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {isTimeUp 
                  ? 'Hệ thống sẽ tự động nộp bài làm của bạn.' 
                  : unansweredCount > 0 
                    ? `Bạn vẫn còn ${unansweredCount} câu chưa trả lời. Bạn có chắc chắn muốn nộp bài ngay lúc này không?` 
                    : 'Bạn đã hoàn thành tất cả câu hỏi. Bạn có muốn nộp bài ngay?'}
            </p>

            {safeTotalQuestions != null && safeAnsweredCount != null && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1.5rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                <span>Tổng <strong style={{ display: 'block', color: 'var(--text-primary)', fontSize: '1rem' }}>{safeTotalQuestions}</strong></span>
                <span>Đã trả lời <strong style={{ display: 'block', color: 'var(--success)', fontSize: '1rem' }}>{safeAnsweredCount}</strong></span>
                <span>Còn trống <strong style={{ display: 'block', color: safeUnansweredCount > 0 ? 'var(--warning)' : 'var(--text-primary)', fontSize: '1rem' }}>{safeUnansweredCount}</strong></span>
              </div>
            )}
            
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                {!isTimeUp && (
                    <button 
                      ref={cancelButtonRef}
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleCancel}
                      className="exam-focusable"
                      style={{ flex: 1, padding: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: '0.5rem', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 700 }}
                    >
                        Quay lại làm tiếp
                    </button>
                )}
                <button 
                  ref={confirmButtonRef}
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleConfirm}
                  className="exam-focusable"
                  style={{ flex: 1, padding: '0.75rem', background: '#2f7a57', border: 'none', borderRadius: '0.5rem', color: '#fff', cursor: 'pointer', fontWeight: 600, boxShadow: '0 4px 6px -1px rgba(47,122,87,0.3)' }}
                >
                    {isSubmitting ? 'Đang nộp...' : isTimeUp ? 'Đồng ý nộp bài' : 'Xác nhận nộp'}
                </button>
            </div>
        </div>
    </div>
  );
}
