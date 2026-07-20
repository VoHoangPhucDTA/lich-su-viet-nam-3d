import { useEffect, useState, useMemo } from 'react';
import {
  Search,
  ChevronRight,
  Clock,
} from 'lucide-react';
import type { HistoricalEvent, EventType } from '../types/event';
import {
  EVENT_TYPE_LABELS,
  EVENT_TYPE_COLORS,
} from '../types/event';
import { formatChronologyLabel } from '../utils/chronology';


interface SidebarProps {
  events: HistoricalEvent[];
  selectedEvent: HistoricalEvent | null;
  onSelectEvent: (event: HistoricalEvent) => void;
  onHoverEvent: (eventId: string | null) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  loading?: boolean;
  currentYear?: number;
}

const EVENT_TYPE_FILTERS: EventType[] = [
  'military',
  'political',
  'economic',
  'cultural',
];

function eventMatchesSearch(event: HistoricalEvent, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return (
    event.name.toLowerCase().includes(normalized) ||
    event.description.toLowerCase().includes(normalized)
  );
}

function filterEventTree(
  events: HistoricalEvent[],
  activeFilter: EventType | null,
  searchQuery: string
): HistoricalEvent[] {
  return events.flatMap((event) => {
    const children = event.children
      ? filterEventTree(event.children, activeFilter, searchQuery)
      : [];
    const matchesType = !activeFilter || event.eventType === activeFilter;
    const matchesSearch = eventMatchesSearch(event, searchQuery);
    const keepSelf = matchesType && matchesSearch;

    if (!keepSelf && children.length === 0) {
      return [];
    }

    return [
      {
        ...event,
        children: event.children ? children : undefined,
      },
    ];
  });
}

