import { useEffect, useState, useMemo } from 'react';
import {
  Search,
  ScrollText,
  ChevronRight,
  ExternalLink,
  MapPin,
  Map as MapIcon,
  ClipboardList,
} from 'lucide-react';
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
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  loading?: boolean;
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
  searchQuery,
  onSearchQueryChange,
  loading = false,
}: SidebarProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
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
  useEffect(() => {
    if (!selectedEvent) return;
    const newExpanded = new Set(expandedIds);
    if (selectedEvent.children?.length) {
      newExpanded.add(selectedEvent.id);
    }
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
        <div className="flex items-center gap-2.5 mb-3.5">
          <ScrollText
            size={22}
            strokeWidth={2}
            style={{ color: 'var(--accent)' }}
          />
          <h2
            className="text-base font-extrabold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            Sự kiện Lịch sử
          </h2>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search
            size={15}
            strokeWidth={2.2}
            className="absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-muted)' }}
          />
          <input
            type="text"
            placeholder="Tìm kiếm sự kiện..."
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 rounded-[10px] border text-[13px] outline-none transition-all duration-200"
            style={{
              borderColor: 'var(--input-border)',
              background: 'var(--input-bg)',
              color: 'var(--input-text)',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--input-border)';
            }}
          />
        </div>

        {/* Filter buttons */}
        <div className="flex gap-1.5 flex-wrap">
          {EVENT_TYPE_FILTERS.map((type) => {
            const Icon = EVENT_TYPE_ICONS[type];
            const isActive = activeFilter === type;
            return (
              <button
                key={type}
                onClick={() =>
                  setActiveFilter(isActive ? null : type)
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-all duration-150 border"
                style={{
                  borderColor: isActive
                    ? EVENT_TYPE_COLORS[type]
                    : 'var(--border)',
                  background: isActive
                    ? `${EVENT_TYPE_COLORS[type]}25`
                    : 'var(--bg-card)',
                  color: isActive
                    ? EVENT_TYPE_COLORS[type]
                    : 'var(--text-muted)',
                  boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                <Icon size={12} strokeWidth={2.2} />
                {EVENT_TYPE_LABELS[type]}
              </button>
            );
          })}
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
            {loading ? 'Đang tìm kiếm từ backend...' : 'Không tìm thấy sự kiện nào'}
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
  const hasLoadedChildren = !!event.children?.length;
  const hasChildren = hasLoadedChildren || (event.childCount ?? 0) > 0;
  const navigate = useNavigate();

  const GeoIcon =
    event.geoType === 'no_location'
      ? ClipboardList
      : event.geoType === 'nationwide'
      ? MapIcon
      : MapPin;

  const geoIconColor =
    event.geoType === 'no_location'
      ? 'var(--text-muted)'
      : EVENT_TYPE_COLORS[event.eventType];

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
              if (!isExpanded && !hasLoadedChildren && (event.childCount ?? 0) > 0) {
                onSelectEvent(event);
              }
            }}
            aria-label={isExpanded ? 'Thu gọn' : 'Mở rộng'}
            className="bg-transparent border-0 cursor-pointer w-[18px] h-[18px] flex items-center justify-center flex-shrink-0"
            style={{ color: 'var(--text-muted)' }}
          >
            <ChevronRight
              size={14}
              strokeWidth={2.4}
              className="transition-transform duration-300"
              style={{
                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              }}
            />
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        {/* Geo icon */}
        <GeoIcon
          size={13}
          strokeWidth={2.2}
          className="flex-shrink-0"
          style={{ color: geoIconColor }}
        />

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
          aria-label="Xem chi tiết"
          className="bg-transparent border-0 cursor-pointer p-0.5 flex items-center justify-center transition-opacity duration-150"
          style={{
            color: 'var(--text-muted)',
            opacity: isSelected ? 1 : 0.45,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = isSelected ? '1' : '0.45')}
        >
          <ExternalLink size={13} strokeWidth={2.2} />
        </button>

        {/* Year badge */}
        <span
          className="text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 font-medium"
          style={{
            color: 'var(--text-muted)',
            background: 'var(--bg-card)',
            borderColor: 'var(--border)',
          }}
        >
          {event.startYear < 0
            ? `${Math.abs(event.startYear)} TCN`
            : event.startYear}
        </span>
      </div>

      {/* Children */}
      {hasLoadedChildren && isExpanded && (
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
