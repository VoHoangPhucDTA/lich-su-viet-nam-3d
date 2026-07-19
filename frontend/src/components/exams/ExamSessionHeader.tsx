import { CircleHelp } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';
import ExamTimer from './ExamTimer';

interface ExamSessionHeaderProps {
  backLink: ReactNode;
  title: string;
  meta?: string;
  durationMinutes: number;
  currentIndex: number;
  totalQuestions: number;
  deadlineMs: number;
  isSubmitting: boolean;
  isShortcutHelpOpen: boolean;
  shortcutHelpId: string;
  shortcutHelpTriggerRef: RefObject<HTMLButtonElement | null>;
  onTimeUp: () => void;
  onSubmitRequest: () => void;
  onShortcutHelpRequest: () => void;
}

export default function ExamSessionHeader({
  backLink,
  title,
  meta,
  durationMinutes,
  currentIndex,
  totalQuestions,
  deadlineMs,
  isSubmitting,
  isShortcutHelpOpen,
  shortcutHelpId,
  shortcutHelpTriggerRef,
  onTimeUp,
  onSubmitRequest,
  onShortcutHelpRequest,
}: ExamSessionHeaderProps) {
  return (
    <header className="exam-session-header">
      {backLink}
      <strong className="exam-session-mobile-position">Câu {currentIndex + 1}/{totalQuestions}</strong>
      <div className="exam-session-title">
        <span title={title}>{title}</span>
        {meta && <span>{meta}</span>}
      </div>
      <div className="exam-session-actions">
        <span className="exam-session-mode-label">Thi thử {durationMinutes} phút</span>
        <ExamTimer deadlineMs={deadlineMs} onTimeUp={onTimeUp} />
        <button
          ref={shortcutHelpTriggerRef}
          id={shortcutHelpId}
          type="button"
          className="exam-focusable exam-shortcut-help-trigger"
          aria-expanded={isShortcutHelpOpen}
          aria-controls={`${shortcutHelpId}-dialog`}
          onClick={onShortcutHelpRequest}
        >
          <CircleHelp aria-hidden="true" size={16} />
          Hướng dẫn
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={onSubmitRequest}
          className="exam-focusable exam-session-submit-button"
        >
          {isSubmitting ? 'Đang nộp...' : 'Nộp bài'}
        </button>
      </div>
    </header>
  );
}