export default function Sidebar({
  events,
  selectedEvent,
  onSelectEvent,
  onHoverEvent,
  searchQuery,
  onSearchQueryChange,
  loading = false,
  currentYear,
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
    return filterEventTree(events, activeFilter, searchQuery);
  }, [events, activeFilter, searchQuery]);

  useEffect(() => {
    if (!selectedEvent || !activeFilter) return;
    if (selectedEvent.eventType !== activeFilter) {
      setActiveFilter(null);
    }
  }, [activeFilter, selectedEvent]);

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
      className="hidden md:flex animate-slide-in-left"
      style={{
        width: '320px',
        height: '100%',
        flexDirection: 'column',
        zIndex: 10,
        background: '#ffffff',
        borderRight: '1px solid #e7e5e4',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '18px 14px 10px',
          borderBottom: '1px solid #e7e5e4',
        }}
      >
        <h2
          className="serif-heading"
          style={{
            fontSize: '16px',
            fontWeight: 700,
            color: '#1c1917',
            marginBottom: '10px',
          }}
        >
          Sự kiện Lịch sử
        </h2>

        {/* Search */}
        <div className="relative mb-2.5">
          <Search
            size={15}
            strokeWidth={2.2}
            className="absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: '#78716c' }}
          />
          <input
            type="text"
            placeholder="Tìm kiếm sự kiện..."
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-[10px] border text-[13px] outline-none transition-all duration-200"
            style={{
              borderColor: '#d6d3d1',
              background: '#fafaf9',
              color: '#1c1917',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#8b1e1e';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#d6d3d1';
            }}
          />
        </div>

        {/* Filter section */}
        <div
          style={{
            fontSize: '10px',
            fontWeight: 700,
            color: '#78716c',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '6px',
          }}
        >
          Lọc theo
        </div>

        {/* Filter buttons — Option D: colored dot accent + neutral idle */}
        <div className="flex gap-1.5 flex-wrap">
          {EVENT_TYPE_FILTERS.map((type) => {
            const isActive = activeFilter === type;
            const color = EVENT_TYPE_COLORS[type];
            return (
              <button
                key={type}
                onClick={() =>
                  setActiveFilter(isActive ? null : type)
                }
                aria-pressed={isActive}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-all duration-150 border"
                style={{
                  background: isActive
                    ? `${color}22`
                    : '#ffffff',
                  color: isActive ? color : '#78716c',
                  borderColor: isActive ? `${color}50` : '#e7e5e4',
                }}
              >
                {/* Colored dot accent — Option D */}
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: color,
                    opacity: isActive ? 1 : 0.65,
                    flexShrink: 0,
                  }}
                />
                {EVENT_TYPE_LABELS[type]}
              </button>
            );
          })}
          {activeFilter && (
            <button
              type="button"
              onClick={() => setActiveFilter(null)}
              className="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-medium cursor-pointer transition-all duration-150 border-0"
              style={{
                background: 'transparent',
                color: '#78716c',
              }}
            >
              Xoá lọc
            </button>
          )}
        </div>
      </div>

      {/* Event Tree */}
      <div
        role="list"
        aria-label="Danh sách sự kiện lịch sử"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '6px 0',
        }}
      >
        {filteredEvents.length === 0 ? (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: '#78716c',
              fontSize: '13px',
            }}
          >
            {loading ? 'Đang tìm kiếm từ backend...' : 'Không tìm thấy sự kiện nào'}
          </div>
        ) : (
          // 1.1.10: Sidebar.tsx: Nhận dữ liệu mới và hiển thị danh sách sự kiện ở bảng điều khiển bên trái.
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
              currentYear={currentYear}
            />
          ))
        )}
      </div>

      {/* Footer stats */}
      <div
        style={{
          padding: '8px 14px',
          borderTop: '1px solid #e7e5e4',
          fontSize: '11px',
          color: '#78716c',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>
          {activeFilter ? (
            <>
              {filteredEvents.length} / {events.length} sự kiện
            </>
          ) : (
            <>{filteredEvents.length} sự kiện</>
          )}
        </span>
        {activeFilter && (
          <span style={{ color: EVENT_TYPE_COLORS[activeFilter], fontWeight: 600 }}>
            {EVENT_TYPE_LABELS[activeFilter]}
          </span>
        )}
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
  currentYear?: number;
}

function EventTreeNode({
  event,
  depth,
  expandedIds,
  selectedEvent,
  onToggleExpand,
  onSelectEvent,
  onHoverEvent,
  currentYear,
}: EventTreeNodeProps) {
  const isExpanded = expandedIds.has(event.id);
  const isSelected = selectedEvent?.id === event.id;
  const hasLoadedChildren = !!event.children?.length;
  const hasChildren = hasLoadedChildren || (event.childCount ?? 0) > 0;
  // 1.1.21: Sidebar.tsx: Nếu sự kiện có startYear > currentYear (tương lai so với mốc thời gian hiện tại),
  // hiển thị với opacity giảm và ký hiệu đặc biệt để phân biệt về mặt thời gian.
  const isFutureEvent =
    currentYear != null && event.startYear != null && event.startYear > currentYear;

  return (
    <div>
      <div
        // 1.1.17: Sidebar.tsx: Người dùng nhấp trực tiếp vào tiêu đề sự kiện (cha hoặc con) để xem.
        onClick={() => onSelectEvent(event)}
        onMouseEnter={() => onHoverEvent(event.id)}
        onMouseLeave={() => onHoverEvent(null)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 12px',
          paddingLeft: `${12 + depth * 12}px`,
          cursor: 'pointer',
          background: isSelected
            ? '#fef2f2'
            : 'transparent',
          borderLeft: isSelected
            ? '4px solid #8b1e1e'
            : '4px solid transparent',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          fontSize: '13.5px',
          opacity: isFutureEvent && !isSelected ? 0.5 : 1,
        }}
        onMouseOver={(e) => {
          if (!isSelected) {
            e.currentTarget.style.background = '#fef2f2';
            e.currentTarget.style.opacity = '0.9';
          }
        }}
        onMouseOut={(e) => {
          if (!isSelected) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.opacity = isFutureEvent ? '0.5' : '1';
          }
        }}
      >
        {/* Expand toggle */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              // 1.1.12: Sidebar.tsx: Người dùng nhấp vào một sự kiện cha có sự kiện con để mở rộng (expand).
              onToggleExpand(event.id);
              if (!isExpanded && !hasLoadedChildren && (event.childCount ?? 0) > 0) {
                onSelectEvent(event);
              }
            }}
            aria-label={isExpanded ? 'Thu gọn' : 'Mở rộng'}
            className="bg-transparent border-0 cursor-pointer w-[18px] h-[18px] flex items-center justify-center flex-shrink-0"
            style={{ color: '#78716c' }}
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

        {/* Event name */}
        <span
          title={event.name}
          style={{
            flex: 1,
            minWidth: 0,
            fontWeight: isSelected ? 700 : 400,
            color: isSelected ? '#8b1e1e' : '#1c1917',
            lineHeight: '1.4',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
          }}
        >
          {event.name}
        </span>

        {/* Year badge */}
        <span
          className="text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 font-medium inline-flex items-center gap-0.5"
          style={{
            color: '#78716c',
            background: isFutureEvent && !isSelected ? 'transparent' : '#ffffff',
            borderColor: '#e7e5e4',
            borderStyle: isFutureEvent && !isSelected ? 'dashed' : 'solid',
            opacity: isFutureEvent && !isSelected ? 0.7 : 1,
          }}
        >
          {isFutureEvent && !isSelected && (
            <span title="Sự kiện chưa diễn ra tại mốc thời gian hiện tại">
              <Clock
                size={9}
                strokeWidth={2.5}
                style={{ color: '#78716c', flexShrink: 0 }}
              />
            </span>
          )}
          {formatChronologyLabel(event)}
        </span>
      </div>

      {/* Children */}
      {hasLoadedChildren && isExpanded && (
        <div
          style={{
            borderLeft: `1px dashed #d6d3d1`,
            marginLeft: `${20 + depth * 12}px`,
          }}
        >
          {/* 1.1.16: Sidebar.tsx: Render bổ sung danh sách sự kiện con nằm lồng dưới sự kiện cha (kiểu Tree Node). */}
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
              currentYear={currentYear}
            />
          ))}
        </div>
      )}
    </div>
  );
}
