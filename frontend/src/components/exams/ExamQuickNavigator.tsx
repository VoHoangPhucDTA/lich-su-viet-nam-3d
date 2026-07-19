import { Check, Circle, Flag, X } from 'lucide-react';
import { useCallback, useId, useRef, useState } from 'react';
import ExamAnswerSheet from './ExamAnswerSheet';

export type QuickNavigatorState = 'untouched' | 'selected' | 'correct' | 'incorrect' | 'partial' | 'complete' | 'flagged';

export interface QuickNavigatorItem {
  id: string;
  label: string;
  state: QuickNavigatorState;
  flagged?: boolean;
}

interface ExamQuickNavigatorProps {
  items: QuickNavigatorItem[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

const STATE_LABELS: Record<QuickNavigatorState, string> = {
  untouched: 'chưa chọn',
  selected: 'đã chọn, chưa kiểm tra',
  correct: 'đã kiểm tra đúng',
  incorrect: 'đã kiểm tra sai',
  partial: 'đang làm dở',
  complete: 'đã hoàn thành',
  flagged: 'đã đánh dấu xem lại',
};

export default function ExamQuickNavigator({ items, currentIndex, onSelect }: ExamQuickNavigatorProps) {
  const [open, setOpen] = useState(false);
  const id = useId().replace(/:/g, '');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeReasonRef = useRef<'dismiss' | 'select-question'>('dismiss');
  const getCloseReason = useCallback(() => closeReasonRef.current, []);
  const close = useCallback(() => setOpen(false), []);
  const isAssessmentMode = items.some((item) => ['partial', 'complete'].includes(item.state) || item.flagged);

  function select(index: number) {
    closeReasonRef.current = 'select-question';
    onSelect(index);
    setOpen(false);
  }

  const navigator = (
    <div className="exam-quick-navigator" aria-label="Danh sách câu hỏi">
      <div className="exam-quick-navigator-grid">
        {items.map((item, index) => {
          const isCurrent = index === currentIndex;
          return (
            <button
              key={item.id}
              type="button"
              className={`exam-focusable exam-quick-navigator-button is-${item.state}`}
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={`Câu ${item.label}: ${STATE_LABELS[item.state]}${item.flagged ? ', đã đánh dấu xem lại' : ''}`}
              onClick={() => select(index)}
            >
              <span>{item.label}</span>
              {item.state === 'correct' && <Check aria-hidden="true" size={12} />}
              {item.state === 'incorrect' && <X aria-hidden="true" size={12} />}
              {item.state === 'selected' && <Circle aria-hidden="true" size={8} fill="currentColor" />}
              {item.flagged && <Flag aria-hidden="true" className="exam-quick-flag" size={11} />}
            </button>
          );
        })}
      </div>
      <div className="exam-quick-navigator-legend" aria-hidden="true">
        {isAssessmentMode ? (
          <>
            <span><i className="is-selected" />Hoàn thành</span>
            <span><i className="is-partial" />Làm dở</span>
            <span><i />Chưa làm</span>
            <span><Flag size={12} />Đánh dấu</span>
          </>
        ) : (
          <>
            <span><i className="is-selected" />Đã chọn</span>
            <span><Check size={12} />Đúng</span>
            <span><X size={12} />Sai</span>
            <span><i />Chưa chọn</span>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside className="exam-practice-sidebar">{navigator}</aside>
      <button
        ref={triggerRef}
        type="button"
        className="exam-focusable exam-practice-sheet-trigger"
        aria-expanded={open}
        aria-controls={`${id}-sheet`}
        onClick={() => {
          closeReasonRef.current = 'dismiss';
          setOpen(true);
        }}
      >
        Danh sách câu · {currentIndex + 1}/{items.length}
      </button>
      <ExamAnswerSheet id={`${id}-sheet`} isOpen={open} onClose={close} triggerRef={triggerRef} getCloseReason={getCloseReason}>
        {navigator}
      </ExamAnswerSheet>
    </>
  );
}
