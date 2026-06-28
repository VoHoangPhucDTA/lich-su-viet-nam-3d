import {
  ArrowLeft,
  X,
  Mountain,
} from 'lucide-react';
import type { HistoricalEvent } from '../types/event';
import {
  EVENT_TYPE_LABELS,
  EVENT_TYPE_COLORS,
  GEO_TYPE_LABELS,
} from '../types/event';
import { useNavigate } from 'react-router-dom';

interface EventPopupProps {
  event: HistoricalEvent;
  onClose: () => void;
  onNavigateToChild: (child: HistoricalEvent) => void;
  onNavigateToParent: () => void;
  parentEvent: HistoricalEvent | null;
}

export default function EventPopup({
  event,
  onClose,
  onNavigateToChild,
  onNavigateToParent,
  parentEvent,
}: EventPopupProps) {
  const typeColor = EVENT_TYPE_COLORS[event.eventType];
  const navigate = useNavigate();

  const formatYear = (year: number) =>
    year < 0 ? `${Math.abs(year)} TCN` : `${year}`;

  return (
    // 1.1.20: EventPopup.tsx: Khởi tạo và trượt ra ở bên phải màn hình, nhận tham số sự kiện để hiển thị các trường: Tên sự kiện, Phân loại...
    <div
      className="glass-map animate-slide-in-right"
      style={{
        width: '400px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10,
        background: '#ffffff',
        borderLeft: '1px solid #e7e5e4',
        boxShadow: '-8px 0 24px -12px rgba(0,0,0,0.08)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '20px',
          borderBottom: '1px solid #e7e5e4',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ flex: 1 }}>
          {/* Back button */}
          {parentEvent && (
            <button
              onClick={onNavigateToParent}
              className="flex items-center gap-1.5 bg-transparent border-0 text-xs font-semibold cursor-pointer mb-2 p-0"
              style={{ color: '#8b1e1e' }}
            >
              <ArrowLeft size={13} strokeWidth={2.4} />
              Quay lại: {parentEvent.name}
            </button>
          )}

          <h2
            className="serif-heading"
            style={{
              fontSize: '1.25rem',
              fontWeight: 800,
              lineHeight: 1.3,
              marginBottom: '10px',
              color: 'var(--text-primary)',
            }}
          >
            {event.name}
          </h2>

          {/* Tags */}
          <div className="flex gap-1.5 flex-wrap">
            <span
              className={`badge badge-${event.eventType}`}
            >
              {EVENT_TYPE_LABELS[event.eventType]}
            </span>
            {event.eventSubtype && (
              <span
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border"
                style={{
                  background: 'rgba(120, 113, 108, 0.12)',
                  color: '#57534e',
                  borderColor: 'rgba(120, 113, 108, 0.2)',
                }}
              >
                {event.eventSubtype}
              </span>
            )}
            <span
              className="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold border"
              style={{
                background: '#ffffff',
                color: '#78716c',
                borderColor: '#e7e5e4',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              }}
            >
              {GEO_TYPE_LABELS[event.geoType]}
            </span>
          </div>
        </div>

        <button
          onClick={onClose}
          aria-label="Đóng"
          className="flex items-center justify-center w-9 h-9 rounded-[10px] cursor-pointer flex-shrink-0 border transition-all duration-200"
          style={{
            background: '#ffffff',
            borderColor: '#e7e5e4',
            color: '#78716c',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#8b1e1e';
            e.currentTarget.style.color = '#ffffff';
            e.currentTarget.style.borderColor = '#8b1e1e';
            e.currentTarget.style.transform = 'rotate(90deg)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#ffffff';
            e.currentTarget.style.color = '#78716c';
            e.currentTarget.style.borderColor = '#e7e5e4';
            e.currentTarget.style.transform = 'rotate(0deg)';
          }}
        >
          <X size={16} strokeWidth={2.4} />
        </button>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
        }}
      >
        {/* Time info */}
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl border mb-3.5"
          style={{
            background: '#ffffff',
            borderColor: '#e7e5e4',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}
        >
          <div>
            <div
              className="text-[11px] uppercase tracking-[0.08em] font-bold"              style={{ color: '#78716c' }}>
              Thời gian
            </div>
            <div className="text-[15px] font-semibold">
              {formatYear(event.startYear)}
              {event.endYear && event.endYear !== event.startYear
                ? ` – ${formatYear(event.endYear)}`
                : ''}
            </div>
          </div>
        </div>

        {/* Location info */}
        {event.geoType === 'no_location' && (
          <div
            className="px-3.5 py-3 rounded-xl border text-xs mb-3.5"
            style={{
              background: 'var(--bg-card)',
              borderColor: 'rgba(194, 155, 75, 0.3)',
              color: 'var(--text-primary)',
            }}
          >
            Sự kiện này không gắn với địa điểm cụ thể trên bản đồ.
          </div>
        )}

        {event.geoType === 'nationwide' && (
          <div
            className="px-3.5 py-3 rounded-xl border text-xs mb-3.5"
            style={{
              background: 'var(--bg-card)',
              borderColor: 'rgba(59, 130, 246, 0.3)',
              color: 'var(--text-primary)',
            }}
          >
            Phạm vi: Toàn quốc
          </div>
        )}

        {/* Regions */}
        {event.primaryRegions && event.primaryRegions.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '10px',
              }}
            >
              Địa điểm
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {event.primaryRegions.map((region) => (
                <span
                  key={region}
                  style={{
                    padding: '3px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 500,
                    background: `${typeColor}20`,
                    color: typeColor,
                    border: `1px solid ${typeColor}40`,
                  }}
                >
                  {region}
                </span>
              ))}
              {event.secondaryRegions?.map((region) => (
                <span
                  key={region}
                  style={{
                    padding: '3px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 500,
                    background: '#fafaf9',
                    color: '#57534e',
                    border: '1px solid #e7e5e4',
                  }}
                >
                  {region}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        <div
          style={{
            marginBottom: '20px',
            padding: '12px 16px',
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e7e5e4',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '10px',
            }}
          >
            Mô tả
          </div>
          <p
            style={{
              fontSize: '0.875rem',
              lineHeight: 1.7,
              color: 'var(--text-primary)',
            }}
          >
            {event.details || event.description}
          </p>
        </div>

        {/* Children list */}
        {event.children && event.children.length > 0 && (
          <div>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '12px',
              }}
            >
              Sự kiện con ({event.children.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {event.children.map((child) => (
                <button
                  key={child.id}
                  onClick={() => onNavigateToChild(child)}
                  className="flex items-center gap-3 w-full text-left px-3.5 py-3 rounded-xl border cursor-pointer transition-all duration-200"
                  style={{
              background: '#ffffff',
              borderColor: '#e7e5e4',
              color: '#1c1917',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#fafaf9';
                    e.currentTarget.style.borderColor = '#8b1e1e';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#ffffff';
                    e.currentTarget.style.borderColor = '#e7e5e4';
                    e.currentTarget.style.transform = 'none';
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: typeColor }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">
                      {child.name}
                    </div>
                    <div
                      className="text-[11px] mt-0.5"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {formatYear(child.startYear)} · {GEO_TYPE_LABELS[child.geoType]}
                    </div>
                  </div>

                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div
        style={{
          padding: '16px 20px',
          borderTop: '1px solid #e7e5e4',
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={() => {
            const detailKey = event.slug || event.id;
            navigate(`/events/${detailKey}`, { state: { from: window.location.pathname } });
          }}
          className="flex-1 px-3 py-3 rounded-[10px] text-[13px] font-bold cursor-pointer transition-all duration-200 border-0"
          style={{
            minWidth: '120px',
            background: '#8b1e1e',
            color: '#ffffff',
            boxShadow: '0 2px 8px rgba(139,30,30,0.2)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.filter = 'brightness(1.1)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = 'none';
            e.currentTarget.style.transform = 'none';
          }}
        >
          Xem chi tiết
        </button>

        {/* Terrain View placeholder — chuẩn bị cho tính năng 3D Địa hình tương lai */}
        <button
          disabled
          title="Tính năng Xem Địa hình 3D đang được phát triển"
          className="flex items-center justify-center gap-1.5 px-3 py-3 rounded-[10px] text-[13px] font-semibold transition-all duration-200 border opacity-50 cursor-not-allowed"
          style={{
            borderColor: '#e7e5e4',
            background: '#ffffff',
            color: '#78716c',
          }}
          tabIndex={-1}
        >
          <Mountain size={15} strokeWidth={2.2} />
          3D Địa hình
        </button>

        {parentEvent && (
          <button
            onClick={onNavigateToParent}
            className="flex-1 px-3 py-3 rounded-[10px] text-[13px] font-bold cursor-pointer transition-all duration-200 border"
            style={{
              minWidth: '120px',
              borderColor: '#e7e5e4',
              background: '#ffffff',
              color: '#1c1917',
            }}
            onMouseEnter={(e) => {                e.currentTarget.style.background = '#fafaf9';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--bg-card)';
              e.currentTarget.style.transform = 'none';
            }}
          >
            Quay lại cha
          </button>
        )}

      </div>
    </div>
  );
}
