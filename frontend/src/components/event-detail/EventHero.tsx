import { useNavigate } from 'react-router-dom';
import type { MockEventDetail } from '../../data/mockEventDetails';
import {
  EVENT_TYPE_COLORS,
  EVENT_TYPE_LABELS,
} from '../../types/event';

interface EventHeroProps {
  event: MockEventDetail;
  showMapAction?: boolean;
}

/**
 * Hero redesigned to match CoiNguonPage design language.
 * Red-900 accents, serif typography, stone-white card, subtle shadow.
 */
export default function EventHero({ event, showMapAction }: EventHeroProps) {
  const navigate = useNavigate();
  const typeColor = EVENT_TYPE_COLORS[event.classification.eventType];
  const typeLabel = EVENT_TYPE_LABELS[event.classification.eventType];

  const isWorldHistory = event.classification.tags?.includes('lịch sử thế giới');
  const provinces = event.mapData?.displayGeometry?.provinceNames ?? [];
  const grades = event.coverage?.grades ?? [];
  const hasThumbnail = !!event.media?.thumbnail;

  return (
    <section
      id="hero"
      className="relative overflow-hidden rounded-3xl"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow)',
      }}
    >
      {/* Decorative gradient veil – subtle type-colored */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 0% 0%, ${typeColor}15, transparent 55%)`,
        }}
      />
      {/* Top color bar – red-900 */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: `linear-gradient(to right, ${typeColor}, transparent)` }}
      />

      <div className={hasThumbnail ? 'relative grid grid-cols-1 xl:grid-cols-[2fr_3fr] gap-0' : 'relative'}>
        {/* Thumbnail */}
        {hasThumbnail && (
          <div
            className="relative aspect-[16/9] xl:aspect-auto xl:min-h-[340px] overflow-hidden"
            style={{ background: 'var(--bg-surface)' }}
          >
            <img
              src={event.media!.thumbnail!}
              alt={event.titles.primary}
              className="w-full h-full object-cover"
            />
            <div
              className="hidden xl:block absolute inset-y-0 right-0 w-12 pointer-events-none"
              style={{ background: 'linear-gradient(to right, transparent, var(--bg-card))' }}
            />
          </div>
        )}

        {/* Content */}
        <div
          className={
            hasThumbnail
              ? 'p-6 sm:p-8 xl:p-10 flex flex-col justify-center'
              : 'p-8 sm:p-10 lg:px-16 lg:py-14 xl:px-20 xl:py-[72px] flex flex-col'
          }
        >
          {/* Eyebrow – red-900 accent */}
          <div
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] mb-4 font-mono"
            style={{ color: 'var(--accent)' }}
          >
            <span className="inline-block w-6 h-px" style={{ background: 'var(--accent)' }} />
            Sự kiện lịch sử
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span style={{ color: 'var(--text-muted)' }}>
              {event.eventLevel === 'collection' ? 'Chủ đề lớn' : 'Sự kiện cụ thể'}
            </span>
          </div>

          {/* Title – serif, CoiNguonPage-style */}
          <h1
            className="font-serif font-extrabold leading-[1.05] mb-3"
            style={{
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
            <p className="text-base md:text-lg mb-5 font-serif italic" style={{ color: 'var(--text-muted)' }}>
              Còn gọi là: <span className="italic font-semibold">{event.titles.short}</span>
            </p>
          )}

          {/* Badges row */}
          <div className="flex flex-wrap gap-2 mb-6">
            <Chip label={typeLabel} color={typeColor} filled />
            {event.classification.eventSubtype && <Chip label={event.classification.eventSubtype} />}
            {grades.length > 0 && (
              <Chip label={`SGK lớp ${grades.join(', ')}`} accent="accent" />
            )}
            <Chip
              label={isWorldHistory ? 'Bối cảnh thế giới' : 'Lịch sử Việt Nam'}
              accent={isWorldHistory ? 'warning' : 'accent'}
            />
          </div>

          {/* Meta row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <MetaItem label="Thời gian" value={event.chronology.displayDate} />
            {provinces.length > 0 && (
              <MetaItem label="Địa điểm" value={provinces.join(', ')} />
            )}
          </div>

          {/* CTA */}
          {showMapAction && (
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => navigate('/')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-all duration-200 font-mono text-xs tracking-wider uppercase"
                style={{ background: 'var(--accent)', color: '#fff', boxShadow: 'var(--shadow-glow)' }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.1)';
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.filter = 'none';
                  (e.currentTarget as HTMLButtonElement).style.transform = 'none';
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20" />
                </svg>
                Xem trên bản đồ 3D
              </button>
              <button
                onClick={() => navigate('/')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all duration-200 font-mono text-xs tracking-wider uppercase"
                style={{
                  background: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-card)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-surface)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                }}
              >
                Quay lại bản đồ
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ─── helpers ────────────────────────────────────────────────────────────── */

function Chip({
  label,
  color,
  filled,
  accent,
}: {
  label: string;
  color?: string;
  filled?: boolean;
  accent?: 'accent' | 'warning';
}) {
  let bg = 'var(--bg-surface)';
  let fg = 'var(--text-secondary)';
  let border = 'var(--border)';

  if (filled && color) {
    bg = `color-mix(in srgb, ${color} 20%, transparent)`;
    fg = color;
    border = `color-mix(in srgb, ${color} 45%, transparent)`;
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

function MetaItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const monogram = label === 'Thời gian' ? 'T' : 'Đ';
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      <div
        className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center font-mono text-sm font-bold"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
      >
        {monogram}
      </div>
      <div className="min-w-0">
        <div
          className="text-[10px] font-bold uppercase tracking-[0.14em] font-mono"
          style={{ color: 'var(--text-muted)' }}
        >
          {label}
        </div>
        <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
          {value}
        </div>
      </div>
    </div>
  );
}
