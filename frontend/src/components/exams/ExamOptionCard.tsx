import type { KeyboardEventHandler, Ref } from 'react';

interface ExamOptionCardProps {
  id: 'A' | 'B' | 'C' | 'D';
  text: string;
  selected: boolean;
  onClick: () => void;
  tabIndex?: number;
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
  buttonRef?: Ref<HTMLButtonElement>;
}

export default function ExamOptionCard({ id, text, selected, onClick, tabIndex, onKeyDown, buttonRef }: ExamOptionCardProps) {
  return (
    <button
      type="button"
      ref={buttonRef}
      role="radio"
      aria-checked={selected}
      aria-label={`Đáp án ${id}: ${text}${selected ? ', đang chọn' : ''}`}
      tabIndex={tabIndex}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className="exam-focusable"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '1rem',
        background: selected ? 'var(--exam-selection-soft)' : 'var(--bg-surface)',
        border: selected ? '2px solid var(--exam-selection)' : '2px solid var(--border)',
        borderRadius: '0.75rem',
        color: selected ? 'var(--exam-selection)' : 'var(--text-secondary)',
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
            e.currentTarget.style.borderColor = 'var(--exam-selection)';
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
          background: selected ? 'var(--exam-selection)' : 'var(--bg-surface)',
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
