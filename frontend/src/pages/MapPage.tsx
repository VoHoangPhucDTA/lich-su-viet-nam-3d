import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import CesiumMap from '../components/CesiumMap';
import Timeline from '../components/Timeline';
import Sidebar from '../components/Sidebar';
import EventPopup from '../components/EventPopup';
import {
  findEventById,
  TIMELINE_MIN_YEAR,
} from '../data/events';
import type { HistoricalEvent } from '../types/event';
import { useHeader } from '../components/layout/HeaderContext';
import OnboardingGuide, { useMapGuide } from '../components/onboarding/OnboardingGuide';
import {
  getChildrenFromBackend,
  getEventsByYearFromBackend,
  getHistoricalEventFromBackend,
  getTimelineYearsFromBackend,
  recordEventView,
  searchEventsFromBackend,
  sortHierarchyEvents,
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

function mergeEvent(
  current: HistoricalEvent | undefined,
  incoming: HistoricalEvent
): HistoricalEvent {
  return {
    ...current,
    ...incoming,
    children: incoming.children ?? current?.children,
  };
}

function mergeEventList(events: HistoricalEvent[]): HistoricalEvent[] {
  const byId = new Map<string, HistoricalEvent>();
  for (const event of events) {
    byId.set(event.id, mergeEvent(byId.get(event.id), event));
  }
  return sortHierarchyEvents(Array.from(byId.values()));
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
      parent.children = sortHierarchyEvents([...existingChildren, event]);
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

    const mergedChildren = sortHierarchyEvents(Array.from(mergedById.values()));

    return {
      ...event,
      children:
        mergedChildren.length > 0
          ? attachCachedChildren(mergedChildren, childrenByParentId)
          : undefined,
    };
  });
}

function upsertEventInTree(
  events: HistoricalEvent[],
  eventToInsert: HistoricalEvent
): HistoricalEvent[] {
  let inserted = false;
  const next = events.map((event) => {
    if (event.id === eventToInsert.id) {
      inserted = true;
      return mergeEvent(event, eventToInsert);
    }

    if (event.children?.length) {
      const children = upsertEventInTree(event.children, eventToInsert);
      if (children !== event.children) {
        inserted = true;
        return { ...event, children };
      }
    }

    return event;
  });

  return inserted ? next : sortHierarchyEvents([...events, eventToInsert]);
}

function withCachedChildren(
  event: HistoricalEvent,
  childrenByParentId: Record<string, HistoricalEvent[]>
): HistoricalEvent {
  const mergedChildren = mergeEventList([
    ...(event.children ?? []),
    ...(childrenByParentId[event.id] ?? []),
  ]);

  return {
    ...event,
    children:
      mergedChildren.length > 0
        ? attachCachedChildren(mergedChildren, childrenByParentId)
        : undefined,
  };
}

function ensureSelectedBranchInTree(
  events: HistoricalEvent[],
  selectedEvent: HistoricalEvent | null,
  navigationStack: HistoricalEvent[],
  childrenByParentId: Record<string, HistoricalEvent[]>
): HistoricalEvent[] {
  if (!selectedEvent) return events;

  let branch = withCachedChildren(selectedEvent, childrenByParentId);

  for (let index = navigationStack.length - 1; index >= 0; index -= 1) {
    const parent = navigationStack[index];
    if (parent.id === branch.id) continue;

    const children = mergeEventList([
      ...(parent.children ?? []),
      ...(childrenByParentId[parent.id] ?? []),
      branch,
    ]);

    branch = withCachedChildren({ ...parent, children }, childrenByParentId);
  }

  return replaceEventInTree(
    upsertEventInTree(events, branch),
    withCachedChildren(selectedEvent, childrenByParentId)
  );
}

function canShowEventOnMap(event: HistoricalEvent): boolean {
  return event.geoType !== 'no_location' && !!event.coordinates;
}

function eventMatchesSearch(event: HistoricalEvent, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return (
    event.name.toLowerCase().includes(normalized) ||
    event.description.toLowerCase().includes(normalized)
  );
}

