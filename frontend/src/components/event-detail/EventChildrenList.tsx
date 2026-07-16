import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRelatedEventsFromBackend } from '../../services/eventApi';
import type { RelatedHistoricalEvent, RelatedHistoricalEvents } from '../../types/event';
import { EVENT_TYPE_COLORS, EVENT_TYPE_LABELS } from '../../types/event';
import SectionHeader from './SectionHeader';

interface EventChildrenListProps {
  eventId: string;
  relatedEvents?: RelatedHistoricalEvents;
  index?: string;
}

const emptyRelatedEvents: RelatedHistoricalEvents = {
  predecessors: [],
  successors: [],
  related: [],
};

function hasAnyRelatedEvent(groups: RelatedHistoricalEvents) {
  return groups.predecessors.length > 0 || groups.successors.length > 0 || groups.related.length > 0;
}

export default function EventChildrenList({
  eventId,
  relatedEvents: initialRelatedEvents,
  index = '06',
}: EventChildrenListProps) {
  const [fetchedRelatedEvents, setFetchedRelatedEvents] = useState<{
    eventId: string;
    data: RelatedHistoricalEvents;
  } | null>(null);
  const navigate = useNavigate();

  const fetchedForCurrentEvent =
    fetchedRelatedEvents?.eventId === eventId ? fetchedRelatedEvents.data : null;
  const relatedEvents = initialRelatedEvents ?? fetchedForCurrentEvent ?? emptyRelatedEvents;
  const loading = !initialRelatedEvents && !fetchedForCurrentEvent;

  useEffect(() => {
    let cancelled = false;
    if (initialRelatedEvents) {
      return;
    }

    getRelatedEventsFromBackend(eventId)
      .then((items) => {
        if (!cancelled) setFetchedRelatedEvents({ eventId, data: items });
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, initialRelatedEvents]);

  const groups = [
    { key: 'predecessors', title: 'Sự kiện trước đó', items: relatedEvents.predecessors },
    { key: 'successors', title: 'Diễn biến tiếp theo', items: relatedEvents.successors },
    { key: 'related', title: 'Sự kiện liên quan', items: relatedEvents.related },
  ] as const;

  if (!loading && !hasAnyRelatedEvent(relatedEvents)) return null;

  return (
    <section id="su-kien-con" className="scroll-mt-28 w-full">
      <SectionHeader
        index={index}
        title="Các sự kiện liên quan"
        subtitle="Dựa trên quan hệ sự kiện được lưu trong dữ liệu."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading && (
          <div
            className="md:col-span-2 rounded-2xl p-5 text-sm font-medium"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          >
            Đang tải sự kiện liên quan...
          </div>
        )}

        {!loading && groups.map((group) => (
          group.items.length > 0 && (
            <div key={group.key} className="md:col-span-2">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--text-secondary)' }}>
                {group.title}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {group.items.map((child) => (
                  <RelatedEventCard
                    key={`${child.associationType}-${child.id}-${child.relationType}`}
                    child={child}
                    onOpen={() => navigate(`/events/${child.slug || child.id}`, { state: { from: window.location.pathname } })}
                  />
                ))}
              </div>
            </div>
          )
        ))}
      </div>
    </section>
  );
}

function RelatedEventCard({
  child,
  onOpen,
}: {
  child: RelatedHistoricalEvent;
  onOpen: () => void;
}) {
  const typeColor = EVENT_TYPE_COLORS[child.eventType];
  const typeLabel = EVENT_TYPE_LABELS[child.eventType];

  return (
    <button
      onClick={onOpen}
      className="group relative text-left transition-all duration-300 flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow)',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = typeColor;
        (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
        (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 24px -12px rgba(0,0,0,0.15)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
        (e.currentTarget as HTMLButtonElement).style.transform = 'none';
        (e.currentTarget as HTMLButtonElement).style.boxShadow = 'var(--shadow)';
      }}
    >
      <span aria-hidden className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: typeColor }} />

      <div className="flex gap-4 p-5">
        <div
          className="flex-shrink-0 relative w-24 h-24 rounded-xl overflow-hidden"
          style={{ background: 'var(--bg-surface)' }}
        >
          {child.thumbnailUrl ? (
            <img
              src={child.thumbnailUrl}
              alt={child.name}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center font-serif font-bold text-xl"
              style={{ color: typeColor, opacity: 0.7 }}
            >
              •
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span
              className="rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em]"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              {child.relationLabel}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] font-mono" style={{ color: typeColor }}>
              {typeLabel}
            </span>
            {child.displayDate && (
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] font-mono" style={{ color: 'var(--text-muted)' }}>
                {child.displayDate}
              </span>
            )}
          </div>
          <h3
            className="line-clamp-2 text-base font-bold leading-snug mb-1.5 font-serif"
            style={{ color: 'var(--text-primary)' }}
          >
            {child.name}
          </h3>
          <p className="line-clamp-2 text-[13px] leading-snug font-medium" style={{ color: 'var(--text-muted)' }}>
            {child.description}
          </p>
        </div>

        <div
          className="flex-shrink-0 self-center transition-all duration-300 opacity-0 group-hover:opacity-100 group-hover:translate-x-1"
          style={{ color: typeColor }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </button>
  );
}
