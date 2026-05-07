import { useNavigate } from 'react-router-dom';
import type { MockEventDetail } from '../../data/mockEventDetails';
import SectionHeader from './SectionHeader';

interface EventLocationCardProps {
  event: MockEventDetail;
  index?: string;
}

/**
 * Khối "Địa điểm" – hiển thị tỉnh/địa danh + CTA bay tới bản đồ 3D.
 */
export default function EventLocationCard({ event, index = '05' }: EventLocationCardProps) {
  const navigate = useNavigate();
  const geometry = event.mapData?.displayGeometry;
  const isVietnamEvent = !event.classification.tags?.includes('lịch sử thế giới');
  const hasLocation = geometry && geometry.geoType !== 'no_location';

  if (!isVietnamEvent) return null;

  if (!hasLocation) {
    return (
      <section id="dia-diem" className="scroll-mt-28 w-full">
        <SectionHeader index={index} title="Địa điểm" />
        <div
          className="p-6 md:p-8 rounded-2xl flex items-center gap-3"
          style={{
            background: 'var(--warning-soft)',
            border:
              '1px solid color-mix(in srgb, var(--warning) 40%, transparent)',
            color: 'var(--text-primary)',
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className="flex-shrink-0"
            style={{ color: 'var(--warning)' }}
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <span className="text-sm">
            Sự kiện này không gắn với một địa điểm cụ thể trên bản đồ.
          </span>
        </div>
      </section>
    );
  }

  const isNationwide = geometry.geoType === 'nationwide';
  const provinces = geometry.provinceNames ?? [];
  const historical = geometry.historicalLocations ?? [];

  return (
    <section id="dia-diem" className="scroll-mt-28 w-full">
      <SectionHeader
        index={index}
        title="Địa điểm"
        subtitle="Vị trí địa lý liên quan đến sự kiện trên bản đồ 3D Việt Nam."
      />

      <div
        className="p-6 md:p-8 lg:p-10 rounded-2xl overflow-hidden"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow)',
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] items-center gap-6">
          <div className="min-w-0 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span
                className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-[0.14em]"
                style={{
                  background: 'var(--accent-soft)',
                  color: 'var(--accent)',
                  border:
                    '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
                }}
              >
                {isNationwide ? 'Toàn quốc' : geoTypeLabel(geometry.geoType)}
              </span>
            </div>

            {provinces.length > 0 && (
              <LocationRow
                label="Tỉnh / Thành phố hiện đại"
                items={provinces}
              />
            )}

            {historical.length > 0 && (
              <LocationRow
                label="Địa danh lịch sử"
                items={historical}
                italic
              />
            )}
          </div>

          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold transition shrink-0 hover:brightness-110"
            style={{
              background: 'var(--accent)',
              color: '#fff',
              boxShadow: '0 8px 18px -10px rgba(0,0,0,0.35)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1118 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            Xem trên bản đồ 3D
          </button>
        </div>
      </div>
    </section>
  );
}

function LocationRow({
  label,
  items,
  italic,
}: {
  label: string;
  items: string[];
  italic?: boolean;
}) {
  return (
    <div>
      <div
        className="text-[10px] font-bold uppercase tracking-[0.16em] mb-2"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <span
            key={it}
            className={`text-sm font-medium px-3 py-1.5 rounded-lg ${italic ? 'italic' : ''}`}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

function geoTypeLabel(t?: string) {
  switch (t) {
    case 'single_point':
    case 'point':
      return 'Một điểm';
    case 'multi_point':
      return 'Nhiều điểm';
    case 'multi_region':
    case 'multi_polygon':
      return 'Nhiều vùng';
    case 'polygon':
      return 'Một vùng';
    case 'nationwide':
      return 'Toàn quốc';
    case 'mixed':
      return 'Hỗn hợp';
    default:
      return 'Khu vực cụ thể';
  }
}
