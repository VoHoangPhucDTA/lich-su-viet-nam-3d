import { useState } from 'react';
import type { MockEventDetail } from '../../data/mockEventDetails';
import SectionHeader from './SectionHeader';

interface EventMediaGalleryProps {
  media?: MockEventDetail['media'];
  index?: string;
}

interface MediaItem {
  type: string;
  url: string;
  caption?: string;
}

/**
 * Gallery dạng "primary lớn + thumb dọc" + lightbox đơn giản.
 */
export default function EventMediaGallery({ media, index = '07' }: EventMediaGalleryProps) {
  const items: MediaItem[] = [];
  if (media?.thumbnail) {
    items.push({ type: 'image', url: media.thumbnail, caption: 'Ảnh đại diện' });
  }
  if (media?.items) {
    items.push(...media.items.map((it) => ({ type: it.type, url: it.url, caption: it.caption })));
  }

  const [activeIdx, setActiveIdx] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  if (items.length === 0) {
    return (
      <section id="media" className="scroll-mt-28 w-full">
        <SectionHeader index={index} title="Tư liệu hình ảnh & video" />
        <div
          className="rounded-2xl p-10 flex flex-col items-center justify-center gap-3 border-dashed"
          style={{
            background: 'var(--bg-card)',
            border: '1px dashed var(--border)',
            color: 'var(--text-muted)',
          }}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <span className="text-sm">Chưa có tư liệu hình ảnh hoặc video cho sự kiện này.</span>
        </div>
      </section>
    );
  }

  const active = items[activeIdx];

  return (
    <section id="media" className="scroll-mt-28 w-full">
      <SectionHeader
        index={index}
        title="Tư liệu hình ảnh & video"
        subtitle={`${items.length} tư liệu được sưu tầm từ SGK và nguồn mở.`}
      />

      <div className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-4">
        {/* Main viewer */}
        <button
          onClick={() => setLightbox(true)}
          className="relative aspect-[16/10] rounded-2xl overflow-hidden cursor-zoom-in"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow)',
          }}
        >
          {active.type === 'video' ? (
            <div
              className="w-full h-full flex flex-col items-center justify-center gap-3"
              style={{ color: 'var(--text-muted)' }}
            >
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                <polygon points="5,3 19,12 5,21" />
              </svg>
              <span className="text-sm">Nội dung video</span>
            </div>
          ) : (
            <img
              src={active.url}
              alt={active.caption || 'Tư liệu sự kiện'}
              className="w-full h-full object-cover"
            />
          )}
          {active.caption && (
            <div
              className="absolute bottom-0 left-0 right-0 p-4 text-sm"
              style={{
                background:
                  'linear-gradient(to top, rgba(0,0,0,0.78), transparent)',
                color: '#fff',
              }}
            >
              {active.caption}
            </div>
          )}
        </button>

        {/* Thumbnails */}
        <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-y-auto md:max-h-[420px] pb-2 md:pb-0 md:pr-1">
          {items.map((it, idx) => {
            const isActive = idx === activeIdx;
            return (
              <button
                key={idx}
                onClick={() => setActiveIdx(idx)}
                className="relative aspect-square w-24 md:w-full flex-shrink-0 rounded-lg overflow-hidden transition"
                style={{
                  background: 'var(--bg-surface)',
                  border: `2px solid ${isActive ? 'var(--admin-accent)' : 'var(--border)'}`,
                  opacity: isActive ? 1 : 0.7,
                }}
              >
                {it.type === 'video' ? (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5,3 19,12 5,21" />
                    </svg>
                  </div>
                ) : (
                  <img src={it.url} alt={it.caption || ''} className="w-full h-full object-cover" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && active.type !== 'video' && (
        <div
          onClick={() => setLightbox(false)}
          className="fixed inset-0 z-[200] flex items-center justify-center p-6 cursor-zoom-out"
          style={{ background: 'rgba(4, 10, 20, 0.92)', backdropFilter: 'blur(6px)' }}
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
              style={{ background: 'rgba(11,18,32,0.7)', color: '#fff' }}
            >
              {active.caption}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
