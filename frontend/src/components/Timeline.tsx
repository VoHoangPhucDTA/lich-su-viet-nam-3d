import { useCallback, useMemo, useState } from 'react';
import { Clock, Plus, X } from 'lucide-react';
import type { TimelineRuntimeModel } from '../utils/timelineModel';

interface TimelineProps {
  currentYear: number;
  onYearChange: (year: number) => void;
  selectedGrade?: number | null;
  onGradeChange?: (grade: number | null) => void;
  model: TimelineRuntimeModel;
}

/**
 * Một số mốc lịch sử Việt Nam có ý nghĩa được dùng làm "anchor" trên thanh
 * thời gian. Khi `TIMELINE_MIN/MAX_YEAR` thay đổi theo dữ liệu thực, ta lọc
 * động ra những mốc nằm trong khoảng dữ liệu hiện có.
 */
const HISTORICAL_KEY_YEARS = [
  -2000, -700, -208, 40, 938, 1010, 1428, 1789, 1858, 1945, 1975, 2000,
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
  model,
}: TimelineProps) {
  const { years: availableYears, minYear, maxYear } = model;
  const range = maxYear - minYear;
  const [expandedClusters, setExpandedClusters] = useState<Set<number>>(new Set());

  const percentage = useMemo(() => {
    if (range <= 0) return 0;
    return Math.min(100, Math.max(0, ((currentYear - minYear) / range) * 100));
  }, [currentYear, minYear, range]);

  /** Vị trí % trên track của 1 năm (0–100). */
  const yearToPercent = useCallback((year: number): number => {
    if (range <= 0) return 0;
    return ((year - minYear) / range) * 100;
  }, [minYear, range]);

  const keyYears = useMemo(() => {
    const availableYearSet = new Set(availableYears);
    return HISTORICAL_KEY_YEARS.filter((year) => availableYearSet.has(year));
  }, [availableYears]);

  /**
   * Nhóm các key-year chip gần nhau thành cluster.
   * Cluster với 1 năm = chip đơn lẻ. Cluster nhiều năm = chip gộp, click để mở rộng.
   */
  const keyYearClusters = useMemo(() => {
    const threshold = 4.5;
    const clusters: { years: number[]; label: string }[] = [];
    let current: number[] = [];

    for (let i = 0; i < keyYears.length; i++) {
      if (current.length === 0) {
        current.push(keyYears[i]);
      } else {
        const lastPos = yearToPercent(current[current.length - 1]);
        const thisPos = yearToPercent(keyYears[i]);
        if (Math.abs(thisPos - lastPos) < threshold) {
          current.push(keyYears[i]);
        } else {
          clusters.push({
            years: [...current],
            label:
              current.length === 1
                ? formatYearShort(current[0])
                : `${formatYearShort(current[0])}–${formatYearShort(current[current.length - 1])}`,
          });
          current = [keyYears[i]];
        }
      }
    }
    if (current.length > 0) {
      clusters.push({
        years: [...current],
        label:
          current.length === 1
            ? formatYearShort(current[0])
            : `${formatYearShort(current[0])}–${formatYearShort(current[current.length - 1])}`,
      });
    }

    return clusters;
  }, [keyYears, yearToPercent]);



  return (
    <div
      className="map-timeline relative flex-shrink-0"
      style={{
        padding: '8px 20px 7px',
        zIndex: 50,
        transform: 'translateZ(0)',
        background: '#ffffff',
        borderTop: '1px solid #e7e5e4',
        boxShadow: '0 -4px 16px -8px rgba(0,0,0,0.08)',
        minHeight: '88px',
      }}
    >
      <div className="map-timeline-header mb-1.5 flex items-center justify-between gap-3">
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
            className="text-[1.4rem] font-extrabold leading-none"
            style={{
              fontFamily: 'var(--font-heading)',
              background:
                'linear-gradient(135deg,              var(--admin-accent), var(--accent))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: 'none',
            }}
          >
            {formatYear(currentYear)}
          </span>
          <span
            className="map-timeline-count text-[11px] font-medium opacity-70"
            style={{ color: '#78716c' }}
            aria-label={`${availableYears.length} mốc năm trong dòng thời gian hiện tại; đây không phải tổng số sự kiện.`}
          >
            {availableYears.length} mốc năm
          </span>
        </div>

        {onGradeChange && (
          <div
            className="map-grade-filter flex gap-1 rounded-lg border p-1"
            style={{ borderColor: '#e7e5e4', background: '#ffffff' }}
          >
            {[null, 10, 11, 12].map((grade) => {
              const isActive = selectedGrade === grade;
              return (
                <button
                  key={grade ?? 'all'}
                  type="button"
                  onClick={() => onGradeChange(grade)}
                  aria-pressed={isActive}
                  aria-label={grade == null
                    ? 'Hiển thị tất cả các lớp trong mốc thời gian hiện tại'
                    : `Chỉ hiển thị lớp ${grade} trong mốc thời gian hiện tại`}
                  className="rounded-md px-2.5 py-1 text-[11px] font-semibold transition"
                  style={{
                  background: isActive ? '#8b1e1e' : 'transparent',
                  color: isActive ? '#ffffff' : '#57534e',
                  }}
                >
                  {grade == null ? 'Tất cả' : `Lớp ${grade}`}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Slider track + tick marks */}
      <div className="relative mb-1">
        {/* Background track */}
        <div
          className="absolute left-0 right-0 h-1.5 rounded-full opacity-80"
          style={{
            top: '50%',
            transform: 'translateY(-50%)',
            background: '#e7e5e4',
          }}
        />
        {/* Filled progress */}
        <div
          className="absolute left-0 h-1.5 rounded-full"
          style={{
            top: '50%',
            width: `${percentage}%`,
            transform: 'translateY(-50%)',              background:
              'linear-gradient(90deg, #8b1e1e, #c5a059)',
            transition: 'width 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: 'none',
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
                background: isActive ? '#8b1e1e' : '#78716c',
                opacity: isActive ? 1 : 0.55,
                boxShadow: isActive ? '0 0 8px #8b1e1e' : 'none',
                zIndex: 1,
                transition: 'all 0.15s ease',
              }}
            />
          );
        })}

        <input
          type="range"
          min={minYear}
          max={maxYear}
          value={currentYear}
          // 1.1.2: Timeline.tsx: Kích hoạt sự kiện thay đổi, gọi hàm getEventsByYearFromBackend() trong eventApi.ts.
          onChange={(e) => onYearChange(Number(e.target.value))}
          className="timeline-slider relative z-[2] w-full h-5 bg-transparent appearance-none cursor-pointer"
          aria-label="Chọn mốc thời gian"
        />
      </div>

      {/* Key year markers — cluster grouping */}
      <div
        className="map-timeline-key-years relative"
        style={{
          minHeight: `${Math.max(
            24,
            Math.max(...keyYearClusters.map((cluster, index) => {
              const canToggle = cluster.years[0] === 1789
                && cluster.years[cluster.years.length - 1] === 2000;
              const isExpanded = expandedClusters.has(index);
              return canToggle && !isExpanded ? 24 : cluster.years.length * 22 + (canToggle ? 18 : 0);
            })),
          )}px`,
        }}
      >
        {keyYearClusters.map((cluster, clusterIdx) => {
          const isExpanded = expandedClusters.has(clusterIdx);
          const hasMultiple = cluster.years.length > 1;
          const canToggle = cluster.years[0] === 1789
            && cluster.years[cluster.years.length - 1] === 2000;

          if (hasMultiple && canToggle && !isExpanded) {
            // Collapsed cluster chip — positioned at midpoint of first/last year
            const firstPos = yearToPercent(cluster.years[0]);
            const lastPos = yearToPercent(cluster.years[cluster.years.length - 1]);
            const left = (firstPos + lastPos) / 2;
            const anyActive = cluster.years.includes(currentYear);
            return (
              <button
                key={`cluster-${clusterIdx}`}
                type="button"
                onClick={() => {
                  setExpandedClusters((prev) => {
                    const next = new Set(prev);
                    next.add(clusterIdx);
                    return next;
                  });
                }}
                title={`${cluster.years.length} mốc: ${cluster.label} — nhấn để mở rộng`}
                aria-label={`Cụm ${cluster.years.length} mốc thời gian: ${cluster.label}. Nhấn để mở rộng.`}
                aria-current={anyActive ? 'date' : undefined}
                className="key-year-chip cluster-chip absolute -translate-x-1/2 inline-flex items-center gap-1 cursor-pointer rounded-full border px-2 py-0.5 text-[10.5px] font-semibold leading-none transition-colors duration-150"
                style={{
                  left: `${left}%`,
                  top: 0,
                  background: anyActive ? '#fef2f2' : '#ffffff',
                  borderColor: anyActive ? '#8b1e1e' : '#e7e5e4',
                  color: anyActive ? '#8b1e1e' : '#57534e',
                  borderStyle: 'dashed',
                  boxShadow: anyActive
                    ? '0 4px 10px -2px rgba(139,30,30,0.2)'
                    : '0 1px 2px rgba(0,0,0,0.04)',
                  zIndex: anyActive ? 2 : 1,
                }}
              >
                <Plus size={9} strokeWidth={2.8} style={{ opacity: 0.6 }} />
                {cluster.label}
              </button>
            );
          }

          // Expanded cluster → render individual staggered chips + collapse button
          return (
            <div key={`expanded-${clusterIdx}`}>
              {cluster.years.map((year, yearIdx) => {
                const left = yearToPercent(year);
                const isActive = currentYear === year;
                const isRangeStart = year === minYear;
                const topOffset = yearIdx * 22;
                return (
                  <button
                    key={year}
                    type="button"
                    onClick={() => onYearChange(year)}
                    title={`Đi tới mốc ${formatYearShort(year)}`}
                    aria-label={`Đi tới mốc ${formatYearShort(year)}`}
                    aria-current={isActive ? 'date' : undefined}
                    className={`key-year-chip absolute inline-flex items-center gap-1 cursor-pointer rounded-full border px-2 py-0.5 text-[10.5px] font-semibold leading-none transition-colors duration-150 ${isRangeStart ? '' : '-translate-x-1/2'}`}
                    style={{
                      left: `${left}%`,
                      top: `${topOffset}px`,
                      background: isActive ? '#8b1e1e' : '#ffffff',
                      borderColor: isActive ? '#8b1e1e' : '#e7e5e4',
                      color: isActive ? '#ffffff' : '#57534e',
                      boxShadow: isActive
                        ? '0 4px 10px -2px rgba(139,30,30,0.2), 0 0 0 3px rgba(139,30,30,0.1)'
                        : '0 1px 2px rgba(0,0,0,0.04)',
                      zIndex: isActive ? 2 : 1,
                    }}
                  >
                    <span
                      className="inline-block w-1 h-1 rounded-full"
                      style={{
                        background: isActive ? '#ffffff' : '#8b1e1e',
                        opacity: isActive ? 1 : 0.6,
                      }}
                    />
                    {formatYearShort(year)}
                  </button>
                );
              })}
              {canToggle && (
                <button
                  type="button"
                  onClick={() => {
                    setExpandedClusters((prev) => {
                      const next = new Set(prev);
                      next.delete(clusterIdx);
                      return next;
                    });
                  }}
                  title="Thu gọn cụm 1789–2000"
                  aria-label="Thu gọn cụm mốc thời gian 1789 đến 2000"
                  className="absolute inline-flex items-center justify-center cursor-pointer rounded-full transition-colors duration-150"
                  style={{
                    left: `${(yearToPercent(cluster.years[0]) + yearToPercent(cluster.years[cluster.years.length - 1])) / 2}%`,
                    transform: 'translateX(-50%)',
                    top: `${cluster.years.length * 22}px`,
                    width: '18px',
                    height: '18px',
                    background: '#ffffff',
                    color: '#78716c',
                    border: '1px solid #e7e5e4',
                  }}
                >
                  <X size={10} strokeWidth={2.8} />
                </button>
              )}
            </div>
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
          transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .timeline-slider::-webkit-slider-thumb:hover {
          transform: scale(1.15);
          box-shadow: 0 0 0 6px rgba(139,30,30,0.15), 0 6px 10px rgba(0,0,0,0.1);
        }
        .timeline-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          background: var(--bg-card);
          border: 3px solid var(--accent);
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 0 4px var(--accent-soft), 0 6px 12px rgba(15, 23, 42, 0.28);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
      `}</style>
    </div>
  );
}
