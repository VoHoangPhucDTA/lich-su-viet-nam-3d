import { useState } from 'react';
import { ArrowRight, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { HistoricalEvent } from '../../types/event';
import { EVENT_TYPE_COLORS, EVENT_TYPE_ICONS, EVENT_TYPE_LABELS } from '../../types/event';
import { getEventTitleFallback, getEventTitleImage } from '../../data/eventTitleImages';

interface EventCardProps {
  event: HistoricalEvent;
  imageHeight?: string;
  compact?: boolean;
}

export default function EventCard({ event, imageHeight = 'h-40', compact = false }: EventCardProps) {
  const [imgError, setImgError] = useState(false);
  const Icon = EVENT_TYPE_ICONS[event.eventType];
  const color = EVENT_TYPE_COLORS[event.eventType];
  const yearLabel = event.startYear < 0 ? `${Math.abs(event.startYear)} TCN` : String(event.startYear);
  const detailKey = event.slug || event.id;
  const titleImage = getEventTitleImage(detailKey);
  const showImage = Boolean(titleImage && !imgError);

  return (
    <Link
      to={`/events/${detailKey}`}
      className="public-card group block overflow-hidden no-underline transition duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow)]"
      aria-label={`Khám phá sự kiện ${event.name}`}
    >
      <div
        className={`${imageHeight} relative overflow-hidden bg-[var(--bg-surface)] p-2`}
        style={{ background: showImage ? undefined : getEventTitleFallback(event.eventType) }}
      >
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl">
          {showImage ? (
            <img
              src={titleImage}
              alt=""
              loading="lazy"
              onError={() => setImgError(true)}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <Icon
              size={compact ? 44 : 54}
              strokeWidth={1}
              style={{ color: `${color}38` }}
              aria-hidden="true"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-stone-950/25 via-transparent to-transparent" />
          <span className="mono-label absolute left-2 top-2 rounded-md border border-amber-200/20 bg-[var(--accent)] px-2.5 py-1 text-[10px] font-bold text-amber-50 shadow-sm">
            {yearLabel}
          </span>
        </div>
      </div>

      <div className={compact ? 'space-y-2 p-4' : 'space-y-3 p-5'}>
        <div className="flex items-center justify-between gap-3 text-[11px] text-[var(--text-muted)]">
          <span className="flex min-w-0 items-center gap-1.5">
            <MapPin size={13} aria-hidden="true" className="shrink-0 text-[var(--accent)]" />
            <span className="truncate">{event.primaryRegions?.slice(0, 2).join(', ') || 'Việt Nam'}</span>
          </span>
          <span className="shrink-0 font-semibold" style={{ color }}>{EVENT_TYPE_LABELS[event.eventType]}</span>
        </div>
        <h3 className={`serif-heading line-clamp-2 font-bold leading-tight text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)] ${compact ? 'text-lg' : 'text-xl'}`}>
          {event.name}
        </h3>
        <p className={`line-clamp-2 leading-relaxed text-[var(--text-muted)] ${compact ? 'text-xs' : 'text-sm'}`}>
          {event.description || event.details || 'Khám phá chi tiết sự kiện lịch sử này.'}
        </p>
        <span className="inline-flex items-center gap-1.5 pt-1 text-xs font-bold text-[var(--accent)]">
          Khám phá
          <ArrowRight size={14} aria-hidden="true" className="transition-transform group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
}
