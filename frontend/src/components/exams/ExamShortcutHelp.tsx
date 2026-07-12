import { useEffect, useId, useRef, type RefObject } from 'react';

export interface ExamShortcutItem {
  keyLabel: string;
  description: string;
}

interface ExamShortcutHelpProps {
  id: string;
  isOpen: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  shortcuts: ExamShortcutItem[];
}

export default function ExamShortcutHelp({ id, isOpen, onClose, triggerRef, shortcuts }: ExamShortcutHelpProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

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
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('keydown', handleKeyDown);
      if (trigger?.isConnected && trigger.offsetParent !== null) {
        trigger.focus();
      }
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  return (
    <div
      className="exam-shortcut-help-overlay"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        id={`${id}-dialog`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="exam-shortcut-help-dialog"
      >
        <div className="exam-shortcut-help-heading">
          <h2 id={titleId}>Phím tắt khi làm bài</h2>
          <button ref={closeButtonRef} type="button" className="exam-focusable" onClick={onClose} aria-label="Đóng hướng dẫn phím tắt">
            Đóng
          </button>
        </div>
        <dl className="exam-shortcut-help-list">
          {shortcuts.map((shortcut) => (
            <div key={shortcut.keyLabel}>
              <dt><kbd>{shortcut.keyLabel}</kbd></dt>
              <dd>{shortcut.description}</dd>
            </div>
          ))}
        </dl>
        <p id={descriptionId} className="exam-shortcut-help-note">
          Phím tắt không hoạt động khi bạn đang tập trung vào nút hoặc lựa chọn đáp án. Enter và Space vẫn kích hoạt điều khiển đang được chọn.
        </p>
      </div>
    </div>
  );
}
