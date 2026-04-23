import type { MockEventDetail } from '../../data/mockEventDetails';

interface EventMediaGalleryProps {
  media?: MockEventDetail['media'];
}

export default function EventMediaGallery({ media }: EventMediaGalleryProps) {
  const hasImages = media && ((media.items && media.items.length > 0) || media.thumbnail);
  
  if (!hasImages) {
    return (
      <section id="media" className="scroll-mt-24 w-full max-w-4xl mt-8">
        <h2 className="text-2xl font-bold text-primary mb-4 border-b border-default pb-2">Tư liệu hình ảnh & Video</h2>
        <div className="bg-card border border-default border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-muted text-sm">
          <span className="text-3xl mb-2">🎞️</span>
          Chưa có tư liệu hình ảnh hoặc video cho sự kiện này.
        </div>
      </section>
    );
  }

  // Combine thumbnail and other items into one list for demo
  const allImages = [];
  if (media.thumbnail) allImages.push({ type: 'image', url: media.thumbnail, caption: 'Ảnh đại diện' });
  if (media.items) allImages.push(...media.items);

  return (
    <section id="media" className="scroll-mt-24 w-full max-w-4xl mt-8">
      <h2 className="text-2xl font-bold text-primary mb-4 border-b border-default pb-2">Tư liệu & Media</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {allImages.map((item, idx) => (
          <div key={idx} className="bg-card rounded-xl overflow-hidden border border-default flex flex-col group shadow-theme">
            <div className="aspect-video w-full relative overflow-hidden bg-surface flex items-center justify-center">
              {item.type === 'video' ? (
                <div className="flex flex-col items-center justify-center gap-2 text-muted">
                  <span className="text-3xl">▶️</span>
                  <span className="text-xs">Video Content</span>
                </div>
              ) : (
                <img 
                  src={item.url} 
                  alt={item.caption || 'Media item'} 
                  className="object-cover w-full h-full group-hover:scale-105 transition duration-500"
                />
              )}
            </div>
            {item.caption && (
              <div className="text-xs text-muted p-3 bg-card">
                {item.caption}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
