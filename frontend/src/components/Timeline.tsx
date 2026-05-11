import { useMemo } from 'react';
import { Clock, SkipBack, SkipForward } from 'lucide-react';
import {
  EVENT_YEARS_SORTED,
  TIMELINE_MAX_YEAR,
  TIMELINE_MIN_YEAR,
  getNearestEventYear,
} from '../data/events';

interface TimelineProps {
  currentYear: number;
  onYearChange: (year: number) => void;
  selectedGrade?: number | null;
  onGradeChange?: (grade: number | null) => void;
  eventYears?: number[];
}

/**
 * Một số mốc lịch sử Việt Nam có ý nghĩa được dùng làm "anchor" trên thanh
 * thời gian. Khi `TIMELINE_MIN/MAX_YEAR` thay đổi theo dữ liệu thực, ta lọc
 * động ra những mốc nằm trong khoảng dữ liệu hiện có.
 */
const HISTORICAL_KEY_YEARS = [
  -700, -208, 40, 938, 1010, 1428, 1789, 1858, 1945, 1975, 2000,
] as const;

function formatYear(year: number): string {
  if (year < 0) return `${Math.abs(year)} TCN`;
  return `${year}`;
}

function formatYearShort(year: number): string {
  if (year < 0) return `${Math.abs(year)} TCN`;
  return `${year}`;
}

