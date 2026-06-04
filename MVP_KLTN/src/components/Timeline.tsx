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
      className="glass"
      style={{
        padding: '16px 24px',
        position: 'relative',
        zIndex: 50,
        transform: 'translateZ(0)',
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
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--color-text-dim)',
            }}
          >
            Dòng thời gian
          </span>
          <div
            style={{
              width: '1px',
              height: '16px',
              background: 'var(--color-surface-3)',
            }}
          />
          <span
            style={{
              fontSize: '24px',
              fontWeight: 800,
              background: 'linear-gradient(135deg, #818cf8, #6366f1)',
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
              padding: '4px 12px',
              borderRadius: '6px',
              background: 'var(--color-surface-3)',
              border: 'none',
              color: 'var(--color-text)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = 'var(--color-primary)')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = 'var(--color-surface-3)')
            }
          >
            ◀
          </button>
          <button
            onClick={() =>
              onYearChange(Math.min(TIMELINE_MAX_YEAR, currentYear + 1))
            }
            style={{
              padding: '4px 12px',
              borderRadius: '6px',
              background: 'var(--color-surface-3)',
              border: 'none',
              color: 'var(--color-text)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = 'var(--color-primary)')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = 'var(--color-surface-3)')
            }
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
            height: '4px',
            background: 'var(--color-surface-3)',
            borderRadius: '2px',
            transform: 'translateY(-50%)',
          }}
        />
        {/* Active track */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            width: `${percentage}%`,
            height: '4px',
            background: 'linear-gradient(90deg, #6366f1, #818cf8)',
            borderRadius: '2px',
            transform: 'translateY(-50%)',
            transition: 'width 0.15s',
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
                  ? 'var(--color-primary-light)'
                  : 'var(--color-text-dim)',
              fontSize: '11px',
              fontWeight: currentYear === year ? 700 : 400,
              cursor: 'pointer',
              padding: '4px 6px',
              borderRadius: '4px',
              transition: 'all 0.15s',
              position: 'relative',
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = 'var(--color-primary-light)')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color =
                currentYear === year
                  ? 'var(--color-primary-light)'
                  : 'var(--color-text-dim)')
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
                  background: 'var(--color-primary-light)',
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
          border-radius: 50%;
          background: linear-gradient(135deg, #818cf8, #6366f1);
          border: 2px solid white;
          box-shadow: 0 0 10px rgba(99, 102, 241, 0.5);
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .timeline-slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 0 20px rgba(99, 102, 241, 0.7);
        }
        .timeline-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: linear-gradient(135deg, #818cf8, #6366f1);
          border: 2px solid white;
          box-shadow: 0 0 10px rgba(99, 102, 241, 0.5);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
