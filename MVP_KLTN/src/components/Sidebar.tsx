import { useState, useMemo } from 'react';
import type { HistoricalEvent, EventType } from '../types/event';
import {
  EVENT_TYPE_ICONS,
  EVENT_TYPE_LABELS,
  EVENT_TYPE_COLORS,
} from '../types/event';

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
      className="glass animate-slide-in-left"
      style={{
        width: '320px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid rgba(71, 85, 105, 0.4)',
        zIndex: 10,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '20px 16px 12px',
          borderBottom: '1px solid rgba(71, 85, 105, 0.3)',
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
              fontWeight: 700,
              background: 'linear-gradient(135deg, #f1f5f9, #94a3b8)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
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
              color: 'var(--color-text-dim)',
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
              padding: '8px 12px 8px 34px',
              borderRadius: '8px',
              border: '1px solid var(--color-surface-3)',
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              fontSize: '13px',
              outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) =>
              (e.currentTarget.style.borderColor = 'var(--color-primary)')
            }
            onBlur={(e) =>
              (e.currentTarget.style.borderColor = 'var(--color-surface-3)')
            }
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
                    : 'var(--color-surface-3)'
                }`,
                background:
                  activeFilter === type
                    ? `${EVENT_TYPE_COLORS[type]}20`
                    : 'transparent',
                color:
                  activeFilter === type
                    ? EVENT_TYPE_COLORS[type]
                    : 'var(--color-text-dim)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
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
          borderTop: '1px solid rgba(71, 85, 105, 0.3)',
          fontSize: '11px',
          color: 'var(--color-text-dim)',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>{filteredEvents.length} sự kiện</span>
        <span>MVP v1.0</span>
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
            ? 'rgba(99, 102, 241, 0.15)'
            : 'transparent',
          borderLeft: isSelected
            ? '3px solid var(--color-primary)'
            : '3px solid transparent',
          transition: 'all 0.15s',
          fontSize: '13px',
        }}
        onMouseOver={(e) => {
          if (!isSelected)
            e.currentTarget.style.background = 'rgba(71, 85, 105, 0.2)';
        }}
        onMouseOut={(e) => {
          if (!isSelected) e.currentTarget.style.background = 'transparent';
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
              color: 'var(--color-text-dim)',
              cursor: 'pointer',
              fontSize: '10px',
              width: '16px',
              height: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'transform 0.2s',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            }}
          >
            ▶
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
            fontWeight: isSelected ? 600 : 400,
            color: isSelected ? 'var(--color-text)' : 'var(--color-text-dim)',
            lineHeight: '1.4',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {event.name}
        </span>

        {/* Year badge */}
        <span
          style={{
            fontSize: '10px',
            color: 'var(--color-text-dim)',
            background: 'var(--color-surface)',
            padding: '1px 6px',
            borderRadius: '4px',
            flexShrink: 0,
          }}
        >
          {event.startYear}
        </span>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div
          style={{
            borderLeft: `1px dashed var(--color-surface-3)`,
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
