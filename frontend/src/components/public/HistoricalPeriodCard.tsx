import { Link } from 'react-router-dom';
import type { HistoricalPeriod } from '../../data/historicalPeriods';
import { getEventTitleFallback } from '../../data/eventTitleImages';

interface HistoricalPeriodCardProps {
  period: HistoricalPeriod;
  compact?: boolean;
}

interface ResponsiveImage {
  avif: string;
  webp: string;
  sizes: string;
}

const HOME_PERIOD_IMAGE_SIZES =
  '(min-width: 1024px) 228px, (min-width: 640px) calc(50vw - 1.5rem), calc(100vw - 2rem)';
const HOME_HERO_IMAGE_SIZES =
  '(min-width: 1280px) 558px, (min-width: 1024px) 441px, (min-width: 640px) calc(100vw - 50px), calc(100vw - 34px)';

const HOME_PERIOD_IMAGE_VARIANTS: Record<string, ResponsiveImage> = {
  '/event-titles/hung-vuong.jpg': {
    avif: '/home-images/period-hung-vuong-400.avif 400w, /home-images/period-hung-vuong-720.avif 720w',
    webp: '/home-images/period-hung-vuong-400.webp 400w, /home-images/period-hung-vuong-720.webp 720w',
    sizes: HOME_PERIOD_IMAGE_SIZES,
  },
  '/event-titles/bach-dang-938.jpg': {
    avif: '/home-images/period-bach-dang-938-400.avif 400w, /home-images/period-bach-dang-938-720.avif 720w',
    webp: '/home-images/period-bach-dang-938-400.webp 400w, /home-images/period-bach-dang-938-720.webp 720w',
    sizes: HOME_PERIOD_IMAGE_SIZES,
  },
  '/event-titles/tuyen-ngon-doc-lap-1945.jpg': {
    avif: '/home-images/period-tuyen-ngon-doc-lap-1945-400.avif 400w, /home-images/period-tuyen-ngon-doc-lap-1945-720.avif 720w',
    webp: '/home-images/period-tuyen-ngon-doc-lap-1945-400.webp 400w, /home-images/period-tuyen-ngon-doc-lap-1945-720.webp 720w',
    sizes: HOME_PERIOD_IMAGE_SIZES,
  },
  '/vietnam_heritage_hero.jpg': {
    avif: '/home-images/hero-720.avif 720w, /home-images/hero-1376.avif 1376w',
    webp: '/home-images/hero-720.webp 720w, /home-images/hero-1376.webp 1376w',
    sizes: HOME_HERO_IMAGE_SIZES,
  },
};

function formatPeriodRange(period: HistoricalPeriod) {
  const start = period.startYearInclusive ?? 'TCN';
  const end = period.endYearExclusive == null ? 'nay' : period.endYearExclusive - 1;
  return `${start} – ${end}`;
}

export default function HistoricalPeriodCard({ period, compact = false }: HistoricalPeriodCardProps) {
  const responsiveImage = compact && period.thumbnail
    ? HOME_PERIOD_IMAGE_VARIANTS[period.thumbnail]
    : undefined;

  return (
    <Link
      to={`/periods?period=${period.id}`}
      className="public-card interactive-card group block overflow-hidden text-left no-underline"
    >
      <div
        className={`relative overflow-hidden ${compact ? 'aspect-[16/8]' : 'aspect-[16/9]'}`}
        style={!period.thumbnail ? { background: getEventTitleFallback(period.fallbackEventType) } : undefined}
      >
        {responsiveImage ? (
          <picture>
            <source type="image/avif" srcSet={responsiveImage.avif} sizes={responsiveImage.sizes} />
            <source type="image/webp" srcSet={responsiveImage.webp} sizes={responsiveImage.sizes} />
            <img
              src={period.thumbnail!}
              alt=""
              width={1376}
              height={768}
              loading="lazy"
              fetchPriority="low"
              className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            />
          </picture>
        ) : period.thumbnail ? (
          <img
            src={period.thumbnail}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950/75 via-stone-950/15 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <div>
            <span className="ui-label inline-flex rounded-md border border-white/20 bg-stone-950/55 px-2 py-1 text-[10px] font-semibold text-amber-100">
              {formatPeriodRange(period)}
            </span>
            <p className="mt-2 text-lg font-bold text-white">{period.shortLabel}</p>
          </div>
        </div>
      </div>
      <div className={compact ? 'p-4' : 'p-5'}>
        <h3 className="app-heading text-xl font-bold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)] group-focus-visible:text-[var(--accent)]">
          {period.label}
        </h3>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--text-muted)]">{period.description}</p>
      </div>
    </Link>
  );
}
