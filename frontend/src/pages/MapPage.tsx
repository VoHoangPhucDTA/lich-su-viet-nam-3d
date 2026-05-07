import { useState, useCallback, useMemo } from 'react';
import { ChevronRight, Lightbulb } from 'lucide-react';
import CesiumMap from '../components/CesiumMap';
import Timeline from '../components/Timeline';
import Sidebar from '../components/Sidebar';
import EventPopup from '../components/EventPopup';
import {
  findEventById,
  TIMELINE_MIN_YEAR,
} from '../data/events';
import { useEffect } from 'react';
import type { HistoricalEvent } from '../types/event';
import { useHeader } from '../components/layout/HeaderContext';
import {
  getChildrenFromBackend,
  getEventsByYearFromBackend,
  getHistoricalEventFromBackend,
  searchEventsFromBackend,
} from '../services/eventApi';

function replaceEventInTree(
  events: HistoricalEvent[],
  replacement: HistoricalEvent | null
): HistoricalEvent[] {
  if (!replacement) return events;

  let changed = false;
  const next = events.map((event) => {
    if (event.id === replacement.id) {
      changed = true;
      return {
        ...event,
        ...replacement,
        children: replacement.children ?? event.children,
      };
    }
    if (event.children?.length) {
      const children = replaceEventInTree(event.children, replacement);
      if (children !== event.children) {
        changed = true;
        return { ...event, children };
      }
    }
    return event;
  });

  return changed ? next : events;
}

function buildSidebarTree(events: HistoricalEvent[]): HistoricalEvent[] {
  const byId = new Map<string, HistoricalEvent>();
  for (const event of events) {
    byId.set(event.id, { ...event, children: event.children ? [...event.children] : undefined });
  }

  const childIds = new Set<string>();
  for (const event of byId.values()) {
    if (!event.parentId) continue;
    const parent = byId.get(event.parentId);
    if (!parent) continue;

    const existingChildren = parent.children ?? [];
    if (!existingChildren.some((child) => child.id === event.id)) {
      parent.children = [...existingChildren, event].sort(
        (a, b) => a.startYear - b.startYear || a.name.localeCompare(b.name)
      );
    }
    childIds.add(event.id);
  }

  return Array.from(byId.values()).filter((event) => !childIds.has(event.id));
}

function attachCachedChildren(
  events: HistoricalEvent[],
  childrenByParentId: Record<string, HistoricalEvent[]>
): HistoricalEvent[] {
  return events.map((event) => {
    const cachedChildren = childrenByParentId[event.id];
    const currentChildren = event.children ?? [];
    const mergedById = new Map<string, HistoricalEvent>();

    for (const child of currentChildren) {
      mergedById.set(child.id, child);
    }
    for (const child of cachedChildren ?? []) {
      mergedById.set(child.id, {
        ...mergedById.get(child.id),
        ...child,
      });
    }

    const mergedChildren = Array.from(mergedById.values()).sort(
      (a, b) => a.startYear - b.startYear || a.name.localeCompare(b.name)
    );

    return {
      ...event,
      children:
        mergedChildren.length > 0
          ? attachCachedChildren(mergedChildren, childrenByParentId)
          : undefined,
    };
  });
}

