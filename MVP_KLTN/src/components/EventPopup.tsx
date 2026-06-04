import type { HistoricalEvent } from '../types/event';
import {
  EVENT_TYPE_ICONS,
  EVENT_TYPE_LABELS,
  EVENT_TYPE_COLORS,
  GEO_TYPE_LABELS,
} from '../types/event';

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

  return (
    <div
      className="glass animate-slide-in-right"
      style={{
        width: '380px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid rgba(71, 85, 105, 0.4)',
        zIndex: 10,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(71, 85, 105, 0.3)',
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
                color: 'var(--color-primary-light)',
                fontSize: '12px',
                fontWeight: 500,
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
              fontSize: '18px',
              fontWeight: 700,
              lineHeight: 1.3,
              marginBottom: '8px',
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
                padding: '2px 10px',
                borderRadius: '9999px',
                fontSize: '11px',
                fontWeight: 500,
                background: 'rgba(148, 163, 184, 0.1)',
                color: 'var(--color-text-dim)',
                border: '1px solid rgba(148, 163, 184, 0.15)',
              }}
            >
              📍 {GEO_TYPE_LABELS[event.geoType]}
            </span>
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            background: 'var(--color-surface-3)',
            border: 'none',
            color: 'var(--color-text)',
            cursor: 'pointer',
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            flexShrink: 0,
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.3)')
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = 'var(--color-surface-3)')
          }
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
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
            padding: '10px 14px',
            background: 'var(--color-surface)',
            borderRadius: '10px',
            border: '1px solid var(--color-surface-3)',
          }}
        >
          <span style={{ fontSize: '18px' }}>🕐</span>
          <div>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--color-text-dim)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontWeight: 600,
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
              padding: '10px 14px',
              marginBottom: '16px',
              background: 'rgba(245, 158, 11, 0.1)',
              borderRadius: '10px',
              border: '1px solid rgba(245, 158, 11, 0.2)',
              fontSize: '12px',
              color: '#fcd34d',
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
              padding: '10px 14px',
              marginBottom: '16px',
              background: 'rgba(59, 130, 246, 0.1)',
              borderRadius: '10px',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              fontSize: '12px',
              color: '#93c5fd',
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
                fontWeight: 600,
                color: 'var(--color-text-dim)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '6px',
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
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-dim)',
                    border: '1px solid var(--color-surface-3)',
                  }}
                >
                  {region}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        <div style={{ marginBottom: '20px' }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--color-text-dim)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '6px',
            }}
          >
            Mô tả
          </div>
          <p
            style={{
              fontSize: '13px',
              lineHeight: 1.7,
              color: 'var(--color-text)',
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
                fontWeight: 600,
                color: 'var(--color-text-dim)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '8px',
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
                    gap: '10px',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid var(--color-surface-3)',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                    width: '100%',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--color-surface-2)';
                    e.currentTarget.style.borderColor = 'var(--color-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--color-surface)';
                    e.currentTarget.style.borderColor = 'var(--color-surface-3)';
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
                        color: 'var(--color-text-dim)',
                        marginTop: '2px',
                      }}
                    >
                      {child.startYear} · {GEO_TYPE_LABELS[child.geoType]}
                    </div>
                  </div>
                  <span
                    style={{
                      color: 'var(--color-text-dim)',
                      fontSize: '12px',
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
          padding: '12px 20px',
          borderTop: '1px solid rgba(71, 85, 105, 0.3)',
          display: 'flex',
          gap: '8px',
        }}
      >
        {(event.geoType === 'multi_region' ||
          event.geoType === 'single_point') && (
          <button
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '8px',
              border: '1px solid var(--color-primary)',
              background: 'rgba(99, 102, 241, 0.1)',
              color: 'var(--color-primary-light)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)';
            }}
          >
            🏔️ Xem địa hình
          </button>
        )}
        {parentEvent && (
          <button
            onClick={onNavigateToParent}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '8px',
              border: '1px solid var(--color-surface-3)',
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-surface-2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--color-surface)';
            }}
          >
            ↩ Quay lại cha
          </button>
        )}
      </div>
    </div>
  );
}
