import { ArrowLeft, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { HistoricalEvent } from '../types/event';
import { getTerrainInsightBySlug } from '../data/terrainInsights';
import {
  EVENT_TYPE_LABELS,
  EVENT_TYPE_COLORS,
  GEO_TYPE_LABELS,
} from '../types/event';
import { formatChronologyLabel } from '../utils/chronology';
import type { TerrainViewModel } from '../types/terrain';
import TerrainControls from './terrain/TerrainControls';

interface EventPopupProps {
  event: HistoricalEvent;
  detailStatus?: 'idle' | 'loading' | 'ready' | 'error';
  onClose: () => void;
  onNavigateToChild: (child: HistoricalEvent) => void;
  onNavigateToParent: () => void;
  parentEvent: HistoricalEvent | null;
  terrain?: TerrainViewModel;
  onOpenTerrain?: () => void;
  onRetryTerrain?: () => void;
  onSelectTerrainTarget?: (targetId: string) => void;
  onShowTerrainOverview?: () => void;
  onExitTerrain?: () => void;
  onViewDetails: () => void;
}

export default function EventPopup({
  event,
  detailStatus = 'ready',
  onClose,
  onNavigateToChild,
  onNavigateToParent,
  parentEvent,
  terrain,
  onOpenTerrain,
  onRetryTerrain,
  onSelectTerrainTarget,
  onShowTerrainOverview,
  onExitTerrain,
  onViewDetails,
}: EventPopupProps) {
  const typeColor = EVENT_TYPE_COLORS[event.eventType];
  const terrainInsight = getTerrainInsightBySlug(event.slug);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, [event.id]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    // 1.1.20: EventPopup.tsx: Khởi tạo và trượt ra ở bên phải màn hình, nhận tham số sự kiện để hiển thị các trường: Tên sự kiện, Phân loại...
    <div
      role="dialog"
      aria-labelledby="event-popup-title"
      className="map-event-panel glass-map animate-slide-in-right absolute inset-y-0 right-0 md:relative"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-card)',
        borderLeft: '1px solid var(--border)',
        boxShadow: '-8px 0 24px -12px rgba(0,0,0,0.08)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          flexShrink: 0,
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
            id="event-popup-title"
            className="app-heading"
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
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="map-popup-action flex items-center justify-center w-9 h-9 rounded-[10px] cursor-pointer flex-shrink-0 border"
          style={{
            background: 'var(--bg-card)',
            borderColor: 'var(--border)',
            color: 'var(--text-muted)',
            boxShadow: 'var(--admin-shadow)',
          }}
        >
          <X size={16} strokeWidth={2.4} />
        </button>
      </div>

      <div
        className="map-event-panel-scroll"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          scrollbarGutter: 'stable',
        }}
      >
        {/* Content */}
        <div
          style={{
            marginBlock: '12px',
            padding: '4px 20px',
          }}
        >
        {/* Detail hydration keeps the summary panel usable while network work continues. */}
        {detailStatus === 'loading' && (
          <div role="status" aria-live="polite" className="text-xs mb-3.5" style={{ color: 'var(--text-muted)' }}>
            Đang tải nội dung chi tiết…
          </div>
        )}
        {detailStatus === 'error' && (
          <div
            role="alert"
            className="px-3.5 py-3 rounded-xl border text-xs mb-3.5"
            style={{ borderColor: 'rgba(220, 38, 38, 0.3)' }}
          >
            Chưa tải được nội dung chi tiết. Bạn vẫn có thể xem thông tin tóm tắt hoặc chọn sự kiện khác.
          </div>
        )}

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
              {formatChronologyLabel(event)}
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
            Chưa có địa điểm đủ tin cậy để hiển thị sự kiện này trên bản đồ.
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
            Sự kiện có phạm vi toàn quốc và không gắn với một điểm địa lý duy nhất.
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
                  className="map-popup-row flex items-center gap-3 w-full text-left px-3.5 py-3 rounded-xl border cursor-pointer"
                  style={{
              background: '#ffffff',
              borderColor: '#e7e5e4',
              color: '#1c1917',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
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
                      {formatChronologyLabel(child)} · {GEO_TYPE_LABELS[child.geoType]}
                    </div>
                  </div>

                </button>
              ))}
            </div>
          </div>
        )}
        </div>

        {/* Action buttons and terrain guidance share the panel scroll region.
            Active terrain insights can be taller than the viewport. */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
        <button
          onClick={onViewDetails}
          className="map-popup-action map-popup-action-primary flex-1 px-3 py-3 rounded-[10px] text-[13px] font-bold cursor-pointer border-0"
          style={{
            minWidth: '120px',
            background: '#8b1e1e',
            color: '#ffffff',
            boxShadow: '0 2px 8px rgba(139,30,30,0.2)',
          }}
        >
          Xem chi tiết
        </button>

        {event.geoType !== 'no_location' && event.geoType !== 'nationwide'
          && terrain && onOpenTerrain && onRetryTerrain && onSelectTerrainTarget
          && onShowTerrainOverview && onExitTerrain && (
          <TerrainControls
            terrain={terrain}
            insight={terrainInsight}
            onOpen={onOpenTerrain}
            onRetry={onRetryTerrain}
            onSelectTarget={onSelectTerrainTarget}
            onShowOverview={onShowTerrainOverview}
            onExit={onExitTerrain}
          />
        )}
        {parentEvent && (
          <button
            onClick={onNavigateToParent}
            className="map-popup-action flex-1 px-3 py-3 rounded-[10px] text-[13px] font-bold cursor-pointer border"
            style={{
              minWidth: '120px',
              borderColor: '#e7e5e4',
              background: '#ffffff',
              color: '#1c1917',
            }}
          >
            Quay lại
          </button>
        )}

        </div>
      </div>
    </div>
  );
}
