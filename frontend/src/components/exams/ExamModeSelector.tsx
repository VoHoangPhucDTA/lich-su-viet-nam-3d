import type { ExamMode } from '../../types/exam';

export function SelectionCard({ label, selected, onClick, icon = '' }: { label: string; selected: boolean; onClick: () => void; icon?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '0.75rem 1rem',
        background: selected ? 'var(--accent-soft)' : 'var(--bg-surface)',
        border: selected ? '2px solid var(--accent)' : '2px solid var(--border)',
        borderRadius: '0.75rem',
        color: selected ? 'var(--accent)' : 'var(--text-secondary)',
        fontWeight: selected ? 600 : 500,
        cursor: 'pointer',
        transition: 'all 0.15s',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontFamily: 'inherit'
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = 'var(--accent)'; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = 'var(--border)'; }}
    >
      {icon && <span>{icon}</span>}
      {label}
    </button>
  );
}

export default function ExamModeSelector({ mode, setMode }: { mode: ExamMode; setMode: (mode: ExamMode) => void }) {
  return (
    <section>
        <div style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.25rem 0', color: 'var(--text-primary)' }}>A. Chế độ đề</h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Mục đích của bài làm lần này</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <SelectionCard label="Luyện tập nhanh" selected={mode === 'practice'} onClick={() => setMode('practice')} icon="🏃" />
            <SelectionCard label="Mô phỏng THPT" selected={mode === 'thpt_mock'} onClick={() => setMode('thpt_mock')} icon="🎓" />
            <SelectionCard label="Tùy chỉnh" selected={mode === 'custom'} onClick={() => setMode('custom')} icon="⚙️" />
        </div>
    </section>
  );
}
