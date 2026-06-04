import {
  ArrowLeft,
  ArrowRight,
  Clock,
  CornerDownLeft,
  FileText,
  Info,
  Map as MapIcon,
  MapPin,
  Mountain,
  X,
} from 'lucide-react';
import type { HistoricalEvent } from '../types/event';
import {
  EVENT_TYPE_ICONS,
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
  const TypeIcon = EVENT_TYPE_ICONS[event.eventType];
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
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '20px',
          borderBottom: '1px solid var(--border)',
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
              style={{ color: 'var(--accent)' }}
            >
              <ArrowLeft size={13} strokeWidth={2.4} />
              Quay lại: {parentEvent.name}
            </button>
          )}

          <h2
            style={{
              fontSize: '1.25rem',
              fontWeight: 800,
              lineHeight: 1.3,
              marginBottom: '10px',
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            {event.name}
          </h2>

          {/* Tags */}
          <div className="flex gap-1.5 flex-wrap">
            <span
              className={`badge badge-${event.eventType} inline-flex items-center gap-1`}
            >
              <TypeIcon size={12} strokeWidth={2.4} />
              {EVENT_TYPE_LABELS[event.eventType]}
            </span>
            {event.eventSubtype && (
              <span
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border"
                style={{
                  background: 'rgba(148, 163, 184, 0.15)',
                  color: 'var(--color-text-dim)',
                  borderColor: 'rgba(148, 163, 184, 0.2)',
                }}
              >
                {event.eventSubtype}
              </span>
            )}
            <span
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border"
              style={{
                background: 'var(--bg-card)',
                color: 'var(--text-muted)',
                borderColor: 'var(--border)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              }}
            >
              <MapPin size={11} strokeWidth={2.4} />
              {GEO_TYPE_LABELS[event.geoType]}
            </span>
          </div>
        </div>

        <button
          onClick={onClose}
          aria-label="Đóng"
          className="flex items-center justify-center w-9 h-9 rounded-[10px] cursor-pointer flex-shrink-0 border transition-all duration-200"
          style={{
            background: 'var(--bg-app)',
            borderColor: 'var(--border)',
            color: 'var(--text-muted)',
            boxShadow: 'var(--shadow-sm)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--danger)';
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.borderColor = 'var(--danger)';
            e.currentTarget.style.transform = 'rotate(90deg)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg-app)';
            e.currentTarget.style.color = 'var(--text-muted)';
            e.currentTarget.style.borderColor = 'var(--border)';
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
            background: 'var(--bg-card)',
            borderColor: 'var(--border)',
            boxShadow: 'var(--shadow)',
          }}
        >
          <Clock
            size={20}
            strokeWidth={2.2}
            style={{ color: 'var(--accent)' }}
          />
          <div>
            <div
              className="text-[11px] uppercase tracking-[0.08em] font-bold"
              style={{ color: 'var(--text-muted)' }}
            >
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
            className="flex items-center gap-2 px-3.5 py-3 rounded-xl border text-xs mb-3.5"
            style={{
              background: 'var(--bg-card)',
              borderColor: 'rgba(194, 155, 75, 0.3)',
              color: 'var(--text-primary)',
            }}
          >
            <Info size={14} strokeWidth={2.2} style={{ color: '#c29b4b' }} />
            Sự kiện này không gắn với địa điểm cụ thể trên bản đồ.
          </div>
        )}

        {event.geoType === 'nationwide' && (
          <div
            className="flex items-center gap-2 px-3.5 py-3 rounded-xl border text-xs mb-3.5"
            style={{
              background: 'var(--bg-card)',
              borderColor: 'rgba(59, 130, 246, 0.3)',
              color: 'var(--text-primary)',
            }}
          >
            <MapIcon size={14} strokeWidth={2.2} style={{ color: '#3b82f6' }} />
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
                    background: 'var(--bg-app)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
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
            background: 'var(--bg-card)',
            borderRadius: '12px',
            border: '1px solid var(--border)',
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
                    background: 'var(--bg-card)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-app)';
                    e.currentTarget.style.borderColor = 'var(--accent)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--bg-card)';
                    e.currentTarget.style.borderColor = 'var(--border)';
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
                  <ArrowRight
                    size={14}
                    strokeWidth={2.2}
                    className="opacity-50"
                    style={{ color: 'var(--text-muted)' }}
                  />
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
          borderTop: '1px solid var(--border)',
          display: 'flex',
          gap: '8px',
        }}
      >
        {(event.geoType === 'multi_region' ||
          event.geoType === 'single_point') && (
            <button
              className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-3 rounded-[10px] text-[13px] font-bold cursor-pointer transition-all duration-200 border"
              style={{
                borderColor: 'var(--accent)',
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-card)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--accent-soft)';
                e.currentTarget.style.transform = 'none';
              }}
            >
              <Mountain size={14} strokeWidth={2.4} />
              Xem địa hình
            </button>
          )}
        <button
          onClick={() => {
            const detailKey = event.slug || event.id;
            navigate(`/events/${detailKey}`);
          }}
          className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-3 rounded-[10px] text-[13px] font-bold cursor-pointer transition-all duration-200 border-0"
          style={{
            background: 'var(--accent)',
            color: '#fff',
            boxShadow: '0 4px 12px rgba(30, 58, 95, 0.3)',
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
          <FileText size={14} strokeWidth={2.4} />
          Xem chi tiết
        </button>
        {parentEvent && (
          <button
            onClick={onNavigateToParent}
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-3 rounded-[10px] text-[13px] font-bold cursor-pointer transition-all duration-200 border"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-app)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--bg-card)';
              e.currentTarget.style.transform = 'none';
            }}
          >
            <CornerDownLeft size={14} strokeWidth={2.4} />
            Quay lại cha
          </button>
        )}
      </div>
    </div>
  );
}
