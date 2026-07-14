import { useEffect, useRef, type ReactNode } from 'react';

interface ExamAnswerSheetProps {
  id: string;
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  getCloseReason?: () => 'dismiss' | 'select-question';
  children: ReactNode;
}

export default function ExamAnswerSheet({ id, isOpen, onClose, triggerRef, getCloseReason, children }: ExamAnswerSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    const focusable = panel?.querySelector<HTMLElement>('button:not([disabled])');
    focusable?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled])'));
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (getCloseReason?.() !== 'select-question') trigger?.focus();
    };
  }, [getCloseReason, isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  return (
    <div className="exam-answer-sheet-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={panelRef} id={id} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} className="exam-answer-sheet-panel">
        <div className="exam-answer-sheet-header">
          <h2 id={`${id}-title`}>Phiếu trả lời</h2>
          <button type="button" onClick={onClose} aria-label="Đóng phiếu trả lời">Đóng</button>
        </div>
        {children}
      </div>
    </div>
  );
}
