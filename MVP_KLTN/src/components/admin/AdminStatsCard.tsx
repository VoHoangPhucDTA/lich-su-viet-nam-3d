// ─── AdminStatsCard ──────────────────────────────────────────────────────────

interface AdminStatsCardProps {
  icon: string | React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  badge?: { text: string; color: string };
}

export default function AdminStatsCard({
  icon, label, value, sub, color = '#4f6f95', badge,
}: AdminStatsCardProps) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '1rem',
        padding: '1.25rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        position: 'relative',
        overflow: 'hidden',
        transition: 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.18s ease',
        cursor: 'default',
        boxShadow: 'var(--shadow)',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 12px 30px rgba(0,0,0,0.2)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.transform = '';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow)';
      }}
    >
      {/* Background accent */}
      <div
        style={{
          position: 'absolute',
          top: '-30px',
          right: '-30px',
          width: '100px',
          height: '100px',
          borderRadius: '50%',
          background: color,
          opacity: 0.1,
          filter: 'blur(20px)',
          pointerEvents: 'none',
        }}
      />

      {/* Icon */}
      <div
        style={{
          width: '3.25rem',
          height: '3.25rem',
          borderRadius: '1rem',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.5rem',
          flexShrink: 0,
          color: color,
        }}
      >
        <div style={{ position: 'absolute', inset: 0, background: color, opacity: 0.12, borderRadius: '1rem', border: `1px solid ${color}` }} />
        <span style={{ position: 'relative', zIndex: 1 }}>
            {icon === 'MAP' ? '🗺️' : icon === 'QUIZ' ? '📝' : icon === '?' ? '❓' : icon}
        </span>
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.25rem' }}>
          {label}
        </div>
        <div
          style={{
            fontSize: '1.75rem',
            fontWeight: 900,
            color: 'var(--text-primary)',
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
          }}
        >
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem', fontWeight: 600, opacity: 0.8 }}>{sub}</div>
        )}
      </div>

      {badge && (
        <span
          style={{
            padding: '2px 10px',
            borderRadius: '9999px',
            fontSize: '0.68rem',
            fontWeight: 800,
            position: 'relative',
            color: badge.color,
            flexShrink: 0,
            alignSelf: 'flex-start',
            marginTop: '-0.25rem',
          }}
        >
          <div style={{ position: 'absolute', inset: 0, background: badge.color, opacity: 0.15, borderRadius: '9999px', border: `1px solid ${badge.color}` }} />
          <span style={{ position: 'relative', zIndex: 1 }}>{badge.text}</span>
        </span>
      )}
    </div>
  );
}
