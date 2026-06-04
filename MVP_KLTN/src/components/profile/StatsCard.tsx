interface StatsCardProps {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  gradient?: string;
}

export default function StatsCard({ icon, label, value, sub, color = 'var(--accent)', gradient }: StatsCardProps) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '1rem',
        padding: '1.25rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        position: 'relative',
        overflow: 'hidden',
        transition: 'transform 0.2s, box-shadow 0.2s',
        cursor: 'default',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = `var(--shadow)`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: 'absolute',
          top: '-20px',
          right: '-20px',
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: gradient ?? `radial-gradient(circle, ${color}22 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{icon}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.02em' }}>
          {label}
        </span>
      </div>

      <div
        style={{
          fontSize: '2rem',
          fontWeight: 800,
          color,
          lineHeight: 1,
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </div>

      {sub && (
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', opacity: 0.8 }}>{sub}</div>
      )}
    </div>
  );
}