export default function Timeline({
  currentYear,
  onYearChange,
  selectedGrade = null,
  onGradeChange,
  eventYears,
}: TimelineProps) {
  const range = TIMELINE_MAX_YEAR - TIMELINE_MIN_YEAR;
  const availableYears = eventYears && eventYears.length > 0 ? eventYears : EVENT_YEARS_SORTED;

  const percentage = useMemo(() => {
    if (range <= 0) return 0;
    return ((currentYear - TIMELINE_MIN_YEAR) / range) * 100;
  }, [currentYear, range]);

  const keyYears = useMemo(() => {
    return HISTORICAL_KEY_YEARS.filter(
      (y) => y >= TIMELINE_MIN_YEAR && y <= TIMELINE_MAX_YEAR
    );
  }, []);

  /** Vị trí % trên track của 1 năm (0–100). */
  const yearToPercent = (year: number): number => {
    if (range <= 0) return 0;
    return ((year - TIMELINE_MIN_YEAR) / range) * 100;
  };

  /** Năm event gần nhất theo direction — `null` = đã hết. */
  const prevEventYear = useMemo(() => {
    const previous = availableYears.filter((year) => year < currentYear);
    if (previous.length > 0) return previous[previous.length - 1];
    return eventYears ? null : getNearestEventYear(currentYear, 'prev');
  }, [availableYears, currentYear, eventYears]);
  const nextEventYear = useMemo(() => {
    const next = availableYears.find((year) => year > currentYear);
    if (next != null) return next;
    return eventYears ? null : getNearestEventYear(currentYear, 'next');
  }, [availableYears, currentYear, eventYears]);

  return (
    <div
      className="glass-map relative flex-shrink-0"
      style={{
        padding: '14px 24px 14px',
        zIndex: 50,
        transform: 'translateZ(0)',
        boxShadow: '0 -10px 30px -16px rgba(15, 23, 42, 0.45)',
        minHeight: '116px',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em]"
            style={{ color: 'var(--text-muted)' }}
          >
            <Clock size={13} strokeWidth={2.4} />
            Dòng thời gian
          </span>
          <div
            className="w-px h-4 opacity-50"
            style={{ background: 'var(--border)' }}
          />
          <span
            className="text-2xl font-extrabold leading-none"
            style={{
              background:
                'linear-gradient(135deg, color-mix(in srgb, var(--accent) 65%, white), var(--accent))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {formatYear(currentYear)}
          </span>
          <span
            className="text-[11px] font-medium opacity-70"
            style={{ color: 'var(--text-muted)' }}
          >
            {availableYears.length} mốc sự kiện
          </span>
        </div>

        <div className="flex gap-2 items-center">
          {onGradeChange && (
            <div
              className="flex gap-1 rounded-lg border p-1"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
            >
              {[null, 10, 11, 12].map((grade) => {
                const isActive = selectedGrade === grade;
                return (
                  <button
                    key={grade ?? 'all'}
                    type="button"
                    onClick={() => onGradeChange(grade)}
                    className="rounded-md px-2.5 py-1 text-[11px] font-semibold transition"
                    style={{
                      background: isActive ? 'var(--accent)' : 'transparent',
                      color: isActive ? '#fff' : 'var(--text-secondary)',
                    }}
                  >
                    {grade == null ? 'Tất cả' : `Lớp ${grade}`}
                  </button>
                );
              })}
            </div>
          )}
          <button
            type="button"
            disabled={prevEventYear == null}
            aria-label={
              prevEventYear != null
                ? `Quay về sự kiện gần nhất: ${formatYear(prevEventYear)}`
                : 'Không có sự kiện trước'
            }
            title={
              prevEventYear != null
                ? `← Sự kiện trước: ${formatYear(prevEventYear)}`
                : 'Không có sự kiện trước'
            }
            onClick={() => prevEventYear != null && onYearChange(prevEventYear)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 cursor-pointer border disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'var(--bg-card)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
              boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
            }}
            onMouseEnter={(e) => {
              if (e.currentTarget.disabled) return;
              e.currentTarget.style.background = 'var(--accent-soft)';
              e.currentTarget.style.borderColor = 'var(--accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--bg-card)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            <SkipBack size={14} strokeWidth={2.4} />
            Sự kiện trước
          </button>
          <button
            type="button"
            disabled={nextEventYear == null}
            aria-label={
              nextEventYear != null
                ? `Sự kiện kế tiếp: ${formatYear(nextEventYear)}`
                : 'Không có sự kiện kế tiếp'
            }
            title={
              nextEventYear != null
                ? `Sự kiện sau: ${formatYear(nextEventYear)} →`
                : 'Không có sự kiện kế tiếp'
            }
            onClick={() => nextEventYear != null && onYearChange(nextEventYear)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 cursor-pointer border disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'var(--bg-card)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
              boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
            }}
            onMouseEnter={(e) => {
              if (e.currentTarget.disabled) return;
              e.currentTarget.style.background = 'var(--accent-soft)';
              e.currentTarget.style.borderColor = 'var(--accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--bg-card)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            Sự kiện sau
            <SkipForward size={14} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      {/* Slider track + tick marks */}
      <div className="relative mb-2">
        {/* Background track */}
        <div
          className="absolute left-0 right-0 h-1.5 rounded-full opacity-80"
          style={{
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'var(--border)',
          }}
        />
        {/* Filled progress */}
        <div
          className="absolute left-0 h-1.5 rounded-full"
          style={{
            top: '50%',
            width: `${percentage}%`,
            transform: 'translateY(-50%)',
            background:
              'linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 72%, white))',
            transition: 'width 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 0 12px var(--accent-soft)',
          }}
        />

        {/* Tick marks tại key years (đứng cao hơn track 4px mỗi đầu để dễ thấy) */}
        {keyYears.map((year) => {
          const left = yearToPercent(year);
          const isActive = currentYear === year;
          return (
            <span
              key={`tick-${year}`}
              aria-hidden="true"
              className="absolute pointer-events-none rounded-full"
              style={{
                left: `calc(${left}% - 1.5px)`,
                top: '50%',
                width: '3px',
                height: isActive ? '14px' : '10px',
                transform: 'translateY(-50%)',
                background: isActive ? 'var(--accent)' : 'var(--text-muted)',
                opacity: isActive ? 1 : 0.55,
                boxShadow: isActive ? '0 0 8px var(--accent)' : 'none',
                zIndex: 1,
                transition: 'all 0.15s ease',
              }}
            />
          );
        })}

        <input
          type="range"
          min={TIMELINE_MIN_YEAR}
          max={TIMELINE_MAX_YEAR}
          value={currentYear}
          onChange={(e) => onYearChange(Number(e.target.value))}
          className="timeline-slider relative z-[2] w-full h-6 bg-transparent appearance-none cursor-pointer"
          aria-label="Chọn mốc thời gian"
        />
      </div>

      {/* Key year markers (clickable chip dạng pill) */}
      <div className="relative h-7">
        {keyYears.map((year) => {
          const left = yearToPercent(year);
          const isActive = currentYear === year;
          return (
            <button
              key={year}
              type="button"
              onClick={() => onYearChange(year)}
              title={`Đi tới mốc ${formatYearShort(year)}`}
              aria-label={`Đi tới mốc ${formatYearShort(year)}`}
              className="key-year-chip absolute -translate-x-1/2 inline-flex items-center gap-1 cursor-pointer rounded-full border px-2 py-0.5 text-[10.5px] font-semibold leading-none transition-all duration-150"
              style={{
                left: `${left}%`,
                top: 0,
                background: isActive ? 'var(--accent)' : 'var(--bg-card)',
                borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                color: isActive ? '#fff' : 'var(--text-secondary)',
                boxShadow: isActive
                  ? '0 4px 10px -2px var(--accent-soft), 0 0 0 3px var(--accent-soft)'
                  : '0 1px 2px rgba(0,0,0,0.04)',
              }}
            >
              <span
                className="inline-block w-1 h-1 rounded-full"
                style={{
                  background: isActive ? '#fff' : 'var(--accent)',
                  opacity: isActive ? 1 : 0.6,
                }}
              />
              {formatYearShort(year)}
            </button>
          );
        })}
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
        .key-year-chip:hover {
          transform: translateX(-50%) translateY(-2px);
          border-color: var(--accent) !important;
          color: var(--accent) !important;
          box-shadow: 0 6px 14px -4px var(--accent-soft), 0 0 0 2px var(--accent-soft) !important;
        }
      `}</style>
    </div>
  );
}
