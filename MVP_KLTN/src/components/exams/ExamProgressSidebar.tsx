import type { ExamSession, ExamQuestionStatus } from '../../types/exam';

interface SidebarProps {
  session: ExamSession;
  currentIndex: number;
  onNavigate: (index: number) => void;
  questionStatuses: Record<string, ExamQuestionStatus>;
  answeredCount: number;
}

export default function ExamProgressSidebar({ session, currentIndex, onNavigate, questionStatuses, answeredCount }: SidebarProps) {
  const total = session.questions.length;
  const progressPercentage = total > 0 ? (answeredCount / total) * 100 : 0;

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1.25rem', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Progress Bar */}
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
                <span>Đã làm: {answeredCount}/{total}</span>
                <span style={{ color: 'var(--text-muted)' }}>Còn lại: {total - answeredCount}</span>
            </div>
            <div style={{ width: '100%', height: '0.5rem', background: 'var(--bg-surface)', borderRadius: '9999px', overflow: 'hidden' }}>
                <div style={{ width: `${progressPercentage}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s ease' }}></div>
            </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <div style={{ width: '0.8rem', height: '0.8rem', borderRadius: '0.2rem', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}></div> Chưa chọn
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <div style={{ width: '0.8rem', height: '0.8rem', borderRadius: '0.2rem', background: 'var(--accent)' }}></div> Đã làm
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <div style={{ width: '0.8rem', height: '0.8rem', borderRadius: '0.2rem', background: 'var(--accent-soft)', border: '1px solid var(--accent)' }}></div> Đang xem
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <div style={{ width: '0.8rem', height: '0.8rem', borderRadius: '0.2rem', background: 'var(--bg-surface)', border: '1px solid var(--warning)' }}></div> <span style={{ color: 'var(--warning)' }}>🚩 Xem lại</span>
            </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: 0 }} />

        {/* Question Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.4rem' }}>
            {session.questions.map((q, i) => {
                const status = questionStatuses[q.id] || 'unanswered';
                const isCurrent = i === currentIndex;
                const isFlagged = status === 'flagged';
                
                let bg = 'var(--bg-surface)';
                let border = '1px solid var(--border)';
                let color = 'var(--text-muted)';

                if (status === 'answered') {
                    bg = 'var(--accent)';
                    border = '1px solid var(--accent)';
                    color = '#fff';
                }

                if (isCurrent) {
                    border = '2px solid var(--accent)';
                    if (status !== 'answered') {
                        bg = 'var(--accent-soft)';
                        color = 'var(--accent)';
                    }
                }

                if (isFlagged) {
                    border = '2px solid var(--warning)';
                }

                return (
                    <button
                        key={q.id}
                        onClick={() => onNavigate(i)}
                        style={{
                            aspectRatio: '1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: bg,
                            border: border,
                            color: color,
                            borderRadius: '0.4rem',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            position: 'relative'
                        }}
                    >
                        {i + 1}
                        {isFlagged && (
                            <span style={{ position: 'absolute', top: '-0.3rem', right: '-0.3rem', fontSize: '0.7rem' }}>🚩</span>
                        )}
                    </button>
                );
            })}
        </div>
    </div>
  );
}
