import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MockEventDetail } from '../../data/mockEventDetails';
import {
  EVENT_TYPE_COLORS,
  EVENT_TYPE_LABELS,
} from '../../types/event';
import { getEventThumbnailDeliveryCandidates } from '../../services/cloudinaryService';

interface EventHeroProps {
  event: MockEventDetail;
  showMapAction?: boolean;
}

/**
 * Renders the hero section for an event detail page.
 *
 * @param event - The event whose title, classification, metadata, and media are displayed.
 * @param showMapAction - Whether to display actions for opening the event on the map.
 * @returns The event hero section.
 */
export default function EventHero({ event, showMapAction }: EventHeroProps) {
  const navigate = useNavigate();
  const [thumbnailError, setThumbnailError] = useState(false);
  const [thumbnailIndex, setThumbnailIndex] = useState(0);
  const typeColor = EVENT_TYPE_COLORS[event.classification.eventType];
  const typeLabel = EVENT_TYPE_LABELS[event.classification.eventType];

  const isWorldHistory = event.classification.tags?.includes('lịch sử thế giới');
  const provinces = event.mapData?.displayGeometry?.provinceNames ?? [];
  const grades = event.coverage?.grades ?? [];
  const thumbnailCandidates = useMemo(
    () => getEventThumbnailDeliveryCandidates(event.id, event.media?.thumbnail),
    [event.id, event.media?.thumbnail]
  );
  const thumbnailUrl = thumbnailCandidates[thumbnailIndex];
  const hasThumbnail = Boolean(thumbnailUrl) && !thumbnailError;
  const mapUrl = `/map?event=${encodeURIComponent(event.slug || event.id)}`;

  useEffect(() => {
    setThumbnailError(false);
    setThumbnailIndex(0);
  }, [thumbnailCandidates]);

  const handleThumbnailError = () => {
    if (thumbnailIndex < thumbnailCandidates.length - 1) {
      setThumbnailIndex((current) => current + 1);
      return;
    }
    setThumbnailError(true);
  };

  return (
    <section
      className="relative overflow-hidden rounded-3xl animate-fade-in-up"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow)',
      }}
    >
      {/* Decorative gradient veil */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 0% 0%, ${typeColor}22, transparent 55%),
                       radial-gradient(circle at 100% 100%, var(--admin-accent-soft), transparent 55%)`,
        }}
      />
      {/* Imperial gold top bar */}
      <div
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{
          background: `linear-gradient(to right, ${typeColor}, var(--admin-accent), transparent)`,
        }}
      />

      {/* Decorative chinese-style watermark khi không có ảnh */}
      {!hasThumbnail && (
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 select-none"
          style={{
            fontSize: '22rem',
            lineHeight: 1,
            fontFamily: 'var(--font-heading)',
            color: 'var(--admin-accent)',
            opacity: 0.06,
            fontWeight: 900,
          }}
        >
          史
        </div>
      )}

      <div
        className={
          hasThumbnail
            ? 'relative grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)] gap-0'
            : 'relative'
        }
      >
        {/* Content */}
        <div
          className={
            hasThumbnail
              ? 'p-6 sm:p-8 xl:p-10 flex flex-col'
              : 'p-8 sm:p-10 lg:px-16 lg:py-14 xl:px-20 xl:py-[72px] flex flex-col'
          }
        >
          {/* Title – serif display font for museum feel */}
          <h1
            className="font-extrabold leading-[1.05] mb-3"
            style={{
              fontFamily: 'var(--font-heading)',
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
              fontSize: hasThumbnail
                ? 'clamp(1.6rem, 3.2vw, 2.5rem)'
                : 'clamp(2rem, 4.4vw, 3.4rem)',
              maxWidth: hasThumbnail ? '100%' : '72%',
            }}
          >
            {event.titles.primary}
          </h1>
          {event.titles.short && event.titles.short !== event.titles.primary && (
            <p
              className="text-base md:text-lg mb-5"
              style={{ color: 'var(--text-muted)' }}
            >
              Còn gọi là: <span className="italic">{event.titles.short}</span>
            </p>
          )}

          {/* Badges row */}
          <div className="flex flex-wrap gap-2 mb-6">
            <Chip
              label={typeLabel}
              color={typeColor}
              filled
            />
            {grades.length > 0 && (
              <Chip
                label={`SGK lớp ${grades.join(', ')}`}
                accent="admin"
              />
            )}
            {isWorldHistory && <Chip label="Bối cảnh thế giới" accent="warning" />}
          </div>

          {hasThumbnail && (
            <div className="mb-6 xl:hidden">
              <HeroThumbnail
                src={thumbnailUrl!}
                alt={event.titles.primary}
                onError={handleThumbnailError}
              />
            </div>
          )}

          {/* Meta row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <MetaItem
              label="Thời gian"
              value={event.chronology.displayDate}
            />
            {provinces.length > 0 && (
              <MetaItem
                label="Địa điểm"
                value={provinces.join(', ')}
              />
            )}
          </div>

          {/* CTA */}
          {showMapAction && (
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => navigate(mapUrl)}
                className="inline-flex items-center px-5 py-2.5 rounded-xl font-semibold transition"
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                  boxShadow: '0 8px 18px -10px rgba(0,0,0,0.35)',
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.filter =
                    'brightness(1.1)')
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.filter = 'none')
                }
              >
                Xem trên bản đồ 3D
              </button>
              <button
                onClick={() => navigate(mapUrl)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition"
                style={{
                  background: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                Quay lại bản đồ
              </button>
            </div>
          )}
        </div>

        {hasThumbnail && (
          <div className="hidden xl:flex items-center p-8 pl-0">
            <HeroThumbnail
              src={thumbnailUrl!}
              alt={event.titles.primary}
              onError={handleThumbnailError}
            />
          </div>
        )}
      </div>
    </section>
  );
}

/* ─── helpers ────────────────────────────────────────────────────────────── */

function HeroThumbnail({
  src,
  alt,
  onError,
}: {
  src: string;
  alt: string;
  onError?: () => void;
}) {
  return (
    <figure
      className="relative w-full aspect-[16/9] overflow-hidden rounded-2xl"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        boxShadow: '0 18px 40px -28px rgba(0,0,0,0.45)',
      }}
    >
      <img
        src={src}
        alt={alt}
        onError={onError}
        className="w-full h-full object-cover"
      />
    </figure>
  );
}

/**
 * Renders a styled label with optional color or accent variants.
 *
 * @param label - The text displayed in the chip
 * @param color - The color used for the chip when `filled` is enabled
 * @param filled - Whether to apply the provided color to the chip
 * @param accent - The predefined accent variant to apply
 */
function Chip({
  label,
  color,
  filled,
  accent,
}: {
  label: string;
  color?: string;
  filled?: boolean;
  accent?: 'admin' | 'accent' | 'warning';
}) {
  let bg = 'var(--bg-surface)';
  let fg = 'var(--text-secondary)';
  let border = 'var(--border)';

  if (filled && color) {
    bg = `color-mix(in srgb, ${color} 20%, transparent)`;
    fg = color;
    border = `color-mix(in srgb, ${color} 45%, transparent)`;
  } else if (accent === 'admin') {
    bg = 'var(--admin-accent-soft)';
    fg = 'var(--admin-accent)';
    border = 'color-mix(in srgb, var(--admin-accent) 40%, transparent)';
  } else if (accent === 'accent') {
    bg = 'var(--accent-soft)';
    fg = 'var(--accent)';
    border = 'color-mix(in srgb, var(--accent) 40%, transparent)';
  } else if (accent === 'warning') {
    bg = 'var(--warning-soft)';
    fg = 'var(--warning)';
    border = 'color-mix(in srgb, var(--warning) 40%, transparent)';
  }

  return (
    <span
      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold"
      style={{ background: bg, color: fg, border: `1px solid ${border}` }}
    >
      {label}
    </span>
  );
}

/**
 * Renders a labeled metadata card with a truncated value.
 *
 * @param label - The metadata label.
 * @param value - The metadata value.
 */
function MetaItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      className="px-4 py-3 rounded-xl"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      <div className="min-w-0">
        <div
          className="text-[10px] font-bold uppercase tracking-[0.14em]"
          style={{ color: 'var(--text-muted)' }}
        >
          {label}
        </div>
        <div
          className="text-sm font-semibold truncate"
          style={{ color: 'var(--text-primary)' }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}
