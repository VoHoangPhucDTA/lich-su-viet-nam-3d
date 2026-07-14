import { CircleHelp } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';
import ExamBackLink from './ExamBackLink';

interface ExamPracticeHeaderProps {
  backTo: string;
  backLabel: string;
  mode: string;
  title: string;
  badge?: string;
  helpId: string;
  helpOpen: boolean;
  helpTriggerRef: RefObject<HTMLButtonElement | null>;
  onHelp: () => void;
  extra?: ReactNode;
}

export default function ExamPracticeHeader({ backTo, backLabel, mode, title, badge, helpId, helpOpen, helpTriggerRef, onHelp, extra }: ExamPracticeHeaderProps) {
  return (
    <header className="exam-practice-header">
      <ExamBackLink to={backTo}>{backLabel}</ExamBackLink>
      <div className="exam-practice-heading">
        <div><span className="exam-practice-mode">{mode}</span><h1>{title}</h1></div>
        {badge && <span className="exam-practice-badge">{badge}</span>}
        {extra}
        <button ref={helpTriggerRef} id={helpId} type="button" className="exam-focusable exam-shortcut-help-trigger" aria-label="Mở hướng dẫn làm bài" aria-expanded={helpOpen} aria-controls={`${helpId}-dialog`} onClick={onHelp}>
          <CircleHelp aria-hidden="true" size={17} /><span>Hướng dẫn</span>
        </button>
      </div>
    </header>
  );
}
