import type { MockEventDetail } from '../../data/mockEventDetails';
import { EVENT_TYPE_COLORS, EVENT_TYPE_ICONS, EVENT_TYPE_LABELS } from '../../types/event';

interface EventHeroProps {
  event: MockEventDetail;
}

export default function EventHero({ event }: EventHeroProps) {
  const typeColor = EVENT_TYPE_COLORS[event.classification.eventType];
  
  return (
    <div className="relative w-full rounded-2xl overflow-hidden bg-card border border-default flex flex-col md:flex-row gap-6 p-6 shadow-theme">
      {/* Thumbnail */}
      <div className="w-full md:w-1/3 aspect-video md:aspect-[4/3] rounded-xl overflow-hidden bg-surface flex-shrink-0 flex items-center justify-center relative border border-default">
        {event.media?.thumbnail ? (
          <img src={event.media.thumbnail} alt={event.titles.primary} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center text-muted gap-2">
            <span className="text-4xl">📸</span>
            <span className="text-sm font-medium">Không có hình ảnh</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col justify-center">
        {/* Badges */}
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: `${typeColor}30`, color: typeColor, border: `1px solid ${typeColor}60` }}>
            {EVENT_TYPE_ICONS[event.classification.eventType]} {EVENT_TYPE_LABELS[event.classification.eventType]}
          </span>
          {event.classification.eventSubtype && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-surface text-secondary border border-default">
              {event.classification.eventSubtype}
            </span>
          )}
          {event.mapData?.displayGeometry ? (
            <span className="px-3 py-1 rounded-full text-xs font-semibold border" style={{ background: 'color-mix(in srgb, var(--success) 18%, transparent)', color: 'var(--success)', borderColor: 'color-mix(in srgb, var(--success) 45%, transparent)' }}>
              🌍 Có bản đồ 3D
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-surface text-muted border border-default">
              📋 Không gắn địa điểm cụ thể
            </span>
          )}
          {/* Vietnam history vs World history check (mock logic: if political + no_map typical world) */}
          {event.classification.tags?.includes('lịch sử thế giới') ? (
            <span className="px-3 py-1 rounded-full text-xs font-semibold border" style={{ background: 'color-mix(in srgb, var(--warning) 16%, transparent)', color: 'var(--warning)', borderColor: 'color-mix(in srgb, var(--warning) 40%, transparent)' }}>
              Ngữ cảnh thế giới
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full text-xs font-semibold border" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)' }}>
              Lịch sử Việt Nam
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className="text-3xl md:text-4xl font-bold text-primary leading-tight mb-2">
          {event.titles.primary}
        </h1>
        {event.titles.short && event.titles.short !== event.titles.primary && (
          <h2 className="text-lg text-muted font-medium mb-4">
            Hay: {event.titles.short}
          </h2>
        )}

        <div className="flex flex-wrap gap-x-6 gap-y-3 mt-4 text-sm font-medium">
          {/* Date */}
          <div className="flex items-center gap-2 text-secondary bg-surface px-4 py-2 rounded-lg border border-default">
            <span className="text-lg">📅</span>
            <span>{event.chronology.displayDate}</span>
          </div>
          
          {/* Location Summary */}
          {event.mapData?.displayGeometry?.provinceNames && event.mapData.displayGeometry.provinceNames.length > 0 && (
            <div className="flex items-center gap-2 text-secondary bg-surface px-4 py-2 rounded-lg border border-default">
              <span className="text-lg">📍</span>
              <span>{event.mapData.displayGeometry.provinceNames.join(', ')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
