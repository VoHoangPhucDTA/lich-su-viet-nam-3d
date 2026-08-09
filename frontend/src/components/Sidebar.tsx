import { useEffect, useMemo, useRef, useState } from 'react';
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
  activeCategory: EventType | null;
  onActiveCategoryChange: (category: EventType | null) => void;
  selectedGrade: number | null;
  onGradeChange: (grade: number | null) => void;
  listItemCount: number;
  mappedEventCount: number;
  loading?: boolean;
  currentYear?: number;
  open?: boolean;
  onClose?: () => void;
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
  activeCategory,
  onActiveCategoryChange,
  selectedGrade,
  onGradeChange,
  listItemCount,
  mappedEventCount,
  loading = false,
  currentYear,
  open = false,
  onClose,
}: SidebarProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);

  const revealedExpandedIds = useMemo(() => {
    const revealed = new Set<string>();
    if (!selectedEvent) return revealed;
    if (selectedEvent.children?.length) revealed.add(selectedEvent.id);

    const findPath = (nodes: HistoricalEvent[], targetId: string): boolean => {
      for (const event of nodes) {
        if (event.id === targetId) return true;
        if (event.children && findPath(event.children, targetId)) {
          revealed.add(event.id);
          return true;
        }
      }
      return false;
    };
    findPath(events, selectedEvent.id);
    return revealed;
  }, [events, selectedEvent]);

  const visibleExpandedIds = useMemo(
    () => new Set([...expandedIds, ...revealedExpandedIds]),
    [expandedIds, revealedExpandedIds],
  );

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

  // Scroll only after the derived ancestor path has made the selected row visible.
  useEffect(() => {
    if (!selectedEvent) return;
    const frame = window.requestAnimationFrame(() => {
      const selectedRow = Array.from(
        listRef.current?.querySelectorAll<HTMLElement>('[data-event-id]') ?? [],
      ).find((row) => row.dataset.eventId === selectedEvent.id);
      selectedRow?.scrollIntoView?.({ block: 'nearest' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [revealedExpandedIds, selectedEvent]);

  return (
    <div
      className={`map-sidebar ${open ? 'map-panel-open' : ''}`}
      style={{
        height: '100%',
        display: 'flex',
        minHeight: 0,
        overflow: 'hidden',
        flexDirection: 'column',
        background: 'var(--bg-card)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '18px 14px 10px',
          borderBottom: '1px solid #e7e5e4',
        }}
      >
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h2 className="app-heading text-lg font-bold text-[var(--text-primary)]">Sự kiện lịch sử</h2>
          {onClose && (
            <button type="button" onClick={onClose} className="map-panel-close map-panel-close-text">
              Đóng
            </button>
          )}
        </div>

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
            className="map-sidebar-search w-full pl-9 pr-3 py-2 rounded-[10px] border text-[13px] outline-none"
            style={{
              borderColor: 'var(--border-strong)',
              background: 'var(--bg-app)',
              color: 'var(--text-primary)',
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
            const isActive = activeCategory === type;
            const color = EVENT_TYPE_COLORS[type];
            return (
              <button
                key={type}
                onClick={() =>
                  onActiveCategoryChange(isActive ? null : type)
                }
                aria-pressed={isActive}
                className="map-filter-chip inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold cursor-pointer border"
                style={{
                  background: isActive
                    ? `${color}22`
                    : 'var(--bg-card)',
                  color: isActive ? color : 'var(--text-muted)',
                  borderColor: isActive ? `${color}50` : 'var(--border)',
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
          {activeCategory && (
            <button
              type="button"
              onClick={() => onActiveCategoryChange(null)}
              className="map-text-action inline-flex items-center px-2 py-1 rounded-full text-[11px] font-medium cursor-pointer border-0"
              style={{
                background: 'transparent',
                color: '#78716c',
              }}
            >
              Xoá lọc
            </button>
          )}
        </div>

        <fieldset className="map-grade-filter" aria-label="Chương trình">
          <legend>Chương trình</legend>
          <div className="map-grade-filter__options">
            {[null, 10, 11, 12].map((grade) => {
              const isActive = selectedGrade === grade;
              return (
                <button
                  key={grade ?? 'all'}
                  type="button"
                  onClick={() => onGradeChange(grade)}
                  aria-pressed={isActive}
                  aria-label={grade == null ? 'Tất cả chương trình' : `Chương trình lớp ${grade}`}
                >
                  {grade == null ? 'Tất cả' : `Lớp ${grade}`}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      {/* Event Tree */}
      <div
        ref={listRef}
        role="list"
        aria-label="Danh sách sự kiện lịch sử"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          scrollbarGutter: 'stable',
          padding: '6px 0',
        }}
      >
        {events.length === 0 ? (
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
          events.map((event) => (
            <EventTreeNode
              key={event.id}
              event={event}
              depth={0}
              expandedIds={visibleExpandedIds}
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
          borderTop: '1px solid var(--border)',
          fontSize: '11px',
          color: 'var(--text-muted)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '6px 10px',
          flexWrap: 'wrap',
        }}
      >
        <span className="map-sidebar-counts">
          {listItemCount} mục chính • {mappedEventCount} sự kiện trên bản đồ
        </span>
        {activeCategory && (
          <span style={{ color: EVENT_TYPE_COLORS[activeCategory], fontWeight: 600 }}>
            {EVENT_TYPE_LABELS[activeCategory]}
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
        className={`map-event-row ${isSelected ? 'is-selected' : ''} ${isFutureEvent ? 'is-future' : ''}`}
        data-depth={Math.min(depth, 3)}
        onMouseEnter={() => onHoverEvent(event.id)}
        onMouseLeave={() => onHoverEvent(null)}
        style={{
          padding: '7px 12px',
          paddingLeft: `${12 + Math.min(depth, 3) * 12}px`,
          fontSize: '13.5px',
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
            className="map-event-expand bg-transparent border-0 cursor-pointer flex items-center justify-center"
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
          <span className="map-event-expand-spacer" aria-hidden="true" />
        )}

        <button
          type="button"
          data-event-id={event.id}
          className="map-event-select"
          aria-current={isSelected ? 'true' : undefined}
          aria-label={`Chọn sự kiện ${event.name}`}
          onClick={() => onSelectEvent(event)}
          onFocus={() => onHoverEvent(event.id)}
          onBlur={() => onHoverEvent(null)}
        >
          {/* Event name */}
          <span
            title={event.name}
            className="map-event-title"
            style={{
              fontWeight: isSelected ? 700 : 400,
              color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
              lineHeight: '1.4',
            }}
          >
            {event.name}
          </span>

          {/* Year badge */}
          <span
            className="map-event-chronology inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold"
            style={{
              color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
              background: isSelected ? 'var(--accent-soft)' : 'var(--bg-surface)',
              opacity: isFutureEvent && !isSelected ? 0.72 : 1,
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
        </button>
      </div>

      {/* Children */}
      {hasLoadedChildren && isExpanded && (
        <div className="map-event-children">
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
