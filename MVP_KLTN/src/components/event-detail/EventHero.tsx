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
 * Hero của trang chi tiết sự kiện.
 * - Banner gradient theo màu eventType (đậm → trong suốt) để tăng tính sử thi.
 * - Bố cục: thumbnail trái 40%, content phải 60% (đảo lại trên mobile).
 * - Bám design_system.md mục 8 + 10.1.
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
      className="relative overflow-hidden rounded-3xl"
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
          background: `radial-gradient(circle at 0% 0%, ${typeColor}33, transparent 55%),
                       radial-gradient(circle at 100% 100%, var(--admin-accent-soft), transparent 55%)`,
        }}
      />
      {/* Top color bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
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
            fontFamily: 'serif',
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
            ? 'relative grid grid-cols-1 xl:grid-cols-[2fr_3fr] gap-0'
            : 'relative'
        }
      >
        {/* Thumbnail – chỉ render khi có ảnh */}
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
            {/* Subtle inner shadow on the right edge for depth on desktop */}
            <div
              className="hidden xl:block absolute inset-y-0 right-0 w-12 pointer-events-none"
              style={{
                background:
                  'linear-gradient(to right, transparent, var(--bg-card))',
              }}
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
          {/* Eyebrow */}
          <div
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] mb-4"
            style={{ color: 'var(--admin-accent)' }}
          >
            <span
              className="inline-block w-6 h-px"
              style={{ background: 'var(--admin-accent)' }}
            />
            Sự kiện lịch sử
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span style={{ color: 'var(--text-muted)' }}>
              {event.eventLevel === 'collection' ? 'Chủ đề lớn' : 'Sự kiện cụ thể'}
            </span>
          </div>

          {/* Title – auto-scale theo bề rộng cột */}
          <h1
            className="font-extrabold leading-[1.05] mb-3"
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
            {event.classification.eventSubtype && (
              <Chip label={event.classification.eventSubtype} />
            )}
            {grades.length > 0 && (
              <Chip
                label={`SGK lớp ${grades.join(', ')}`}
                accent="admin"
              />
            )}
            <Chip
              label={isWorldHistory ? 'Bối cảnh thế giới' : 'Lịch sử Việt Nam'}
              accent={isWorldHistory ? 'warning' : 'accent'}
            />
          </div>

          {/* Meta row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <MetaItem
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
              }
              label="Thời gian"
              value={event.chronology.displayDate}
            />
            {provinces.length > 0 && (
              <MetaItem
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1118 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                }
                label="Địa điểm"
                value={provinces.join(', ')}
              />
            )}
          </div>

          {/* CTA */}
          {showMapAction && (
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => navigate('/')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition"
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
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20" />
                </svg>
                Xem trên bản đồ 3D
              </button>
              <button
                onClick={() => navigate('/')}
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

function MetaItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      <div
        className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
        style={{
          background: 'var(--accent-soft)',
          color: 'var(--accent)',
        }}
      >
        {icon}
      </div>
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
