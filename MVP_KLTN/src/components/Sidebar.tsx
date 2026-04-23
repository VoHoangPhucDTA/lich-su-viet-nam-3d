import { useState, useMemo } from 'react';
import type { HistoricalEvent, EventType } from '../types/event';
import {
  EVENT_TYPE_ICONS,
  EVENT_TYPE_LABELS,
  EVENT_TYPE_COLORS,
} from '../types/event';
import { useNavigate } from 'react-router-dom';

interface SidebarProps {
  events: HistoricalEvent[];
  selectedEvent: HistoricalEvent | null;
  onSelectEvent: (event: HistoricalEvent) => void;
  onHoverEvent: (eventId: string | null) => void;
}

const EVENT_TYPE_FILTERS: EventType[] = [
  'military',
  'political',
  'economic',
  'cultural',
];

export default function Sidebar({
  events,
  selectedEvent,
  onSelectEvent,
  onHoverEvent,
}: SidebarProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<EventType | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const filteredEvents = useMemo(() => {
    let result = events;
    if (activeFilter) {
      result = result.filter((e) => e.eventType === activeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q)
      );
    }
    return result;
  }, [events, activeFilter, searchQuery]);

  // Auto-expand selected event's ancestors
  useMemo(() => {
    if (!selectedEvent) return;
    const newExpanded = new Set(expandedIds);
    // expand all ancestor paths
    const findAndExpand = (events: HistoricalEvent[], targetId: string): boolean => {
      for (const event of events) {
        if (event.id === targetId) return true;
        if (event.children) {
          if (findAndExpand(event.children, targetId)) {
            newExpanded.add(event.id);
            return true;
          }
        }
      }
      return false;
    };
    findAndExpand(filteredEvents, selectedEvent.id);
    setExpandedIds(newExpanded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvent?.id]);

  return (
    <div
      className="glass-map animate-slide-in-left"
      style={{
        width: '320px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '20px 16px 12px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '14px',
          }}
        >
          <span style={{ fontSize: '22px' }}>📜</span>
          <h2
            style={{
              fontSize: '16px',
              fontWeight: 800,
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            Sự kiện Lịch sử
          </h2>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <span
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '14px',
              color: 'var(--text-muted)',
            }}
          >
            🔍
          </span>
          <input
            type="text"
            placeholder="Tìm kiếm sự kiện..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px 10px 36px',
              borderRadius: '10px',
              border: '1px solid var(--input-border)',
              background: 'var(--input-bg)',
              color: 'var(--input-text)',
              fontSize: '13px',
              outline: 'none',
              transition: 'all 0.2s',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)';
              e.currentTarget.style.background = 'var(--input-bg)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--input-border)';
              e.currentTarget.style.background = 'var(--input-bg)';
            }}
          />
        </div>

        {/* Filter buttons */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {EVENT_TYPE_FILTERS.map((type) => (
            <button
              key={type}
              onClick={() =>
                setActiveFilter(activeFilter === type ? null : type)
              }
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                borderRadius: '9999px',
                border: `1px solid ${
                  activeFilter === type
                    ? EVENT_TYPE_COLORS[type]
                    : 'var(--border)'
                }`,
                background:
                  activeFilter === type
                    ? `${EVENT_TYPE_COLORS[type]}25`
                    : 'var(--bg-card)',
                color:
                  activeFilter === type
                    ? EVENT_TYPE_COLORS[type]
                    : 'var(--text-muted)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
                boxShadow: activeFilter === type ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              <span style={{ fontSize: '12px' }}>
                {EVENT_TYPE_ICONS[type]}
              </span>
              {EVENT_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {/* Event Tree */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 0',
        }}
      >
        {filteredEvents.length === 0 ? (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: 'var(--color-text-dim)',
              fontSize: '13px',
            }}
          >
            Không tìm thấy sự kiện nào
          </div>
        ) : (
          filteredEvents.map((event) => (
            <EventTreeNode
              key={event.id}
              event={event}
              depth={0}
              expandedIds={expandedIds}
              selectedEvent={selectedEvent}
              onToggleExpand={toggleExpand}
              onSelectEvent={onSelectEvent}
              onHoverEvent={onHoverEvent}
            />
          ))
        )}
      </div>

      {/* Footer stats */}
      <div
        style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--border)',
          fontSize: '11px',
          color: 'var(--text-muted)',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>{filteredEvents.length} sự kiện</span>
        <span style={{ fontWeight: 600, opacity: 0.8 }}>MVP v1.0</span>
      </div>
    </div>
  );
}

