import type { LearningActivity } from '../../data/mockLearningStats';

const typeConfig = {
  view_event: { icon: '👁️', label: 'Xem sự kiện', color: '#4f6f95', bg: 'rgba(30,58,95,0.14)' },
  quiz:       { icon: '📝', label: 'Trắc nghiệm', color: '#2f7a57', bg: 'rgba(47,122,87,0.14)' },
  exam:       { icon: '📋', label: 'Đề thi',      color: '#c29b4b', bg: 'rgba(194,155,75,0.15)' },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 8 ? '#2f7a57' : score >= 6.5 ? '#c29b4b' : '#9f1d2d';
  return (
    <span
      style={{
        padding: '2px 10px',
        borderRadius: '9999px',
        background: `${color}1a`,
        color,
        border: `1px solid ${color}40`,
        fontSize: '0.75rem',
        fontWeight: 700,
      }}
    >
      {score.toFixed(1)} điểm
    </span>
  );
}

export default function ActivityList({ activities }: { activities: LearningActivity[] }) {
  if (activities.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '3rem 1rem',
          color: 'var(--text-muted)',
        }}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📭</div>
        <p style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Chưa có hoạt động nào</p>
        <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Hãy bắt đầu học để theo dõi tiến trình của bạn!</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
      {activities.map(a => {
        const cfg = typeConfig[a.type];
        return (
          <div
            key={a.id}
            style={{
              background: 'var(--bg-app)',
              border: '1px solid var(--border)',
              borderRadius: '0.75rem',
              padding: '0.875rem 1.125rem',
              display: 'grid',
              gridTemplateColumns: '2.5rem 1fr auto',
              gap: '0.875rem',
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
            {/* Icon */}
            <div
              style={{
                width: '2.5rem',
                height: '2.5rem',
                borderRadius: '0.625rem',
                background: cfg.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.1rem',
                flexShrink: 0,
              }}
            >
              {cfg.icon}
            </div>

            {/* Content */}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.title}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    color: cfg.color,
                    background: cfg.bg,
                    padding: '1px 6px',
                    borderRadius: '4px',
                    border: `1px solid ${cfg.color}33`,
                  }}
                >
                  {cfg.label}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>📚 {a.topic}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>🎓 Lớp {a.grade}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>⏱ {a.durationMinutes} phút</span>
              </div>
            </div>

            {/* Right */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem', flexShrink: 0 }}>
              {a.score !== undefined && <ScoreBadge score={a.score} />}
              {a.correct !== undefined && (
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {a.correct}/{a.total} câu đúng
                </span>
              )}
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', opacity: 0.8 }}>
                {formatDate(a.date)} · {formatTime(a.date)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
