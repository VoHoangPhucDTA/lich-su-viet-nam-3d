import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MockEventDetail } from '../../data/mockEventDetails';
import { getChildrenEvents } from '../../services/eventDetailService';
import {
  EVENT_TYPE_COLORS,
  EVENT_TYPE_LABELS,
} from '../../types/event';
import SectionHeader from './SectionHeader';

interface EventChildrenListProps {
  childIds?: string[];
  index?: string;
}

/**
 * Danh sách sự kiện con / liên quan – card có thumbnail, eyebrow date, hover lift.
 */
export default function EventChildrenList({ childIds, index = '06' }: EventChildrenListProps) {
  const [children, setChildren] = useState<MockEventDetail[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (childIds && childIds.length > 0) {
      getChildrenEvents(childIds).then(setChildren);
    } else {
      setChildren([]);
    }
  }, [childIds]);

  if (!childIds || childIds.length === 0) return null;

  return (
    <section id="su-kien-con" className="scroll-mt-28 w-full">
      <SectionHeader
        index={index}
        title="Các sự kiện liên quan"
        subtitle="Mở rộng theo cấu trúc cha–con để hiểu bối cảnh đầy đủ."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {children.map((child) => {
          const typeColor = EVENT_TYPE_COLORS[child.classification.eventType];
          const typeLabel = EVENT_TYPE_LABELS[child.classification.eventType];
          const isCollection = child.eventLevel === 'collection';

          return (
            <button
              key={child.id}
              onClick={() => navigate(`/events/${child.slug}`)}
              className="group relative text-left transition flex flex-col rounded-2xl overflow-hidden"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = typeColor;
                (e.currentTarget as HTMLButtonElement).style.transform =
                  'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  'var(--border)';
                (e.currentTarget as HTMLButtonElement).style.transform = 'none';
              }}
            >
              {/* Top color stripe */}
              <span
                aria-hidden
                className="absolute top-0 left-0 right-0 h-[3px]"
                style={{ background: typeColor }}
              />

              <div className="flex gap-4 p-5">
                {/* Thumbnail */}
                <div
                  className="flex-shrink-0 relative w-24 h-24 rounded-xl overflow-hidden"
                  style={{ background: 'var(--bg-surface)' }}
                >
                  {child.media?.thumbnail ? (
                    <img
                      src={child.media.thumbnail}
                      alt={child.titles.primary}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center font-mono font-bold text-xl"
                      style={{ color: typeColor, opacity: 0.7 }}
                    >
                      {isCollection ? '◆' : '●'}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div
                    className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <span style={{ color: typeColor }}>{typeLabel}</span>
                    <span>·</span>
                    <span>{child.chronology.displayDate}</span>
                  </div>
                  <h3
                    className="line-clamp-2 text-base font-bold leading-snug mb-1.5"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {child.titles.primary}
                  </h3>
                  <p
                    className="line-clamp-2 text-[13px] leading-snug"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {child.summary.cardSummary}
                  </p>
                </div>

                {/* Arrow */}
                <div
                  className="flex-shrink-0 self-center transition opacity-0 group-hover:opacity-100"
                  style={{ color: typeColor }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
