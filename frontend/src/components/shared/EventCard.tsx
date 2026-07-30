import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { HistoricalEvent } from '../../types/event';
import { EVENT_TYPE_COLORS, EVENT_TYPE_LABELS } from '../../types/event';
import { getEventTitleFallback, getEventTitleImage } from '../../data/eventTitleImages';
import {
  getEventThumbnailDeliveryCandidates,
  getResponsiveCloudinaryImage,
} from '../../services/cloudinaryService';

export type EventCardImageProfile = 'home' | 'browse' | 'period';

interface EventCardImageConfig {
  widths: readonly number[];
  sizes: string;
}

const EVENT_CARD_IMAGE_PROFILES: Record<EventCardImageProfile, EventCardImageConfig> = {
  home: {
    widths: [360, 480, 768],
    sizes:
      '(min-width: 1280px) 374px, (min-width: 1024px) calc(33.333vw - 52.667px), (min-width: 768px) calc(50vw - 52px), calc(100vw - 50px)',
  },
  browse: {
    widths: [360, 480, 768],
    sizes:
      '(min-width: 1280px) 374px, (min-width: 1024px) calc(33.333vw - 52.667px), (min-width: 640px) calc(50vw - 52px), calc(100vw - 50px)',
  },
  period: {
    widths: [360, 480, 768],
    sizes:
      '(min-width: 1280px) 374px, (min-width: 1024px) calc(33.333vw - 52.667px), (min-width: 640px) calc(50vw - 52px), calc(100vw - 50px)',
  },
};
const EVENT_CARD_IMAGE_INTRINSIC_WIDTH = 768;
const EVENT_CARD_IMAGE_INTRINSIC_HEIGHT = 432;

interface EventCardProps {
  event: HistoricalEvent;
  imageProfile: EventCardImageProfile;
  imageHeight?: string;
  compact?: boolean;
}

export default function EventCard({
  event,
  imageProfile,
  imageHeight = 'h-40',
  compact = false,
}: EventCardProps) {
  const [failedImageUrls, setFailedImageUrls] = useState<Set<string>>(() => new Set());
  const color = EVENT_TYPE_COLORS[event.eventType];
  const yearLabel = event.startYear == null
    ? ''
    : event.startYear < 0
      ? `${Math.abs(event.startYear)} TCN`
      : String(event.startYear);
  const detailKey = event.slug || event.id;
  const titleImage = getEventTitleImage(detailKey);
  const imageCandidates = useMemo(() => {
    const candidates = getEventThumbnailDeliveryCandidates(event.id, event.thumbnailUrl);
    if (titleImage && !candidates.includes(titleImage)) candidates.push(titleImage);
    return candidates;
  }, [event.id, event.thumbnailUrl, titleImage]);
  const imageUrl = imageCandidates.find((candidate) => !failedImageUrls.has(candidate));
  const imageConfig = EVENT_CARD_IMAGE_PROFILES[imageProfile];
  const image = useMemo(() => {
    if (!imageUrl) return undefined;
    return getResponsiveCloudinaryImage(imageUrl, imageConfig.widths);
  }, [imageConfig.widths, imageUrl]);
  const showImage = Boolean(image?.src);

  return (
    <Link
      to={`/events/${detailKey}`}
      className="public-card interactive-card group block overflow-hidden no-underline"
      aria-label={`Khám phá sự kiện ${event.name}`}
    >
      <div
        className={`${imageHeight} relative overflow-hidden bg-[var(--bg-surface)] p-2`}
        style={{ background: showImage ? undefined : getEventTitleFallback(event.eventType) }}
      >
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl">
          {showImage ? (
            <img
              src={image!.src}
              srcSet={image!.srcSet}
              sizes={image!.srcSet ? imageConfig.sizes : undefined}
              alt=""
              width={EVENT_CARD_IMAGE_INTRINSIC_WIDTH}
              height={EVENT_CARD_IMAGE_INTRINSIC_HEIGHT}
              loading="lazy"
              decoding="async"
              onError={() => {
                if (!imageUrl) return;
                setFailedImageUrls((current) => new Set(current).add(imageUrl));
              }}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <span className="px-4 text-center text-sm font-semibold" style={{ color }}>
              {EVENT_TYPE_LABELS[event.eventType]}
            </span>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-stone-950/25 via-transparent to-transparent" />
          <span className="ui-label absolute left-2 top-2 rounded-md border border-amber-200/20 bg-[var(--accent)] px-2.5 py-1 text-[10px] font-bold text-amber-50 shadow-sm">
            {yearLabel}
          </span>
        </div>
      </div>

      <div className={compact ? 'space-y-2 p-4' : 'space-y-3 p-5'}>
        <div className="flex items-center justify-between gap-3 text-[11px] text-[var(--text-muted)]">
          <span className="min-w-0">
            <span className="truncate">{event.primaryRegions?.slice(0, 2).join(', ') || 'Việt Nam'}</span>
          </span>
          <span className="shrink-0 font-semibold" style={{ color }}>{EVENT_TYPE_LABELS[event.eventType]}</span>
        </div>
        <h3 className={`app-heading line-clamp-2 font-bold leading-tight text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)] group-focus-visible:text-[var(--accent)] ${compact ? 'text-lg' : 'text-xl'}`}>
          {event.name}
        </h3>
        <p className={`line-clamp-2 leading-relaxed text-[var(--text-muted)] ${compact ? 'text-xs' : 'text-sm'}`}>
          {event.description || event.details || 'Khám phá chi tiết sự kiện lịch sử này.'}
        </p>
        <span className="inline-flex items-center pt-1 text-xs font-bold text-[var(--accent)]">
          Khám phá
        </span>
      </div>
    </Link>
  );
}