export default function MapPage() {
  const location = useLocation();
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
  const [selectedGrade, setSelectedGrade] = useState<number | null>(null);
  const [timelineYears, setTimelineYears] = useState<number[]>([]);
  const guide = useMapGuide();
  const { setCenterContent } = useHeader();
  const requestedEventKey = useMemo(
    () => new URLSearchParams(location.search).get('event')?.trim() ?? '',
    [location.search]
  );
  const loadedRequestedEventRef = useRef('');

  useEffect(() => {
    let cancelled = false;

    async function loadEvents() {
      setEventsLoading(true);
      const events = await getEventsByYearFromBackend(currentYear, selectedGrade);
      if (!cancelled) {
        setYearEvents(events);
        setEventsLoading(false);
      }
    }

    loadEvents();
    return () => {
      cancelled = true;
    };
  }, [currentYear, selectedGrade]);

  useEffect(() => {
    let cancelled = false;

    async function loadTimelineYears() {
      const years = await getTimelineYearsFromBackend(selectedGrade);
      if (!cancelled) {
        setTimelineYears(years);
      }
    }

    loadTimelineYears();
    return () => {
      cancelled = true;
    };
  }, [selectedGrade]);

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
    let visibleEvents: HistoricalEvent[];
    if (selectedEvent?.children?.length) {
      visibleEvents = selectedEvent.children.filter(canShowEventOnMap);
    } else {
      const baseEvents = searchQuery.trim() ? searchResults : yearEvents;
      visibleEvents = baseEvents.filter(canShowEventOnMap);
    }

    if (
      selectedEvent &&
      canShowEventOnMap(selectedEvent) &&
      !visibleEvents.some((event) => event.id === selectedEvent.id)
    ) {
      return [selectedEvent, ...visibleEvents];
    }

    return visibleEvents;
  }, [selectedEvent, yearEvents, searchResults, searchQuery]);

  // All events visible in sidebar (including no_location)
  const sidebarEvents = useMemo(() => {
    const baseEvents = searchQuery.trim() ? searchResults : yearEvents;
    const tree = attachCachedChildren(buildSidebarTree(baseEvents), childrenByParentId);
    return ensureSelectedBranchInTree(
      replaceEventInTree(tree, selectedEvent),
      selectedEvent,
      navigationStack,
      childrenByParentId
    );
  }, [yearEvents, searchResults, searchQuery, selectedEvent, navigationStack, childrenByParentId]);

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
      void recordEventView(event.id, { source: searchQuery.trim() ? 'search' : 'map' });

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
    [selectedEvent, searchQuery]
  );

  useEffect(() => {
    if (!requestedEventKey) {
      loadedRequestedEventRef.current = '';
      return;
    }
    if (loadedRequestedEventRef.current === requestedEventKey) return;

    let cancelled = false;

    async function loadRequestedEvent() {
      const detailEvent = await getHistoricalEventFromBackend(requestedEventKey);
      if (cancelled || !detailEvent) return;

      const children = detailEvent.children
        ? detailEvent.children
        : await getChildrenFromBackend(detailEvent.id);
      if (cancelled) return;

      if (children.length > 0) {
        setChildrenByParentId((prev) => ({
          ...prev,
          [detailEvent.id]: children,
        }));
      }

      if (detailEvent.startYear != null) {
        setCurrentYear(detailEvent.startYear);
      }

      setSearchQuery((currentQuery) =>
        eventMatchesSearch(detailEvent, currentQuery) ? currentQuery : ''
      );
      setNavigationStack([]);
      setSelectedEvent(children.length > 0 ? { ...detailEvent, children } : detailEvent);
      loadedRequestedEventRef.current = requestedEventKey;
      void recordEventView(detailEvent.id, { source: 'detail' });
    }

    loadRequestedEvent();
    return () => {
      cancelled = true;
    };
  }, [requestedEventKey]);

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
      void recordEventView(child.id, { source: 'map' });
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

  // Lazy-load parent event into navigation stack when entering from URL
  useEffect(() => {
    let cancelled = false;

    async function loadParent() {
      if (!selectedEvent?.parentId || navigationStack.length > 0) return;
      const parent = await getHistoricalEventFromBackend(selectedEvent.parentId);
      if (!cancelled && parent) {
        const parentChildren = await getChildrenFromBackend(parent.id);
        if (cancelled) return;
        setChildrenByParentId((prev) => ({
          ...prev,
          [parent.id]: mergeEventList([
            ...(prev[parent.id] ?? []),
            ...parentChildren,
            selectedEvent,
          ]),
        }));
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

  const handleGradeChange = useCallback((grade: number | null) => {
    setSelectedGrade(grade);
    setSelectedEvent(null);
    setNavigationStack([]);
  }, []);

  // Close popup
  const handleClosePopup = useCallback(() => {
    setSelectedEvent(null);
    setNavigationStack([]);
  }, []);

  // Clear header breadcrumb when MapPage unmounts so stale state doesn't leak to Homepage etc.
  useEffect(() => {
    return () => {
      setCenterContent(null);
    };
  }, [setCenterContent]);

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
          className="glass-map animate-fade-in"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 12px',
            borderRadius: '999px',
            border: '1px solid var(--border)',
            fontSize: '12.5px',
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
            className="accent-hover-glow"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '6px',
              transition: 'all 0.2s var(--ease-museum)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-soft)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            Tổng quan
          </button>
          {parentCrumb && [parentCrumb].map((navEvent) => (
            <span key={navEvent.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
              <ChevronRight size={13} strokeWidth={2} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <button
                onClick={() => {
                  const idx = navigationStack.indexOf(navEvent);
                  setNavigationStack((prev) => prev.slice(0, idx));
                  setSelectedEvent(navEvent);
                }}
                className="accent-hover-glow"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#8b1e1e',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  maxWidth: '180px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                  transition: 'all 0.2s var(--ease-museum)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-soft)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                {navEvent.name}
              </button>
            </span>
          ))}
          <ChevronRight size={13} strokeWidth={2} style={{ color: '#78716c', flexShrink: 0 }} />
          <span className="serif-heading" style={{ fontSize: '13px', color: '#1c1917', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
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
        background: '#fafaf9',
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
          currentYear={currentYear}
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

            {/* Onboarding Guide — collapsible help panel */}
            <OnboardingGuide
              isOpen={guide.isOpen}
              onDismiss={guide.dismiss}
              onToggle={guide.toggle}
            />
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
          <Timeline
            currentYear={currentYear}
            onYearChange={handleYearChange}
            selectedGrade={selectedGrade}
            onGradeChange={handleGradeChange}
            eventYears={timelineYears}
          />
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
