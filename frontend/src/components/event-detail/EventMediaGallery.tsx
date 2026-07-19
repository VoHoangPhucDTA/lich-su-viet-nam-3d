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

export default function EventMediaGallery({ media, index = '07' }: EventMediaGalleryProps) {
  const rawItems: MediaItem[] = [];
  if (media?.thumbnail) {
    rawItems.push({ type: 'image', url: media.thumbnail, caption: 'Ảnh đại diện' });
  }
  if (media?.items) {
    rawItems.push(...media.items.map((it) => ({ type: it.type, url: it.url, caption: it.caption })));
  }

  const items = rawItems.filter(
    (item, idx, arr) =>
      item.url &&
      arr.findIndex((candidate) => candidate.url === item.url && candidate.type === item.type) === idx
  );
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  if (items.length === 0) {
    return (
      <section id="media" className="scroll-mt-28 w-full">
        <SectionHeader index={index} title="Tư liệu hình ảnh & video" />
        <div
          className="rounded-2xl p-10 flex flex-col items-center justify-center gap-3"
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
                <div className="w-full h-full flex flex-col items-center justify-center gap-3" style={{ color: 'var(--text-muted)' }}>
                  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    {item.type === 'video' ? (
                      <polygon points="7,4 19,12 7,20" />
                    ) : (
                      <>
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <path d="M14 2v6h6" />
                      </>
                    )}
                  </svg>
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
