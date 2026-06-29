/**
 * Skeleton loading components for profile pages.
 * Inspired by premium skeleton designs found in modern dashboards.
 */

/* ─── Base skeleton shimmer ──────────────────────────────────────────────── */

function Shimmer({ style }: { style?: React.CSSProperties }) {
  return (
    <div
      aria-hidden
      style={{
        background: 'var(--bg-surface)',
        borderRadius: '0.5rem',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)',
          animation: 'shimmer 1.5s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

/* ─── Stats card skeleton ────────────────────────────────────────────────── */

export function StatsCardSkeleton() {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '1rem',
        padding: '1.25rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      <Shimmer style={{ width: '40%', height: '0.75rem' }} />
      <Shimmer style={{ width: '65%', height: '1.75rem' }} />
      <Shimmer style={{ width: '30%', height: '0.6rem' }} />
    </div>
  );
}

/* ─── Activity skeleton ──────────────────────────────────────────────────── */

export function ActivitySkeleton() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.875rem',
        padding: '0.875rem 1.125rem',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '0.75rem',
      }}
    >
      <Shimmer style={{ width: '2.5rem', height: '2.5rem', borderRadius: '0.625rem', flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        <Shimmer style={{ width: '60%', height: '0.85rem' }} />
        <Shimmer style={{ width: '85%', height: '0.7rem' }} />
      </div>
      <Shimmer style={{ width: '4rem', height: '1.5rem', borderRadius: '9999px', flexShrink: 0 }} />
    </div>
  );
}

/* ─── Chart skeleton ─────────────────────────────────────────────────────── */

export function ChartSkeleton() {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '1rem',
        padding: '1.25rem',
      }}
    >
      <Shimmer style={{ width: '50%', height: '0.9rem', marginBottom: '1rem' }} />
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', height: '8rem' }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <Shimmer
            key={i}
            style={{
              flex: 1,
              height: `${30 + Math.random() * 70}%`,
              borderRadius: '0.375rem',
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Section skeleton (full card) ───────────────────────────────────────── */

export function CardSkeleton({ height = 120 }: { height?: number }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '1rem',
        padding: '1.25rem',
      }}
    >
      <Shimmer style={{ width: '35%', height: '0.85rem', marginBottom: '0.75rem' }} />
      <Shimmer style={{ width: '100%', height: `${height}px` }} />
    </div>
  );
}
