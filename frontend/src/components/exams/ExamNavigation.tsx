import type { ExamQuestionStatus } from '../../types/exam';

interface NavigationProps {
  currentIndex: number;
  total: number;
  onNavigate: (index: number) => void;
  status: ExamQuestionStatus;
  onToggleFlag: () => void;
  onClearSelection: () => void;
  hasSelection: boolean;
}

export default function ExamNavigation({ currentIndex, total, onNavigate, status, onToggleFlag, onClearSelection, hasSelection }: NavigationProps) {
  const isFlagged = status === 'flagged';

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
            <button 
              onClick={() => onNavigate(currentIndex + 1)}
              disabled={currentIndex === total - 1}
              style={{ padding: '0.6rem 1.25rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '0.5rem', color: currentIndex === total - 1 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: currentIndex === total - 1 ? 'not-allowed' : 'pointer', fontWeight: 600 }}
            >
                Câu sau
            </button>
        </div>
    </div>
  );
}
