import type { ExamQuestionStatus } from '../../types/exam';

interface NavigationProps {
  currentIndex: number;
  total: number;
  onNavigate: (index: number) => void;
  status: ExamQuestionStatus;
  onToggleFlag: () => void;
  onClearSelection: () => void;
  hasSelection: boolean;
  onSubmit?: () => void;
  isSubmitting?: boolean;
}

export default function ExamNavigation({ currentIndex, total, onNavigate, status, onToggleFlag, onClearSelection, hasSelection, onSubmit, isSubmitting = false }: NavigationProps) {
  const isFlagged = status === 'flagged';
  const isLastQuestion = currentIndex === total - 1;

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button 
              onClick={onClearSelection} 
              disabled={!hasSelection}
              style={{ padding: '0.6rem 1rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: '0.5rem', color: hasSelection ? 'var(--text-secondary)' : 'var(--text-muted)', cursor: hasSelection ? 'pointer' : 'not-allowed', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
                🧹 Xoá chọn
            </button>
            <button 
              onClick={onToggleFlag}
              style={{ padding: '0.6rem 1rem', background: isFlagged ? 'var(--warning-soft)' : 'transparent', border: isFlagged ? '1px solid var(--warning)' : '1px solid var(--border)', borderRadius: '0.5rem', color: isFlagged ? 'var(--warning)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', transition: 'all 0.15s' }}
            >
                🚩 {isFlagged ? 'Bỏ đánh dấu' : 'Xem lại sau'}
            </button>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              onClick={() => onNavigate(currentIndex - 1)}
              disabled={currentIndex === 0}
              style={{ padding: '0.6rem 1.25rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '0.5rem', color: currentIndex === 0 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: currentIndex === 0 ? 'not-allowed' : 'pointer', fontWeight: 600 }}
            >
                Câu trước
            </button>
            {isLastQuestion && onSubmit ? (
              <button
                type="button"
                onClick={onSubmit}
                disabled={isSubmitting}
                style={{ padding: '0.6rem 1.25rem', background: isSubmitting ? 'var(--text-muted)' : 'var(--accent)', border: '1px solid transparent', borderRadius: '0.5rem', color: '#fff', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 700 }}
              >
                {isSubmitting ? 'Đang nộp...' : 'Nộp bài'}
              </button>
            ) : (
              <button
                onClick={() => onNavigate(currentIndex + 1)}
                disabled={isLastQuestion}
                style={{ padding: '0.6rem 1.25rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '0.5rem', color: isLastQuestion ? 'var(--text-muted)' : 'var(--text-primary)', cursor: isLastQuestion ? 'not-allowed' : 'pointer', fontWeight: 600 }}
              >
                  Câu sau
              </button>
            )}
        </div>
    </div>
  );
}
