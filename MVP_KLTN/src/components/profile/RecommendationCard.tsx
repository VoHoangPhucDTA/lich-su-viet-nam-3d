import type { RecommendationItem } from '../../data/mockLearningStats';

const typeConfig = {
  review:    { label: 'Ôn tập',     color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.25)' },
  new:       { label: 'Mới',        color: '#10b981', bg: 'rgba(16,185,129,0.12)',   border: 'rgba(16,185,129,0.25)' },
  challenge: { label: 'Thử thách',  color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)',  border: 'rgba(139,92,246,0.25)' },
};

export default function RecommendationCard({ item }: { item: RecommendationItem }) {
  const cfg = typeConfig[item.type];
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: `1px solid var(--border)`,
        borderLeft: `3px solid ${cfg.color}`,
        borderRadius: '0.875rem',
        padding: '1.125rem 1.25rem',
        display: 'flex',
        gap: '1rem',
        alignItems: 'flex-start',
        transition: 'transform 0.18s, box-shadow 0.18s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.transform = '';
        (e.currentTarget as HTMLDivElement).style.boxShadow = '';
      }}
    >
      <div
        style={{
          fontSize: '1.5rem',
          width: '2.5rem',
          height: '2.5rem',
          borderRadius: '0.625rem',
          background: cfg.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {item.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>{item.title}</span>
          <span
            style={{
              fontSize: '0.65rem',
              fontWeight: 700,
              padding: '1px 7px',
              borderRadius: '9999px',
              background: cfg.bg,
              color: cfg.color,
              border: `1px solid ${cfg.border}`,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {cfg.label}
          </span>
        </div>
        <p style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginBottom: '0.5rem', lineHeight: 1.5 }}>
          {item.reason}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', opacity: 0.8 }}>📚 {item.topic}</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', opacity: 0.8 }}>⏱ ~{item.estimatedMinutes} phút</span>
        </div>
      </div>
      <button
        style={{
          padding: '0.4rem 0.875rem',
          borderRadius: '0.5rem',
          background: cfg.bg,
          color: cfg.color,
          border: `1px solid ${cfg.border}`,
          fontSize: '0.75rem',
          fontWeight: 700,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          transition: 'opacity 0.15s',
          fontFamily: 'inherit',
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      >
        Bắt đầu
      </button>
    </div>
  );
}
