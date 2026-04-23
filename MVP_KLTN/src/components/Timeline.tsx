import { useMemo } from 'react';
import { TIMELINE_MIN_YEAR, TIMELINE_MAX_YEAR } from '../data/events';

interface TimelineProps {
  currentYear: number;
  onYearChange: (year: number) => void;
}

const KEY_YEARS = [
  { year: 1945, label: '1945' },
  { year: 1947, label: '1947' },
  { year: 1950, label: '1950' },
  { year: 1954, label: '1954' },
  { year: 1960, label: '1960' },
  { year: 1968, label: '1968' },
  { year: 1975, label: '1975' },
];

export default function Timeline({ currentYear, onYearChange }: TimelineProps) {
  const percentage = useMemo(() => {
    return (
      ((currentYear - TIMELINE_MIN_YEAR) /
        (TIMELINE_MAX_YEAR - TIMELINE_MIN_YEAR)) *
      100
    );
  }, [currentYear]);

  return (
    <div
      className="glass-map"
      style={{
        padding: '16px 24px',
        position: 'relative',
        zIndex: 50,
        transform: 'translateZ(0)',
        boxShadow: '0 20px 40px -24px rgba(15, 23, 42, 0.55)',
      }}
    >
      {/* Year display */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            Dòng thời gian
          </span>
          <div
            style={{
              width: '1px',
              height: '16px',
              background: 'var(--border)',
              opacity: 0.5,
            }}
          />
          <span
            style={{
              fontSize: '24px',
              fontWeight: 800,
              background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 65%, white), var(--accent))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {currentYear}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            gap: '8px',
          }}
        >
          <button
            onClick={() =>
              onYearChange(Math.max(TIMELINE_MIN_YEAR, currentYear - 1))
            }
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              transition: 'all 0.15s',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--accent-soft)';
              e.currentTarget.style.borderColor = 'var(--accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--bg-card)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            ◀
          </button>
          <button
            onClick={() =>
              onYearChange(Math.min(TIMELINE_MAX_YEAR, currentYear + 1))
            }
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              transition: 'all 0.15s',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--accent-soft)';
              e.currentTarget.style.borderColor = 'var(--accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--bg-card)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            ▶
          </button>
        </div>
      </div>

      {/* Slider */}
      <div style={{ position: 'relative', marginBottom: '8px' }}>
        {/* Track background */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: '6px',
            background: 'var(--border)',
            borderRadius: '3px',
            transform: 'translateY(-50%)',
            opacity: 0.8,
          }}
        />
        {/* Active track */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            width: `${percentage}%`,
            height: '6px',
            background: 'linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 72%, white))',
            borderRadius: '3px',
            transform: 'translateY(-50%)',
            transition: 'width 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 0 12px var(--accent-soft)',
          }}
        />
        <input
          type="range"
          min={TIMELINE_MIN_YEAR}
          max={TIMELINE_MAX_YEAR}
          value={currentYear}
          onChange={(e) => onYearChange(Number(e.target.value))}
          style={{
            width: '100%',
            height: '24px',
            appearance: 'none',
            background: 'transparent',
            cursor: 'pointer',
            position: 'relative',
            zIndex: 2,
          }}
          className="timeline-slider"
        />
      </div>

      {/* Key year markers */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '0 4px',
        }}
      >
        {KEY_YEARS.map(({ year, label }) => (
          <button
            key={year}
            onClick={() => onYearChange(year)}
            style={{
              background: 'none',
              border: 'none',
              color:
                currentYear === year
                  ? 'var(--accent)'
                  : 'var(--text-muted)',
              fontSize: '11px',
              fontWeight: currentYear === year ? 700 : 400,
              cursor: 'pointer',
              padding: '4px 6px',
              borderRadius: '4px',
              transition: 'all 0.15s',
              position: 'relative',
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = 'var(--accent)')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color =
                currentYear === year
                  ? 'var(--accent)'
                  : 'var(--text-muted)')
            }
          >
            {currentYear === year && (
              <span
                style={{
                  position: 'absolute',
                  top: '-2px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  background: 'var(--accent)',
                }}
              />
            )}
            {label}
          </button>
        ))}
      </div>

      <style>{`
        .timeline-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          background: var(--bg-card);
          border: 3px solid var(--accent);
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 0 4px var(--accent-soft), 0 6px 12px rgba(15, 23, 42, 0.28);
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .timeline-slider::-webkit-slider-thumb:hover {
          transform: scale(1.15);
          box-shadow: 0 0 0 6px var(--accent-soft), 0 6px 10px rgba(15, 23, 42, 0.2);
        }
        .timeline-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          background: var(--bg-card);
          border: 3px solid var(--accent);
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 0 4px var(--accent-soft), 0 6px 12px rgba(15, 23, 42, 0.28);
          transition: all 0.2s;
        }
      `}</style>
    </div>
  );
}
