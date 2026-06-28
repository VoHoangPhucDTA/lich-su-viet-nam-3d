import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, MapPin } from 'lucide-react';
import type { HistoricalEvent } from '../../types/event';
import { EVENT_TYPE_COLORS, EVENT_TYPE_ICONS } from '../../types/event';
import { getEventTitleImage, getEventTitleFallback } from '../../data/eventTitleImages';

interface EventCardProps {
  event: HistoricalEvent;
  /** Override the card height class. Default: 'h-40' */
  imageHeight?: string;
  /** Show compact variant (smaller icon, tighter padding). Default: false */
  compact?: boolean;
}

export default function EventCard({ event, imageHeight = 'h-40', compact = false }: EventCardProps) {
  const navigate = useNavigate();
  const [imgError, setImgError] = useState(false);
  const Icon = EVENT_TYPE_ICONS[event.eventType];
  const color = EVENT_TYPE_COLORS[event.eventType];
  const yearLabel = event.startYear < 0 ? `${Math.abs(event.startYear)} TCN` : String(event.startYear);
  const detailKey = event.slug || event.id;
  const titleImage = getEventTitleImage(detailKey);
  const fallbackGradient = getEventTitleFallback(event.eventType);

  const handleClick = () => {
    navigate(`/events/${detailKey}`);
  };

  const showImage = titleImage && !imgError;

  return (
    <div
      onClick={handleClick}
      className="group cursor-pointer rounded-2xl bg-white border border-stone-200/65 overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5"
    >
      {/* Image area */}
      <div
        className={`${imageHeight} overflow-hidden relative p-2`}
        style={{ background: showImage ? 'transparent' : fallbackGradient }}
      >
        <div className="w-full h-full rounded-xl overflow-hidden relative flex items-center justify-center">
          {showImage ? (
            <img
              src={titleImage!}
              alt={event.name}
              onError={() => setImgError(true)}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <Icon
              size={compact ? 48 : 56}
              strokeWidth={1}
              style={{ color: `${color}2a` }}
              className="transition-transform duration-500 group-hover:scale-110"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-stone-950/10 to-transparent" />
          {/* Year badge */}
          <div className="absolute top-2 left-2 px-2.5 py-1 bg-red-900 text-amber-100 font-mono text-[10px] font-bold rounded-lg shadow-sm border border-amber-500/20">
            {yearLabel}
          </div>
        </div>
      </div>

      {/* Card body */}
      <div className={compact ? 'p-4 space-y-2' : 'p-5 space-y-3'}>
        <div className="flex items-center gap-1.5 text-[9px] text-stone-500 font-mono tracking-wide">
          <MapPin className="h-3 w-3 text-red-900" />
          <span className="truncate">
            {event.primaryRegions?.slice(0, 2).join(', ') || 'Việt Nam'}
          </span>
        </div>
        <h3 className={`font-serif ${compact ? 'text-sm' : 'text-base'} font-bold text-stone-900 group-hover:text-red-900 transition-colors line-clamp-2 leading-tight`}>
          {event.name}
        </h3>
        <p className={`${compact ? 'text-[11px]' : 'text-xs'} text-stone-500 leading-relaxed line-clamp-2`}>
          {event.description || event.details || 'Khám phá chi tiết sự kiện lịch sử này.'}
        </p>
        <div className="pt-1 flex items-center gap-1.5 text-[10px] font-bold font-mono tracking-wider uppercase text-red-900">
          <span>Khám phá</span>
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
        </div>
      </div>
    </div>
  );
}
