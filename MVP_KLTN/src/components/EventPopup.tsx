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
  const navigate = useNavigate();

  return (
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
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'none',
                border: 'none',
                color: 'var(--accent)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                marginBottom: '8px',
                padding: 0,
              }}
            >
              ← Quay lại: {parentEvent.name}
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
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <span className={`badge badge-${event.eventType}`}>
              {EVENT_TYPE_ICONS[event.eventType]}{' '}
              {EVENT_TYPE_LABELS[event.eventType]}
            </span>
            {event.eventSubtype && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '2px 10px',
                  borderRadius: '9999px',
                  fontSize: '11px',
                  fontWeight: 500,
                  background: 'rgba(148, 163, 184, 0.15)',
                  color: 'var(--color-text-dim)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                }}
              >
                {event.eventSubtype}
              </span>
            )}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '3px 10px',
                borderRadius: '9999px',
                fontSize: '11px',
                fontWeight: 600,
                background: 'var(--bg-card)',
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              }}
            >
              📍 {GEO_TYPE_LABELS[event.geoType]}
            </span>
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            background: 'var(--bg-app)',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            flexShrink: 0,
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
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
          ✕
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
          style={{
            padding: '12px 16px',
            background: 'var(--bg-card)',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '14px',
          }}
        >
          <span style={{ fontSize: '18px' }}>🕐</span>
          <div>
            <div
              style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 700,
            }}
          >
            Thời gian
          </div>
            <div style={{ fontSize: '15px', fontWeight: 600 }}>
              {event.startYear}
              {event.endYear && event.endYear !== event.startYear
                ? ` – ${event.endYear}`
                : ''}
            </div>
          </div>
        </div>

        {/* Location info */}
        {event.geoType === 'no_location' && (
          <div
            style={{
              padding: '12px 14px',
              marginBottom: '14px',
              background: 'var(--bg-card)',
              borderRadius: '12px',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              fontSize: '12px',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>ℹ️</span>
            Sự kiện này không gắn với địa điểm cụ thể trên bản đồ.
          </div>
        )}

        {event.geoType === 'nationwide' && (
          <div
            style={{
              padding: '12px 14px',
              marginBottom: '14px',
              background: 'var(--bg-card)',
              borderRadius: '12px',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              fontSize: '12px',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>🗺️</span>
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
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                    width: '100%',
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
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: typeColor,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '13px',
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {child.name}
                    </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          marginTop: '2px',
                        }}
                      >
                      {child.startYear} · {GEO_TYPE_LABELS[child.geoType]}
                    </div>
                  </div>
                  <span
                    style={{
                      color: 'var(--text-muted)',
                      fontSize: '14px',
                      opacity: 0.5,
                    }}
                  >
                    →
                  </span>
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
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '10px',
              border: '1px solid var(--accent)',
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s',
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
            🏔️ Xem địa hình
          </button>
        )}
        <button
          onClick={() => {
            const detailKey = event.slug || event.id;
            navigate(`/events/${detailKey}`);
          }}
          style={{
            flex: 1,
            padding: '12px',
            borderRadius: '10px',
            border: 'none',
            background: 'var(--accent)',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s',
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
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
          📄 Xem chi tiết
        </button>
        {parentEvent && (
          <button
            onClick={onNavigateToParent}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s',
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
            ↩ Quay lại cha
          </button>
        )}
      </div>
    </div>
  );
}
