import type { ExamSession } from '../../types/exam';

interface HeaderProps {
  session: ExamSession;
  onSubmitClick: () => void;
  children?: React.ReactNode; 
}

export default function ExamHeader({ session, onSubmitClick, children }: HeaderProps) {
  return (
    <header style={{ 
      height: '4rem', 
      background: 'var(--bg-card)', 
      borderBottom: '1px solid var(--border)', 
      backdropFilter: 'blur(10px)',
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between',
      padding: '0 1.5rem', 
      position: 'sticky', 
      top: 0, 
      zIndex: 50 
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
         <h1 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }}>
            {session.config.title}
         </h1>
         <span style={{ padding: '0.2rem 0.6rem', background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: '0.5rem', fontSize: '0.75rem', fontWeight: 600 }}>
            {session.config.mode === 'thpt_mock' ? 'Mô phỏng THPT' : session.config.mode === 'practice' ? 'Luyện tập' : 'Tùy chỉnh'}
         </span>
         <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>({session.questions.length} câu)</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
         {children} {/* Space for Timer */}
          <button onClick={onSubmitClick} style={{ padding: '0.6rem 1.2rem', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: '0.5rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 6px -1px var(--danger-soft)' }}>
             <span>📤</span> Nộp bài
          </button>
      </div>
    </header>
  );
}
