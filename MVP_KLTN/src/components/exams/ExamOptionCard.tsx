interface ExamOptionCardProps {
  id: 'A' | 'B' | 'C' | 'D';
  text: string;
  selected: boolean;
  onClick: () => void;
}

export default function ExamOptionCard({ id, text, selected, onClick }: ExamOptionCardProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '1rem',
        background: selected ? 'var(--accent-soft)' : 'var(--bg-surface)',
        border: selected ? '2px solid var(--accent)' : '2px solid var(--border)',
        borderRadius: '0.75rem',
        color: selected ? 'var(--accent)' : 'var(--text-secondary)',
        cursor: 'pointer',
        transition: 'all 0.15s',
        textAlign: 'left',
        width: '100%',
        fontFamily: 'inherit',
        fontSize: '1rem'
      }}
      onMouseEnter={e => {
        if (!selected) {
            e.currentTarget.style.background = 'var(--bg-surface)';
            e.currentTarget.style.borderColor = 'var(--accent)';
        }
      }}
      onMouseLeave={e => {
        if (!selected) {
            e.currentTarget.style.background = 'var(--bg-surface)';
            e.currentTarget.style.borderColor = 'var(--border)';
        }
      }}
    >
      <div style={{
          width: '2.5rem',
          height: '2.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: selected ? 'var(--accent)' : 'var(--bg-surface)',
          color: selected ? '#fff' : 'var(--text-secondary)',
          borderRadius: '50%',
          border: selected ? 'none' : '1px solid var(--border)',
          fontWeight: 700,
          flexShrink: 0
      }}>
          {id}
      </div>
      <div style={{ flex: 1, lineHeight: 1.5 }}>
          {text}
      </div>
    </button>
  );
}
