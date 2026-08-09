import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import type { TimelineRuntimeModel } from '../utils/timelineModel';
import {
  resolveTimelinePresentation,
  TIMELINE_FALLBACK_WIDTH_PX,
} from '../utils/timelinePresentation';

interface TimelineProps {
  currentYear: number;
  onYearChange: (year: number) => void;
  model: TimelineRuntimeModel;
}

export const HISTORICAL_TIMELINE_ANCHORS = [
  -2000, -700, -208, 40, 938, 1010, 1428, 1789, 1858, 1945, 1975, 2000,
] as const;

function formatYear(year: number): string {
  return year < 0 ? `${Math.abs(year)} TCN` : `${year}`;
}

function labelTransform(positionPercent: number): string {
  if (positionPercent <= 0) return 'translateX(0)';
  if (positionPercent >= 100) return 'translateX(-100%)';
  return 'translateX(-50%)';
}

export default function Timeline({ currentYear, onYearChange, model }: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(TIMELINE_FALLBACK_WIDTH_PX);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const updateWidth = () => {
      if (track.clientWidth > 0) setContainerWidth(track.clientWidth);
    };
    updateWidth();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateWidth);
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  const presentation = useMemo(() => resolveTimelinePresentation({
    availableYears: model.years,
    anchors: HISTORICAL_TIMELINE_ANCHORS,
    selectedYear: currentYear,
    containerWidthPx: containerWidth,
  }), [containerWidth, currentYear, model.years]);

  const range = model.maxYear - model.minYear;
  const progress = range === 0 ? 50 : Math.min(
    100,
    Math.max(0, ((currentYear - model.minYear) / range) * 100),
  );

  return (
    <section className="map-timeline" aria-label="Dòng thời gian lịch sử">
      <div className="map-timeline-header">
        <span className="map-timeline-heading">
          <Clock size={13} strokeWidth={2.4} />
          Dòng thời gian
        </span>
        <span className="map-timeline-current">{formatYear(currentYear)}</span>
        <span
          className="map-timeline-count"
          aria-label={`${model.years.length} năm có sự kiện trong dòng thời gian hiện tại; đây không phải tổng số sự kiện.`}
        >
          {model.years.length} năm có sự kiện
        </span>
      </div>

      <div ref={trackRef} className="map-timeline-track-area">
        <div className="map-timeline-track" aria-hidden="true" />
        <div className="map-timeline-progress" style={{ width: `${progress}%` }} aria-hidden="true" />
        {presentation.ticks.map((tick) => (
          <span
            key={tick.year}
            className={`map-timeline-tick ${tick.year === currentYear ? 'is-selected' : ''}`}
            style={{ left: `${tick.positionPercent}%` }}
            aria-hidden="true"
          />
        ))}
        <input
          type="range"
          min={model.minYear}
          max={model.maxYear}
          value={currentYear}
          onChange={(event) => onYearChange(Number(event.target.value))}
          className="timeline-slider"
          aria-label="Chọn mốc thời gian"
        />
        <div className="map-timeline-labels" data-lane-count={presentation.laneCount}>
          {presentation.labels.map((label) => (
            <button
              key={label.year}
              type="button"
              onClick={() => onYearChange(label.year)}
              aria-label={`Đi tới mốc ${formatYear(label.year)}`}
              aria-current={label.kind === 'selected' ? 'date' : undefined}
              className={`map-timeline-label is-${label.kind}`}
              style={{
                left: `${label.positionPercent}%`,
                transform: labelTransform(label.positionPercent),
              }}
            >
              {formatYear(label.year)}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
