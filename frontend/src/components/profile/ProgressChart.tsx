// ─── ProgressChart: CSS-only bar charts ─────────────────────────────────────
// Used for: weekly scores, category correctness, grade progress

import type { WeeklyScorePoint, CategoryScore, ProgressByGrade } from '../../data/mockLearningStats';

// ── Small animated bar ────────────────────────────────────────────────────────
function Bar({
  pct,
  color,
  label,
  valueLabel,
}: {
  pct: number;
  color: string;
  label: string;
  valueLabel: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.375rem',
        flex: 1,
        minWidth: 0,
        height: '100%',
      }}
    >
      <span style={{ fontSize: '0.7rem', color: 'var(--text-primary)', fontWeight: 700, lineHeight: 1 }}>{valueLabel}</span>
      {/* Chart-track fills the remaining vertical space */}
      <div
        style={{
          flex: 1,
          width: '100%',
          minHeight: 0,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: '0.375rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: '100%',
            height: `${Math.max(pct, 2)}%`,
            background: `linear-gradient(180deg, ${color} 0%, color-mix(in srgb, ${color} 67%, transparent) 100%)`,
            borderRadius: '0.375rem 0.375rem 0 0',
            transition: 'height 0.6s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        />
      </div>
      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.1 }}>{label}</span>
    </div>
  );
}

// ─── Weekly score chart ───────────────────────────────────────────────────────
export function WeeklyScoreChart({ data }: { data: WeeklyScorePoint[] }) {
  const max = 10;
  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', height: '10rem', alignItems: 'stretch' }}>
        {data.map(d => (
          <Bar
            key={d.week}
            pct={(d.score / max) * 100}
            color="var(--accent)"
            label={d.week}
            valueLabel={d.score.toFixed(1)}
          />
        ))}
      </div>
      {/* Axis */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '0.5rem',
          fontSize: '0.6rem',
          color: 'var(--text-muted)',
          padding: '0 0.125rem',
        }}
      >
        <span>0</span>
        <span>5</span>
        <span>10</span>
      </div>
    </div>
  );
}

// ─── Category horizontal bars ─────────────────────────────────────────────────
export function CategoryChart({ data }: { data: CategoryScore[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {data.map(c => (
        <div key={c.category}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.3rem',
            }}
          >
            <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600, lineHeight: 1.4 }}>
              {c.label}
            </span>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: c.color }}>
              {c.correctRate}%
            </span>
          </div>
          <div
            style={{
              height: '0.5rem',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '9999px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${c.correctRate}%`,
                background: `linear-gradient(90deg, ${c.color} 0%, ${c.color}bb 100%)`,
                borderRadius: '9999px',
                transition: 'width 0.7s cubic-bezier(0.34,1.56,0.64,1)',
                boxShadow: `0 0 6px ${c.color}66`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Grade progress bars ──────────────────────────────────────────────────────
export function GradeProgressChart({ data }: { data: ProgressByGrade[] }) {
  const gradeColors: Record<number, string> = { 10: 'var(--success)', 11: 'var(--accent)', 12: 'var(--warning)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {data.map(g => {
        const pct = Math.round((g.eventsViewed / g.eventsTotal) * 100);
        const color = gradeColors[g.grade] ?? '#8b1e1e';
        return (
          <div key={g.grade}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.375rem',
              }}
            >
              <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                Lớp {g.grade}
              </span>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {g.eventsViewed}/{g.eventsTotal} sự kiện
                </span>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color }}>
                  {pct}%
                </span>
              </div>
            </div>
            <div
              aria-label={`Tiến độ lớp ${g.grade}: ${g.eventsViewed} trên ${g.eventsTotal} sự kiện, ${pct}%`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={pct}
              role="progressbar"
              style={{
                height: '0.6rem',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '9999px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${color} 0%, color-mix(in srgb, ${color} 73%, transparent) 100%)`,
                  borderRadius: '9999px',
                  transition: 'width 0.7s ease',
                  boxShadow: `0 0 6px color-mix(in srgb, ${color} 33%, transparent)`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
