import { useMemo, useState } from 'react';
import type { MockEventDetail } from '../../data/mockEventDetails';
import SectionHeader from './SectionHeader';

interface EventMediaGalleryProps {
  media?: MockEventDetail['media'];
  index?: string;
}

type EventMediaItem = NonNullable<
  NonNullable<MockEventDetail['media']>['items']
>[number];

interface MediaItem {
  type: string;
  url: string;
  caption?: string;
  /** Stable asset identity when callers expose it. Used to deduplicate the
   *  representative image even when its canonical URL appears inside items[]. */
  id?: string;
}

/**
 * Identify the item inside `media.items[]` that is the same asset as the
 * event's representative / hero image, preferring the most stable identity:
 *
 * 1. explicit matching `mediaItem.id` (when the data layer provides one),
 * 2. the `(type, url)` of the thumbnail image otherwise.
 *
 * Returning `null` means no item is the representative asset; the gallery
 * then renders EVERY image in items[] (because the user only set a URL-based
 * thumbnail without identifying which item it came from).
 */
function findRepresentativeItem(
  media: MockEventDetail['media'] | undefined,
): EventMediaItem | null {
  const items = media?.items ?? [];
  const repUrl = media?.thumbnail;
  if (!repUrl) return null;
  return items.find((item) => item.type === 'image' && item.url === repUrl) ?? null;
}

function isRepresentative(
  candidate: EventMediaItem | undefined,
  rep: EventMediaItem | null,
  repUrl: string | undefined,
): boolean {
  if (!candidate || !repUrl) return false;
  if (rep && rep.id && candidate.id === rep.id) return true;
  return candidate.type === 'image' && candidate.url === repUrl;
}

export default function EventMediaGallery({ media, index = '07' }: EventMediaGalleryProps) {
  const repItem = useMemo(() => findRepresentativeItem(media), [media]);
  const repUrl = media?.thumbnail;

  // Render only supplementary media. The representative image (matching the
  // hero by ID first, then by `(type, url)`) is excluded from the gallery
  // even when it also lives inside `media.items[]`. The hero component on
  // the page is the single source of truth for the cover image.
  const items: MediaItem[] = useMemo(() => {
    const supplemental = (media?.items ?? [])
      .filter((item) => !isRepresentative(item, repItem, repUrl))
      .map((item) => ({
        type: item.type,
        url: item.url,
        caption: item.caption,
        id: item.id,
      }));
    // Stable dedup across obvious intra-collection duplicates.
    const seen = new Set<string>();
    const deduped: MediaItem[] = [];
    for (const item of supplemental) {
      if (!item.url) continue;
      const key = `${item.type}::${item.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }
    return deduped;
  }, [media, repItem, repUrl]);

  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  // If all media are part of the hero, hide the entire section to avoid
  // rendering an empty "Tư liệu hình ảnh & video" card with no content.
  if (items.length === 0) {
    return null;
  }

  const openItem = (item: MediaItem, idx: number) => {
    if (item.type === 'image') {
      setLightboxIdx(idx);
      return;
    }
    window.open(item.url, '_blank', 'noopener,noreferrer');
  };

  const active = lightboxIdx === null ? null : items[lightboxIdx];

  return (
    <section id="media" className="scroll-mt-28 w-full">
      <SectionHeader
        index={index}
        title="Tư liệu hình ảnh & video"
        subtitle={`${items.length} tư liệu được sưu tầm.`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map((item, idx) => (
          <button
            key={`${item.type}-${item.url}-${idx}`}
            onClick={() => openItem(item, idx)}
            className="group text-left rounded-2xl overflow-hidden transition-all duration-200"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
            }}
          >
            <div className="aspect-[16/10] overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
              {item.type === 'image' ? (
                <img
                  src={item.url}
                  alt={item.caption || 'Tư liệu sự kiện'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center" style={{ color: 'var(--text-muted)' }}>
                  <span className="text-sm font-medium">
                    {item.type === 'video' ? 'Mở video' : 'Mở tư liệu'}
                  </span>
                </div>
              )}
            </div>
            <div className="p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: 'var(--text-muted)' }}>
                {item.type === 'video' ? 'Video' : item.type === 'document' ? 'Tài liệu' : 'Hình ảnh'}
              </div>
              <div className="text-sm font-semibold line-clamp-2" style={{ color: 'var(--text-primary)' }}>
                {item.caption || 'Tư liệu sự kiện'}
              </div>
            </div>
          </button>
        ))}
      </div>

      {active && active.type === 'image' && (
        <div
          onClick={() => setLightboxIdx(null)}
          className="fixed inset-0 z-[200] flex items-center justify-center p-6 cursor-zoom-out"
          style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(6px)' }}
        >
          <img
            src={active.url}
            alt={active.caption || ''}
            className="max-w-full max-h-full object-contain rounded-xl"
            style={{ boxShadow: '0 24px 60px -12px rgba(0,0,0,0.6)' }}
          />
          {active.caption && (
            <div
              className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-sm"
              style={{ background: 'rgba(0,0,0,0.7)', color: '#fff' }}
            >
              {active.caption}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
