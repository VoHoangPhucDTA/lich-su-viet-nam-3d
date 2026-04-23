import type { MockEventDetail } from '../../data/mockEventDetails';
import { useNavigate } from 'react-router-dom';

interface EventLocationCardProps {
  event: MockEventDetail;
}

export default function EventLocationCard({ event }: EventLocationCardProps) {
  const navigate = useNavigate();
  const geometry = event.mapData?.displayGeometry;
  
  const isVietnamEvent = !event.classification.tags?.includes('lịch sử thế giới');
  const hasLocation = geometry && geometry.geoType !== 'no_location';
  
  if (!isVietnamEvent) {
    return null; // Don't show map card for world history by default
  }

  if (!hasLocation) {
    return (
      <section id="dia-diem" className="scroll-mt-24 w-full max-w-4xl mt-8">
        <h2 className="text-2xl font-bold text-primary mb-4 border-b border-default pb-2">Địa điểm</h2>
        <div className="rounded-2xl p-4 text-[14px] flex items-center gap-2 border" style={{ background: 'color-mix(in srgb, var(--warning) 14%, transparent)', color: 'var(--text-primary)', borderColor: 'color-mix(in srgb, var(--warning) 38%, transparent)' }}>
          <span>ℹ️</span> Sự kiện này không gắn với địa điểm cụ thể trên bản đồ.
        </div>
      </section>
    );
  }

  return (
    <section id="dia-diem" className="scroll-mt-24 w-full max-w-4xl mt-8">
      <h2 className="text-2xl font-bold text-primary mb-4 border-b border-default pb-2">Địa điểm</h2>
      <div className="bg-card border border-default rounded-2xl p-6 shadow-theme">
        <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">🗺️</span>
              <span className="font-semibold text-primary">
                {geometry?.geoType === 'nationwide' ? 'Toàn quốc' : 'Khu vực cụ thể'}
              </span>
            </div>
            
            {geometry?.provinceNames && geometry.provinceNames.length > 0 && (
              <div className="text-sm text-secondary mt-2">
                <strong>Tỉnh/Thành phố:</strong> {geometry.provinceNames.join(', ')}
              </div>
            )}
            
            {geometry?.historicalLocations && geometry.historicalLocations.length > 0 && (
              <div className="text-sm text-secondary mt-1">
                <strong>Địa danh lịch sử:</strong> {geometry.historicalLocations.join(', ')}
              </div>
            )}
          </div>
          
          <button 
            onClick={() => navigate('/')} // Back to map
            className="px-5 py-2.5 text-white text-sm font-semibold rounded-xl transition flex items-center gap-2 shrink-0"
            style={{ background: 'var(--accent)' }}
          >
            <span>🌍</span> Xem trên bản đồ 3D
          </button>
        </div>
      </div>
    </section>
  );
}
