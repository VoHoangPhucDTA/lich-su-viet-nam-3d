import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useLayoutEffect,
  useRef,
  useReducer,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
import type {
  RegionGeometryStatus,
  TerrainRuntimeError,
  TerrainSessionCommand,
  TerrainViewModel,
} from '../types/terrain';
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
import { normalizeTerrainTargets } from '../utils/terrainTargets';
import { INITIAL_TERRAIN_STATE, terrainReducer } from '../utils/terrainState';

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
  const navigate = useNavigate();
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
  const [terrainState, terrainDispatch] = useReducer(terrainReducer, INITIAL_TERRAIN_STATE);
  const guide = useMapGuide();
  const { setCenterContent } = useHeader();
  const requestedEventKey = useMemo(
    () => new URLSearchParams(location.search).get('event')?.trim() ?? '',
    [location.search]
  );
  const loadedRequestedEventRef = useRef('');
  const terrainStateRef = useRef(terrainState);
  const terrainSessionCounterRef = useRef(0);
  const pendingAfterTerrainExitRef = useRef<(() => void) | null>(null);
  const selectionRequestIdRef = useRef(0);
  useLayoutEffect(() => {
    terrainStateRef.current = terrainState;
  }, [terrainState]);

  const terrainTargetResult = useMemo(
    () => selectedEvent
      ? normalizeTerrainTargets(
        selectedEvent.id,
        selectedEvent.sourceJson ?? selectedEvent.sourceMapData,
      )
      : null,
    [selectedEvent],
  );

  const ensureTerrainExit = useCallback(() => {
    const current = terrainStateRef.current;
    if (current.sessionId !== null && current.mode !== 'idle' && current.mode !== 'exiting') {
      terrainDispatch({ type: 'EXIT', sessionId: current.sessionId });
    }
  }, []);

  const scheduleAfterTerrainExit = useCallback((action: () => void) => {
    const current = terrainStateRef.current;
    if (current.sessionId === null || current.mode === 'idle') {
      action();
      return;
    }
    pendingAfterTerrainExitRef.current = action;
    if (current.mode !== 'exiting') {
      terrainDispatch({ type: 'EXIT', sessionId: current.sessionId });
    }
  }, []);

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
      const requestId = ++selectionRequestIdRef.current;
      ensureTerrainExit();
      if (event === null) {
        scheduleAfterTerrainExit(() => {
          setSelectedEvent(null);
          setNavigationStack([]);
        });
        return;
      }

      const selectedAtRequest = selectedEvent;
      const [detailEvent, children] = await Promise.all([
        getHistoricalEventFromBackend(event.slug || event.id),
        event.children ? Promise.resolve(event.children) : getChildrenFromBackend(event.id),
      ]);
      if (selectionRequestIdRef.current !== requestId) return;
      const baseEvent = detailEvent ? { ...event, ...detailEvent } : event;
      const eventWithChildren =
        children.length > 0 ? { ...baseEvent, children } : baseEvent;
      scheduleAfterTerrainExit(() => {
        if (selectionRequestIdRef.current !== requestId) return;
        if (children.length > 0) {
          setChildrenByParentId((prev) => ({
            ...prev,
            [event.id]: children,
          }));
        }
        void recordEventView(event.id, { source: searchQuery.trim() ? 'search' : 'map' });

        if (eventWithChildren.children && eventWithChildren.children.length > 0) {
          setNavigationStack((prev) =>
            selectedAtRequest ? [...prev, selectedAtRequest] : prev
          );
          setSelectedEvent(eventWithChildren);
        } else {
          if (selectedAtRequest && selectedAtRequest.id !== event.id) {
            const isChildOfCurrent = selectedAtRequest.children?.some(
              (child) => child.id === event.id
            );
            if (isChildOfCurrent) {
              setNavigationStack((prev) => [...prev, selectedAtRequest]);
            }
          }
          setSelectedEvent(eventWithChildren);
        }
      });
    },
    [ensureTerrainExit, scheduleAfterTerrainExit, searchQuery, selectedEvent]
  );

  useEffect(() => {
    if (!requestedEventKey) {
      loadedRequestedEventRef.current = '';
      return;
    }
    if (loadedRequestedEventRef.current === requestedEventKey) return;

    let cancelled = false;
    const requestId = ++selectionRequestIdRef.current;
    ensureTerrainExit();

    async function loadRequestedEvent() {
      const detailEvent = await getHistoricalEventFromBackend(requestedEventKey);
      if (cancelled || selectionRequestIdRef.current !== requestId || !detailEvent) return;

      const children = detailEvent.children
        ? detailEvent.children
        : await getChildrenFromBackend(detailEvent.id);
      if (cancelled || selectionRequestIdRef.current !== requestId) return;

      scheduleAfterTerrainExit(() => {
        if (cancelled || selectionRequestIdRef.current !== requestId) return;
        if (children.length > 0) {
          setChildrenByParentId((prev) => ({
            ...prev,
            [detailEvent.id]: children,
          }));
        }
        if (detailEvent.startYear != null) setCurrentYear(detailEvent.startYear);
        setSearchQuery((currentQuery) =>
          eventMatchesSearch(detailEvent, currentQuery) ? currentQuery : ''
        );
        setNavigationStack([]);
        setSelectedEvent(children.length > 0 ? { ...detailEvent, children } : detailEvent);
        loadedRequestedEventRef.current = requestedEventKey;
        void recordEventView(detailEvent.id, { source: 'detail' });
      });
    }

    loadRequestedEvent();
    return () => {
      cancelled = true;
    };
  }, [ensureTerrainExit, requestedEventKey, scheduleAfterTerrainExit]);

  // Navigate to a child event from popup
  const handleNavigateToChild = useCallback(
    async (child: HistoricalEvent) => {
      const requestId = ++selectionRequestIdRef.current;
      const selectedAtRequest = selectedEvent;
      ensureTerrainExit();
      const [detailEvent, children] = await Promise.all([
        getHistoricalEventFromBackend(child.slug || child.id),
        child.children ? Promise.resolve(child.children) : getChildrenFromBackend(child.id),
      ]);
      if (selectionRequestIdRef.current !== requestId) return;
      const nextEvent = detailEvent ? { ...child, ...detailEvent } : child;
      scheduleAfterTerrainExit(() => {
        if (selectionRequestIdRef.current !== requestId) return;
        if (selectedAtRequest) {
          setNavigationStack((prev) => [...prev, selectedAtRequest]);
        }
        if (children.length > 0) {
          setChildrenByParentId((prev) => ({
            ...prev,
            [child.id]: children,
          }));
        }
        void recordEventView(child.id, { source: 'map' });
        setSelectedEvent(children.length > 0 ? { ...nextEvent, children } : nextEvent);
      });
    },
    [ensureTerrainExit, scheduleAfterTerrainExit, selectedEvent]
  );

  // Navigate back to parent
  const handleNavigateToParent = useCallback(() => {
    ++selectionRequestIdRef.current;
    scheduleAfterTerrainExit(() => {
      if (navigationStack.length > 0) {
        const parent = navigationStack[navigationStack.length - 1];
        setNavigationStack((prev) => prev.slice(0, -1));
        setSelectedEvent(parent);
      } else {
        setSelectedEvent(null);
      }
    });
  }, [navigationStack, scheduleAfterTerrainExit]);

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
    ++selectionRequestIdRef.current;
    scheduleAfterTerrainExit(() => {
      setCurrentYear(year);
      setSelectedEvent(null);
      setNavigationStack([]);
    });
  }, [scheduleAfterTerrainExit]);

  const handleGradeChange = useCallback((grade: number | null) => {
    ++selectionRequestIdRef.current;
    scheduleAfterTerrainExit(() => {
      setSelectedGrade(grade);
      setSelectedEvent(null);
      setNavigationStack([]);
    });
  }, [scheduleAfterTerrainExit]);

  // Close popup
  const handleClosePopup = useCallback(() => {
    ++selectionRequestIdRef.current;
    scheduleAfterTerrainExit(() => {
      setSelectedEvent(null);
      setNavigationStack([]);
    });
  }, [scheduleAfterTerrainExit]);

  const handleViewEventDetails = useCallback(() => {
    if (!selectedEvent) return;
    const detailKey = selectedEvent.slug || selectedEvent.id;
    scheduleAfterTerrainExit(() => {
      navigate(`/events/${detailKey}`, { state: { from: window.location.pathname } });
    });
  }, [navigate, scheduleAfterTerrainExit, selectedEvent]);

  const handleOpenTerrain = useCallback(() => {
    if (!selectedEvent || !terrainTargetResult) return;
    const current = terrainStateRef.current;
    if (current.mode === 'entering' || current.mode === 'active' || current.mode === 'exiting') return;
    const sessionId = ++terrainSessionCounterRef.current;
    pendingAfterTerrainExitRef.current = null;
    if (!terrainTargetResult.eligible) {
      terrainDispatch({
        type: 'OPEN_REJECTED',
        sessionId,
        eventId: selectedEvent.id,
        error: {
          code: 'no_valid_targets',
          message: 'Sự kiện chưa có vị trí hợp lệ để xem địa hình.',
        },
      });
      return;
    }
    terrainDispatch({
      type: 'OPEN',
      sessionId,
      eventId: selectedEvent.id,
      targets: terrainTargetResult.targets,
    });
  }, [selectedEvent, terrainTargetResult]);

  const handleExitTerrain = useCallback(() => {
    const current = terrainStateRef.current;
    if (current.sessionId !== null && current.mode !== 'idle' && current.mode !== 'exiting') {
      terrainDispatch({ type: 'EXIT', sessionId: current.sessionId });
    }
  }, []);

  const handleTerrainReady = useCallback((sessionId: number) => {
    terrainDispatch({ type: 'ENTER_READY', sessionId });
  }, []);

  const handleTerrainProviderReady = useCallback((sessionId: number) => {
    terrainDispatch({ type: 'PROVIDER_READY', sessionId });
  }, []);

  const handleTerrainGeometryReady = useCallback((sessionId: number) => {
    terrainDispatch({ type: 'SESSION_GEOMETRY_READY', sessionId });
  }, []);

  const handleTerrainEnterError = useCallback((sessionId: number, error: TerrainRuntimeError) => {
    terrainDispatch({ type: 'ENTER_ERROR', sessionId, error });
  }, []);

  const handleTerrainExitComplete = useCallback((sessionId: number) => {
    if (terrainStateRef.current.sessionId !== sessionId) return;
    terrainDispatch({ type: 'EXIT_COMPLETE', sessionId });
    const pending = pendingAfterTerrainExitRef.current;
    pendingAfterTerrainExitRef.current = null;
    if (pending) queueMicrotask(pending);
  }, []);

  const handleTerrainTargetSelect = useCallback((sessionId: number, targetId: string) => {
    terrainDispatch({ type: 'SELECT_TARGET', sessionId, targetId });
  }, []);

  const handleShowTerrainOverview = useCallback(() => {
    const current = terrainStateRef.current;
    if (current.sessionId !== null) {
      terrainDispatch({ type: 'SHOW_OVERVIEW', sessionId: current.sessionId });
    }
  }, []);

  const handleRegionGeometryStatus = useCallback((
    status: Exclude<RegionGeometryStatus, 'idle'>,
    error?: TerrainRuntimeError,
  ) => {
    if (status === 'loading') {
      terrainDispatch({ type: 'REGION_GEOMETRY_LOADING' });
    } else if (status === 'ready') {
      terrainDispatch({ type: 'REGION_GEOMETRY_READY' });
    } else {
      terrainDispatch({
        type: 'REGION_GEOMETRY_ERROR',
        error: error ?? {
          code: 'geojson_load_failed',
          message: 'Chưa tải được dữ liệu khu vực trên bản đồ.',
        },
      });
    }
  }, []);

  const terrainSession = useMemo<TerrainSessionCommand | null>(() => {
    if (
      terrainState.sessionId === null ||
      terrainState.eventId === null ||
      (terrainState.mode !== 'entering' &&
        terrainState.mode !== 'active' &&
        terrainState.mode !== 'exiting')
    ) {
      return null;
    }
    return {
      id: terrainState.sessionId,
      eventId: terrainState.eventId,
      mode: terrainState.mode,
      targets: terrainState.targets,
      selectedTargetId: terrainState.selectedTargetId,
      overview: terrainState.overview,
      cameraRequestId: terrainState.cameraRequestId,
    };
  }, [
    terrainState.cameraRequestId,
    terrainState.eventId,
    terrainState.mode,
    terrainState.overview,
    terrainState.selectedTargetId,
    terrainState.sessionId,
    terrainState.targets,
  ]);

  const terrainViewModel = useMemo<TerrainViewModel>(() => {
    const targets = terrainState.mode === 'idle'
      ? terrainTargetResult?.targets ?? []
      : terrainState.targets;
    const needsRegions = targets.some((target) => target.kind === 'region');
    return {
      mode: terrainState.mode,
      providerStatus: terrainState.providerStatus,
      geometryStatus: terrainState.geometryStatus,
      targets,
      selectedTargetId: terrainState.selectedTargetId,
      eligible: terrainTargetResult?.eligible === true
        && (!needsRegions || terrainState.geometryStatus === 'ready'),
      ineligibleReason: terrainTargetResult?.reason ?? 'missing_map_data',
      error: terrainState.error,
    };
  }, [terrainState, terrainTargetResult]);

  // Clear header breadcrumb when MapPage unmounts so stale state doesn't leak to Homepage etc.
  useEffect(() => {
    const selectionRequest = selectionRequestIdRef;
    return () => {
      ++selectionRequest.current;
      pendingAfterTerrainExitRef.current = null;
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
              ++selectionRequestIdRef.current;
              scheduleAfterTerrainExit(() => {
                setSelectedEvent(null);
                setNavigationStack([]);
              });
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
                  ++selectionRequestIdRef.current;
                  scheduleAfterTerrainExit(() => {
                    setNavigationStack((prev) => prev.slice(0, idx));
                    setSelectedEvent(navEvent);
                  });
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
  }, [selectedEvent, navigationStack, scheduleAfterTerrainExit, setCenterContent]);

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
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
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
              terrainSession={terrainSession}
              onTerrainReady={handleTerrainReady}
              onTerrainProviderReady={handleTerrainProviderReady}
              onTerrainGeometryReady={handleTerrainGeometryReady}
              onTerrainEnterError={handleTerrainEnterError}
              onTerrainExitComplete={handleTerrainExitComplete}
              onTerrainTargetSelect={handleTerrainTargetSelect}
              onRegionGeometryStatus={handleRegionGeometryStatus}
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
            terrain={terrainViewModel}
            onOpenTerrain={handleOpenTerrain}
            onRetryTerrain={handleOpenTerrain}
            onSelectTerrainTarget={(targetId) => {
              const sessionId = terrainStateRef.current.sessionId;
              if (sessionId !== null) handleTerrainTargetSelect(sessionId, targetId);
            }}
            onShowTerrainOverview={handleShowTerrainOverview}
            onExitTerrain={handleExitTerrain}
            onViewDetails={handleViewEventDetails}
          />
        )}
      </div>
    </div>
  );
}
