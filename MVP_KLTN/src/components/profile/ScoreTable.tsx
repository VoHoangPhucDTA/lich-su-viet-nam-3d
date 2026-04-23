import type { ScoreRecord } from '../../data/mockLearningStats';

const difficultyConfig = {
  easy:   { label: 'Dễ',     color: '#10b981' },
  medium: { label: 'Trung bình', color: '#f59e0b' },
  hard:   { label: 'Khó',    color: '#ef4444' },
};
const categoryConfig = {
  military:  { label: 'Quân sự',       icon: '⚔️' },
  political: { label: 'Chính trị',     icon: '🏛️' },
  economic:  { label: 'Kinh tế',       icon: '💰' },
  cultural:  { label: 'Văn hoá – XH',  icon: '🎭' },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function ScoreCircle({ score }: { score: number }) {
  const color = score >= 8 ? '#10b981' : score >= 6.5 ? '#f59e0b' : '#ef4444';
  const pct = (score / 10) * 360;
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          width: '3rem',
          height: '3rem',
          borderRadius: '50%',
          background: `conic-gradient(${color} ${pct}deg, var(--border) 0deg)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: '2.2rem',
            height: '2.2rem',
            borderRadius: '50%',
            background: 'var(--bg-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.7rem',
            fontWeight: 800,
            color,
          }}
        >
          {score.toFixed(1)}
        </div>
      </div>
    </div>
  );
}

export default function ScoreTable({ scores }: { scores: ScoreRecord[] }) {
  if (scores.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📊</div>
        <p style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Chưa có bài thi nào</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
      {scores.map(s => {
        const diff = difficultyConfig[s.difficulty];
        const cat = categoryConfig[s.category];
        const pct = Math.round((s.correct / s.total) * 100);

        return (
          <div
            key={s.id}
            style={{
              background: 'var(--bg-app)',
              border: '1px solid var(--border)',
              borderRadius: '0.875rem',
              padding: '1rem 1.25rem',
              display: 'grid',
              gridTemplateColumns: '3.5rem 1fr auto',
              gap: '1rem',
              alignItems: 'center',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-surface)';
              (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent-soft)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-app)';
              (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
            }}
          >
            <ScoreCircle score={s.score} />

            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{s.title}</span>
                <span
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: s.type === 'exam' ? 'rgba(245,158,11,0.12)' : 'var(--accent-soft)',
                    color: s.type === 'exam' ? 'var(--warning)' : 'var(--accent)',
                    border: `1px solid ${s.type === 'exam' ? 'rgba(245,158,11,0.2)' : 'var(--accent)'}`,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {s.type === 'exam' ? 'Đề thi' : 'Trắc nghiệm'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{cat.icon} {cat.label}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>🎓 Lớp {s.grade}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>✅ {s.correct}/{s.total} ({pct}%)</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>⏱ {s.durationMinutes} phút</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>📅 {formatDate(s.date)}</span>
                <span
                  style={{
                    fontSize: '0.67rem',
                    fontWeight: 700,
                    color: diff.color,
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: `${diff.color}1a`,
                    border: `1px solid ${diff.color}22`,
                  }}
                >
                  {diff.label}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end', flexShrink: 0 }}>
              <button
                style={{
                  padding: '0.4rem 0.875rem',
                  borderRadius: '0.5rem',
                  background: 'var(--accent-soft)',
                  color: 'var(--accent)',
                  border: '1px solid var(--accent)',
                  opacity: 0.8,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontFamily: 'inherit',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.8')}
              >
                Xem chi tiết
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