export default function MapPage() {
  const [currentYear, setCurrentYear] = useState(TIMELINE_MIN_YEAR);
  const [selectedEvent, setSelectedEvent] = useState<HistoricalEvent | null>(
    null
  );
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(
    null
  );
  const [navigationStack, setNavigationStack] = useState<HistoricalEvent[]>([]);
  const [yearEvents, setYearEvents] = useState<HistoricalEvent[]>([]);
  const [searchResults, setSearchResults] = useState<HistoricalEvent[]>([]);
  const [childrenByParentId, setChildrenByParentId] = useState<Record<string, HistoricalEvent[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  
  const { setCenterContent } = useHeader();

  useEffect(() => {
    let cancelled = false;

    async function loadEvents() {
      setEventsLoading(true);
      const events = await getEventsByYearFromBackend(currentYear);
      if (!cancelled) {
        setYearEvents(events);
        setEventsLoading(false);
      }
    }

    loadEvents();
    return () => {
      cancelled = true;
    };
  }, [currentYear]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setSearchLoading(true);
      const results = await searchEventsFromBackend(query);
      if (!cancelled) {
        setSearchResults(results);
        setSearchLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [searchQuery]);

  // Events visible on the map based on the current context
  const visibleMapEvents = useMemo(() => {
    // If an event with children is selected, show its children
    if (
      selectedEvent &&
      selectedEvent.children &&
      selectedEvent.children.length > 0
    ) {
      return selectedEvent.children.filter(
        (c) => c.geoType !== 'no_location' && c.coordinates
      );
    }

    // Otherwise show events filtered by year from backend
    const baseEvents = searchQuery.trim() ? searchResults : yearEvents;
    return baseEvents.filter(
      (e) => e.geoType !== 'no_location' && e.coordinates
    );
  }, [selectedEvent, yearEvents, searchResults, searchQuery]);

  // All events visible in sidebar (including no_location)
  const sidebarEvents = useMemo(() => {
    const baseEvents = searchQuery.trim() ? searchResults : yearEvents;
    const tree = attachCachedChildren(buildSidebarTree(baseEvents), childrenByParentId);
    return replaceEventInTree(tree, selectedEvent);
  }, [yearEvents, searchResults, searchQuery, selectedEvent, childrenByParentId]);

  // Handle selecting an event from map or sidebar
  const handleSelectEvent = useCallback(
    async (event: HistoricalEvent | null) => {
      if (event === null) {
        // Deselect — go back to root view
        setSelectedEvent(null);
        setNavigationStack([]);
        return;
      }

      const [detailEvent, children] = await Promise.all([
        getHistoricalEventFromBackend(event.slug || event.id),
        event.children ? Promise.resolve(event.children) : getChildrenFromBackend(event.id),
      ]);
      const baseEvent = detailEvent ? { ...event, ...detailEvent } : event;
      const eventWithChildren =
        children.length > 0 ? { ...baseEvent, children } : baseEvent;
      if (children.length > 0) {
        setChildrenByParentId((prev) => ({
          ...prev,
          [event.id]: children,
        }));
      }

      // If the event has children, drill down
      if (eventWithChildren.children && eventWithChildren.children.length > 0) {
        setNavigationStack((prev) =>
          selectedEvent ? [...prev, selectedEvent] : prev
        );
        setSelectedEvent(eventWithChildren);
      } else {
        // Leaf event — just select it
        // Push parent to stack if we're navigating from a parent context
        if (selectedEvent && selectedEvent.id !== event.id) {
          // Check if clicked event is a child of selectedEvent
          const isChildOfCurrent = selectedEvent.children?.some(
            (c) => c.id === event.id
          );
          if (isChildOfCurrent) {
            setNavigationStack((prev) => [...prev, selectedEvent]);
          }
        }
        setSelectedEvent(eventWithChildren);
      }
    },
    [selectedEvent]
  );

  // Navigate to a child event from popup
  const handleNavigateToChild = useCallback(
    async (child: HistoricalEvent) => {
      if (selectedEvent) {
        setNavigationStack((prev) => [...prev, selectedEvent]);
      }
      const [detailEvent, children] = await Promise.all([
        getHistoricalEventFromBackend(child.slug || child.id),
        child.children ? Promise.resolve(child.children) : getChildrenFromBackend(child.id),
      ]);
      const nextEvent = detailEvent ? { ...child, ...detailEvent } : child;
      if (children.length > 0) {
        setChildrenByParentId((prev) => ({
          ...prev,
          [child.id]: children,
        }));
      }
      setSelectedEvent(children.length > 0 ? { ...nextEvent, children } : nextEvent);
    },
    [selectedEvent]
  );

  // Navigate back to parent
  const handleNavigateToParent = useCallback(() => {
    if (navigationStack.length > 0) {
      const parent = navigationStack[navigationStack.length - 1];
      setNavigationStack((prev) => prev.slice(0, -1));
      setSelectedEvent(parent);
    } else {
      setSelectedEvent(null);
    }
  }, [navigationStack]);

  // Get parent event for the popup "back" button
  const parentEvent = useMemo(() => {
    if (navigationStack.length > 0) {
      return navigationStack[navigationStack.length - 1];
    }
    if (selectedEvent?.parentId) {
      return findEventById(selectedEvent.parentId) || null;
    }
    return null;
  }, [selectedEvent, navigationStack]);

  useEffect(() => {
    let cancelled = false;

    async function loadParent() {
      if (!selectedEvent?.parentId || navigationStack.length > 0) return;
      const parent = await getHistoricalEventFromBackend(selectedEvent.parentId);
      if (!cancelled && parent) {
        setNavigationStack([parent]);
      }
    }

    loadParent();
    return () => {
      cancelled = true;
    };
  }, [selectedEvent?.parentId, navigationStack.length]);

  // Handle year change from timeline
  const handleYearChange = useCallback((year: number) => {
    setCurrentYear(year);
    setSelectedEvent(null);
    setNavigationStack([]);
  }, []);

  // Close popup
  const handleClosePopup = useCallback(() => {
    setSelectedEvent(null);
    setNavigationStack([]);
  }, []);

  useEffect(() => {
    if (selectedEvent) {
      const compactStack = navigationStack.filter(
        (navEvent, index, arr) =>
          navEvent.id !== selectedEvent.id &&
          arr.findIndex((item) => item.id === navEvent.id) === index
      );
      const parentCrumb =
        compactStack.length > 0 ? compactStack[compactStack.length - 1] : null;

      setCenterContent(
        <div
          className="glass-map"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '999px',
            border: '1px solid var(--border)',
            fontSize: '13px',
            width: '100%',
            maxWidth: '560px',
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          <button
            onClick={() => {
              setSelectedEvent(null);
              setNavigationStack([]);
            }}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}
          >
            Tổng quan
          </button>
          {parentCrumb && [parentCrumb].map((navEvent) => (
            <span key={navEvent.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
              <ChevronRight size={14} strokeWidth={2.2} style={{ color: 'var(--text-muted)' }} />
              <button
                onClick={() => {
                  const idx = navigationStack.indexOf(navEvent);
                  setNavigationStack((prev) => prev.slice(0, idx));
                  setSelectedEvent(navEvent);
                }}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '12px', fontWeight: 500, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
              >
                {navEvent.name}
              </button>
            </span>
          ))}
          <ChevronRight size={14} strokeWidth={2.2} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <span style={{ color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            {selectedEvent.name}
          </span>
        </div>
      );
    } else {
      setCenterContent(null);
    }
  }, [selectedEvent, navigationStack, setCenterContent]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%', 
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg-app)',
      }}
    >
      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar */}
        <Sidebar
          events={sidebarEvents}
          selectedEvent={selectedEvent}
          onSelectEvent={handleSelectEvent}
          onHoverEvent={setHighlightedEventId}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          loading={searchLoading}
        />

        {/* Map area */}
        <div className="relative flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
          {/* Cesium Map (flex-1 + min-h-0 để không đẩy Timeline ra khỏi viewport) */}
          <div className="relative flex-1 min-h-0">
            <CesiumMap
              events={visibleMapEvents}
              selectedEvent={selectedEvent}
              onSelectEvent={handleSelectEvent}
              highlightedEventId={highlightedEventId}
            />

            {/* Map overlay info */}
            {!selectedEvent && (
              <div
                className="glass-map animate-fade-in absolute top-4 left-4 flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                <Lightbulb
                  size={18}
                  strokeWidth={2.2}
                  style={{ color: 'var(--accent)' }}
                />
                <span>
                  Kéo timeline để chọn mốc thời gian, click marker để xem chi
                  tiết sự kiện
                </span>
              </div>
            )}
            {eventsLoading && (
              <div
                className="glass-map animate-fade-in absolute top-4 right-4 rounded-xl px-4 py-2.5 text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                Đang tải dữ liệu từ backend...
              </div>
            )}
          </div>

          {/* Timeline — flex-shrink-0 đảm bảo không bị squeeze khi map shrink */}
          <Timeline currentYear={currentYear} onYearChange={handleYearChange} />
        </div>

        {/* Event popup */}
        {selectedEvent && (
          <EventPopup
            event={selectedEvent}
            onClose={handleClosePopup}
            onNavigateToChild={handleNavigateToChild}
            onNavigateToParent={handleNavigateToParent}
            parentEvent={parentEvent}
          />
        )}
      </div>
    </div>
  );
}
