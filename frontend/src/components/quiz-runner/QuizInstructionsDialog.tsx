import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import type { QuizShortcutItem } from '../../lib/exam/quizKeyboardShortcuts';

interface QuizInstructionsDialogProps {
  id: string;
  isOpen: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  shortcuts: QuizShortcutItem[];
  title?: string;
  description?: ReactNode;
  notes?: ReactNode;
}

export default function QuizInstructionsDialog({
  id,
  isOpen,
  onClose,
  triggerRef,
  shortcuts,
  title = 'Hướng dẫn làm bài',
  description,
  notes,
}: QuizInstructionsDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const notesId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const frameId = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const dialog = dialogRef.current;
    const trigger = triggerRef.current;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled])'));
      if (controls.length === 0) {
        event.preventDefault();
        return;
      }
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
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('keydown', handleKeyDown);
      if (trigger?.isConnected) trigger.focus();
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  return (
    <div
      className="exam-shortcut-help-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        id={`${id}-dialog`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={notes ? `${descriptionId} ${notesId}` : descriptionId}
        className="exam-shortcut-help-dialog"
      >
        <div className="exam-shortcut-help-heading">
          <h2 id={titleId}>{title}</h2>
          <button ref={closeButtonRef} type="button" className="exam-focusable" onClick={onClose} aria-label="Đóng hướng dẫn phím tắt">
            Đóng
          </button>
        </div>
        <div id={descriptionId} className="exam-shortcut-help-description">
          {description ?? 'Danh sách phím tắt dùng trong chế độ làm bài này.'}
        </div>
        <dl className="exam-shortcut-help-list">
          {shortcuts.map((shortcut) => (
            <div key={shortcut.keyLabel}>
              <dt><kbd>{shortcut.keyLabel}</kbd></dt>
              <dd>{shortcut.description}</dd>
            </div>
          ))}
        </dl>
        {notes && <div id={notesId} className="exam-shortcut-help-note">{notes}</div>}
      </div>
    </div>
  );
}