// Tree node sub-component
interface EventTreeNodeProps {
  event: HistoricalEvent;
  depth: number;
  expandedIds: Set<string>;
  selectedEvent: HistoricalEvent | null;
  onToggleExpand: (id: string) => void;
  onSelectEvent: (event: HistoricalEvent) => void;
  onHoverEvent: (eventId: string | null) => void;
}

function EventTreeNode({
  event,
  depth,
  expandedIds,
  selectedEvent,
  onToggleExpand,
  onSelectEvent,
  onHoverEvent,
}: EventTreeNodeProps) {
  const isExpanded = expandedIds.has(event.id);
  const isSelected = selectedEvent?.id === event.id;
  const hasChildren = event.children && event.children.length > 0;
  const navigate = useNavigate();

  const geoIcon =
    event.geoType === 'no_location'
      ? '📋'
      : event.geoType === 'nationwide'
      ? '🗺️'
      : '📍';

  return (
    <div>
      <div
        onClick={() => onSelectEvent(event)}
        onMouseEnter={() => onHoverEvent(event.id)}
        onMouseLeave={() => onHoverEvent(null)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 12px',
          paddingLeft: `${16 + depth * 20}px`,
          cursor: 'pointer',
          background: isSelected
            ? 'color-mix(in srgb, var(--accent) 16%, transparent)'
            : 'transparent',
          borderLeft: isSelected
            ? '4px solid var(--accent)'
            : '4px solid transparent',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          fontSize: '13.5px',
        }}
        onMouseOver={(e) => {
          if (!isSelected)
            e.currentTarget.style.background = 'var(--accent-soft)';
          e.currentTarget.style.opacity = '0.9';
        }}
        onMouseOut={(e) => {
          if (!isSelected) e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.opacity = '1';
        }}
      >
        {/* Expand toggle */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(event.id);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '11px',
              width: '18px',
              height: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'transform 0.2s, color 0.2s',
            }}
          >
            <span 
              style={{ 
                fontSize: '10px', 
                transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                display: 'inline-block'
              }}
            >
              ▶
            </span>
          </button>
        ) : (
          <span style={{ width: '16px', flexShrink: 0 }} />
        )}

        {/* Geo icon */}
        <span style={{ fontSize: '13px', flexShrink: 0 }}>{geoIcon}</span>

        {/* Event name */}
        <span
          style={{
            flex: 1,
            fontWeight: isSelected ? 700 : 400,
            color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
            lineHeight: '1.4',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {event.name}
        </span>

        {/* View detail button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            const detailKey = event.slug || event.id;
            navigate(`/events/${detailKey}`);
          }}
          title="Xem chi tiết"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px',
            fontSize: '12px',
            opacity: isSelected ? 1 : 0.4,
            transition: 'opacity 0.15s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = isSelected ? '1' : '0.4')}
        >
          📄
        </button>

        {/* Year badge */}
        <span
          style={{
            fontSize: '10px',
            color: 'var(--text-muted)',
            background: 'var(--bg-card)',
            padding: '2px 6px',
            borderRadius: '4px',
            border: '1px solid var(--border)',
            flexShrink: 0,
            fontWeight: 500,
          }}
        >
          {event.startYear}
        </span>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div
          style={{
            borderLeft: `1px dashed var(--border)`,
            marginLeft: `${28 + depth * 20}px`,
          }}
        >
          {event.children!.map((child) => (
            <EventTreeNode
              key={child.id}
              event={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              selectedEvent={selectedEvent}
              onToggleExpand={onToggleExpand}
              onSelectEvent={onSelectEvent}
              onHoverEvent={onHoverEvent}
            />
          ))}
        </div>
      )}
    </div>
  );
}
