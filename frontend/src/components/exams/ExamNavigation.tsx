import { Eraser, Flag } from 'lucide-react';
import type { QuestionDerivedState } from '@/lib/exam/questionState';
import type { ExamQuestionStatus } from '../../types/exam';

interface NavigationProps {
  currentIndex: number;
  total: number;
  onNavigate: (index: number) => void;
  questionState?: QuestionDerivedState;
  /** V1 legacy compatibility. V2 passes questionState instead. */
  status?: ExamQuestionStatus;
  onToggleFlag: () => void;
  onClearSelection: () => void;
  hasSelection: boolean;
  onSubmit?: () => void;
  isSubmitting?: boolean;
}

export default function ExamNavigation({ currentIndex, total, onNavigate, questionState, status, onToggleFlag, onClearSelection, hasSelection, onSubmit, isSubmitting = false }: NavigationProps) {
  const isFlagged = questionState?.isFlagged ?? status === 'flagged';
  const isLastQuestion = currentIndex === total - 1;

  return (
    <div className="exam-navigation-bar">
        <div className="exam-navigation-secondary-actions">
            <button 
              type="button"
              onClick={onClearSelection} 
              disabled={!hasSelection}
              className="exam-focusable exam-navigation-button"
            >
                <Eraser aria-hidden="true" size={16} /> Xoá chọn
            </button>
            <button 
              type="button"
              onClick={onToggleFlag}
              className={`exam-focusable exam-navigation-button exam-navigation-flag${isFlagged ? ' is-flagged' : ''}`}
            >
                <Flag aria-hidden="true" size={16} /> {isFlagged ? 'Bỏ đánh dấu' : 'Xem lại sau'}
            </button>
        </div>
        
        <div className="exam-navigation-primary-actions">
            <button 
              type="button"
              onClick={() => onNavigate(currentIndex - 1)}
              disabled={currentIndex === 0}
              className="exam-focusable exam-navigation-button"
            >
                Câu trước
            </button>
            {isLastQuestion && onSubmit ? (
              <button
                type="button"
                className="exam-focusable exam-navigation-button exam-navigation-submit"
                onClick={onSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Đang nộp...' : 'Nộp bài'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(currentIndex + 1)}
                disabled={isLastQuestion}
                className="exam-focusable exam-navigation-button"
              >
                  Câu sau
              </button>
            )}
        </div>
    </div>
  );
}
