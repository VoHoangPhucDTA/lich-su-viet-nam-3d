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
import { CircleAlert, Clock, List, MapPin, X, Compass } from 'lucide-react';
import CesiumMap, {
  type CesiumMapHandle,
  type MapFocusRequest,
  type TerrainInspectionPayload,
  type TerrainMeasurementPayload,
} from '../components/CesiumMap';
import Timeline from '../components/Timeline';
import Sidebar from '../components/Sidebar';
import EventPopup from '../components/EventPopup';
import MapLegend from '../components/map/MapLegend';
import TerrainExplorationToolbar, {
  type TerrainExplorationInspectorState,
} from '../components/terrain/TerrainExplorationToolbar';
import { type EventType, type HistoricalEvent } from '../types/event';
import type {
  RegionGeometryStatus,
  TerrainDataSourceStatus,
  TerrainExplorationMode,
  TerrainRuntimeError,
  TerrainSessionCommand,
  TerrainViewModel,
} from '../types/terrain';
import {
  getChildrenFromBackend,
  getEventsByYearFromBackend,
  getHistoricalEventFromBackend,
  getTimelineYearsFromBackend,
  recordEventView,
  searchEventsFromBackend,
} from '../services/eventApi';
import {
  buildMapVisibilityProjection,
  collectMapScopeEventIds,
  normalizeMapSearchTerm,
} from '../utils/mapVisibility';
import { parseMapUrlState, serializeMapUrlState, type MapUrlState } from '../utils/mapUrlState';
import { buildMapFocusCameraFrame, focusPositionsForEvent } from '../utils/mapCameraFocus';
import {
  buildTimelineRuntimeModel,
  resolveTimelineYear,
} from '../utils/timelineModel';
import { normalizeTerrainTargets } from '../utils/terrainTargets';
import { INITIAL_TERRAIN_STATE, terrainReducer } from '../utils/terrainState';
import {
  INITIAL_TERRAIN_DISTANCE_MEASUREMENT,
  terrainDistanceMeasurementReducer,
} from '../utils/terrainMeasurement';

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

interface YearEventResult {
  year: number | null;
  grade: number | null;
  events: HistoricalEvent[];
}

interface SearchEventResult {
  normalizedQuery: string;
  events: HistoricalEvent[];
}

async function loadAncestorChain(event: HistoricalEvent): Promise<HistoricalEvent[]> {
  const ancestors: HistoricalEvent[] = [];
  const visited = new Set<string>([event.id]);
  let parentId = event.parentId;

  while (parentId && !visited.has(parentId) && ancestors.length < 20) {
    visited.add(parentId);
    const parent = await getHistoricalEventFromBackend(parentId);
    if (!parent) break;
    ancestors.unshift(parent);
    parentId = parent.parentId;
  }

  return ancestors;
}

interface TimelineYearResult {
  grade: number | null;
  years: number[];
}

type MapSelectionSource =
  | 'map-marker'
  | 'sidebar'
  | 'popup-child'
  | 'search'
  | 'url-restore';
type SelectionDetailStatus = 'idle' | 'loading' | 'ready' | 'error';
type MapOverlay = null | 'legend' | 'guide';

function legacyRequestedEventKey(state: unknown): string {
  if (!state || typeof state !== 'object') return '';
  const candidate = state as Record<string, unknown>;
  for (const key of ['requestedEventKey', 'eventKey', 'event']) {
    const value = candidate[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export default function MapPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialUrlStateRef = useRef(parseMapUrlState(location.search));
  const [currentYear, setCurrentYear] = useState<number | null>(initialUrlStateRef.current.year);
  const [selectedEvent, setSelectedEvent] = useState<HistoricalEvent | null>(
    null
  );
  const [selectionDetailStatus, setSelectionDetailStatus] = useState<SelectionDetailStatus>('idle');
  const [focusRequest, setFocusRequest] = useState<MapFocusRequest | null>(null);
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(
    null
  );
  const [navigationStack, setNavigationStack] = useState<HistoricalEvent[]>([]);
  const [yearEventResult, setYearEventResult] = useState<YearEventResult>({
    year: null,
    grade: null,
    events: [],
  });
  const [searchEventResult, setSearchEventResult] = useState<SearchEventResult>({
    normalizedQuery: '',
    events: [],
  });
  const [childrenByParentId, setChildrenByParentId] = useState<Record<string, HistoricalEvent[]>>({});
  const [searchQuery, setSearchQuery] = useState(initialUrlStateRef.current.query);
  const [searchLoading, setSearchLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState<number | null>(initialUrlStateRef.current.grade);
  const [activeCategory, setActiveCategory] = useState<EventType | null>(initialUrlStateRef.current.category);
  const [timelineYearResult, setTimelineYearResult] = useState<TimelineYearResult>({
    grade: null,
    years: [],
  });
  const [terrainState, terrainDispatch] = useReducer(terrainReducer, INITIAL_TERRAIN_STATE);
  const [activeOverlay, setActiveOverlay] = useState<MapOverlay>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  // ─── Terrain exploration toolbar (Task C) ─────────────────────────────────
  const cesiumApiRef = useRef<CesiumMapHandle | null>(null);
  const sidebarResizeTimerRef = useRef<number | null>(null);
  const [explorationMode, setExplorationMode] = useState<TerrainExplorationMode>('none');
  const [inspectSessionId, setInspectSessionId] = useState(0);
  const [inspection, setInspection] = useState<TerrainExplorationInspectorState>({
    result: null,
    loading: false,
    error: null,
  });
  const [measurementSessionId, setMeasurementSessionId] = useState(0);
  const measurementSessionCounterRef = useRef(0);
  const [measurement, measurementDispatch] = useReducer(
    terrainDistanceMeasurementReducer,
    INITIAL_TERRAIN_DISTANCE_MEASUREMENT,
  );
  const parsedUrlState = useMemo(() => parseMapUrlState(location.search), [location.search]);
  const parsedUrlStateRef = useRef(parsedUrlState);
  useLayoutEffect(() => {
    parsedUrlStateRef.current = parsedUrlState;
  }, [parsedUrlState]);
  const legacyRequestedEventKeyRef = useRef(legacyRequestedEventKey(location.state));
  const legacyRequestedEventConsumedRef = useRef(false);
  useLayoutEffect(() => {
    if (parsedUrlState.event && legacyRequestedEventKeyRef.current) {
      legacyRequestedEventConsumedRef.current = true;
    }
  }, [parsedUrlState.event]);
  const requestedEventKey = parsedUrlState.event || (
    legacyRequestedEventConsumedRef.current ? '' : legacyRequestedEventKeyRef.current
  );
  const loadedRequestedEventRef = useRef('');
  const pinnedExplicitSelectionIdRef = useRef<string | null>(null);
  const terrainStateRef = useRef(terrainState);
  const terrainSessionCounterRef = useRef(0);
  const pendingAfterTerrainExitRef = useRef<(() => void) | null>(null);
  const selectionRequestIdRef = useRef(0);
  const focusRequestIdRef = useRef(0);
  const suppressCurrentRequestedEvent = useCallback(() => {
    loadedRequestedEventRef.current = parsedUrlState.event
      || selectedEvent?.slug
      || selectedEvent?.id
      || '';
  }, [parsedUrlState.event, selectedEvent]);
  const timelineResultIsCurrent = timelineYearResult.grade === selectedGrade;
  const timelineModel = useMemo(
    () => timelineResultIsCurrent
      ? buildTimelineRuntimeModel(timelineYearResult.years)
      : null,
    [timelineResultIsCurrent, timelineYearResult.years],
  );

  const replaceMapUrlState = useCallback((patch: Partial<MapUrlState>) => {
    const nextSearch = serializeMapUrlState({
      year: currentYear,
      event: parsedUrlState.event,
      query: searchQuery,
      category: activeCategory,
      grade: selectedGrade,
      ...patch,
    });
    if (nextSearch === location.search) return;
    navigate(
      { pathname: location.pathname, search: nextSearch },
      { replace: true, state: location.state },
    );
  }, [
    activeCategory,
    currentYear,
    location.pathname,
    location.search,
    location.state,
    navigate,
    parsedUrlState.event,
    searchQuery,
    selectedGrade,
  ]);
  const replaceMapUrlStateRef = useRef(replaceMapUrlState);
  useLayoutEffect(() => {
    replaceMapUrlStateRef.current = replaceMapUrlState;
  }, [replaceMapUrlState]);

  const requestEventFocus = useCallback((event: HistoricalEvent, source: MapSelectionSource) => {
    const positions = focusPositionsForEvent(event);
    const frame = buildMapFocusCameraFrame(event);
    const needsCompleteMultiPointTarget = (
      source === 'sidebar' || source === 'search'
    ) && (
      event.geoType === 'multi_point' || event.geoType === 'mixed'
    );
    const hasCompleteFocusTarget = needsCompleteMultiPointTarget && frame?.kind !== 'authoring-focus'
      ? positions.length >= 2
      : frame !== null;
    if (source === 'map-marker' || !hasCompleteFocusTarget) {
      setFocusRequest(null);
      return;
    }
    setFocusRequest({
      requestId: ++focusRequestIdRef.current,
      event,
      animated: source !== 'url-restore',
    });
  }, []);

  useEffect(() => {
    setCurrentYear((current) => current === parsedUrlState.year ? current : parsedUrlState.year);
    setSearchQuery((current) => current === parsedUrlState.query ? current : parsedUrlState.query);
    setActiveCategory((current) => current === parsedUrlState.category ? current : parsedUrlState.category);
    setSelectedGrade((current) => current === parsedUrlState.grade ? current : parsedUrlState.grade);
  }, [parsedUrlState]);
  useLayoutEffect(() => {
    terrainStateRef.current = terrainState;
  }, [terrainState]);

  const terrainTargetResult = useMemo(
    () => selectedEvent
      ? normalizeTerrainTargets(
        selectedEvent.id,
        selectedEvent.sourceMapData,
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
    if (
      currentYear == null
      || !timelineModel
      || !timelineModel.years.includes(currentYear)
    ) {
      setEventsLoading(timelineModel == null);
      return;
    }

    let cancelled = false;
    const requestedYear = currentYear;

    async function loadEvents() {
      setEventsLoading(true);
      setMapError(null);
      try {
        const events = await getEventsByYearFromBackend(requestedYear, selectedGrade);
        if (!cancelled) {
          setYearEventResult({ year: requestedYear, grade: selectedGrade, events });
        }
      } catch {
        if (!cancelled) setMapError('Không thể tải sự kiện cho mốc thời gian này.');
      } finally {
        if (!cancelled) setEventsLoading(false);
      }
    }

    loadEvents();
    return () => {
      cancelled = true;
    };
  }, [currentYear, selectedGrade, timelineModel]);

  useEffect(() => {
    let cancelled = false;

    async function loadTimelineYears() {
      const years = await getTimelineYearsFromBackend(selectedGrade);
      if (!cancelled) {
        setTimelineYearResult({ grade: selectedGrade, years });
      }
    }

    loadTimelineYears();
    return () => {
      cancelled = true;
    };
  }, [selectedGrade]);

  useEffect(() => {
    if (!timelineModel) return;
    const requestedYear = currentYear ?? timelineModel.minYear;
    const resolvedYear = resolveTimelineYear(timelineModel, requestedYear);
    if (resolvedYear === currentYear) return;
    setCurrentYear(resolvedYear);
    if (currentYear != null) replaceMapUrlState({ year: resolvedYear });
  }, [currentYear, replaceMapUrlState, timelineModel]);

  useEffect(() => {
    const query = normalizeMapSearchTerm(searchQuery);
    if (!query) {
      setSearchEventResult({ normalizedQuery: '', events: [] });
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setSearchLoading(true);
      setMapError(null);
      try {
        const results = await searchEventsFromBackend(query, selectedGrade);
        if (!cancelled) {
          setSearchEventResult({ normalizedQuery: query, events: results });
        }
      } catch {
        if (!cancelled) setMapError('Không thể tìm kiếm sự kiện lúc này.');
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [searchQuery, selectedGrade]);

  const normalizedSearchTerm = useMemo(
    () => normalizeMapSearchTerm(searchQuery),
    [searchQuery],
  );
  const yearResultIsCurrent = currentYear != null
    && yearEventResult.year === currentYear
    && yearEventResult.grade === selectedGrade;
  const searchResultIsCurrent =
    !normalizedSearchTerm || searchEventResult.normalizedQuery === normalizedSearchTerm;
  const visibilityReady = normalizedSearchTerm
    ? searchResultIsCurrent
    : yearResultIsCurrent;
  const yearEvents = useMemo(
    () => (yearResultIsCurrent ? yearEventResult.events : []),
    [yearEventResult.events, yearResultIsCurrent],
  );
  const visibilityCandidates = useMemo(
    () => {
      const candidates = normalizedSearchTerm && searchResultIsCurrent
        ? [...yearEvents, ...navigationStack, ...searchEventResult.events]
        : yearEvents;
      return replaceEventInTree(candidates, selectedEvent);
    },
    [
      navigationStack,
      normalizedSearchTerm,
      searchEventResult.events,
      searchResultIsCurrent,
      selectedEvent,
      yearEvents,
    ],
  );
  const searchCandidateIds = useMemo(
    () =>
      normalizedSearchTerm && searchResultIsCurrent
        ? new Set(searchEventResult.events.map((event) => event.id))
        : undefined,
    [normalizedSearchTerm, searchEventResult.events, searchResultIsCurrent],
  );
  const scopeEventIds = useMemo(
    () => collectMapScopeEventIds(yearEvents),
    [yearEvents],
  );
  const visibilityProjection = useMemo(
    () =>
      buildMapVisibilityProjection(
        visibilityCandidates,
        {
          year: currentYear ?? 0,
          searchTerm: normalizedSearchTerm,
          grade: selectedGrade,
          category: activeCategory,
        },
        {
          childrenByParentId,
          searchCandidateIds,
          scopeEventIds,
        },
      ),
    [
      activeCategory,
      childrenByParentId,
      currentYear,
      normalizedSearchTerm,
      scopeEventIds,
      searchCandidateIds,
      selectedGrade,
      visibilityCandidates,
    ],
  );
  const visibleEventIdsRef = useRef(visibilityProjection.visibleEventIds);
  useLayoutEffect(() => {
    visibleEventIdsRef.current = visibilityProjection.visibleEventIds;
  }, [visibilityProjection.visibleEventIds]);

  useEffect(() => {
    if (
      !visibilityReady ||
      !selectedEvent ||
      pinnedExplicitSelectionIdRef.current === selectedEvent.id ||
      visibilityProjection.visibleEventIds.has(selectedEvent.id)
    ) {
      return;
    }

    const clearRequestId = ++selectionRequestIdRef.current;
    const removedEventId = selectedEvent.id;
    ensureTerrainExit();
    scheduleAfterTerrainExit(() => {
      if (selectionRequestIdRef.current !== clearRequestId) return;
      if (visibleEventIdsRef.current.has(removedEventId)) return;
      setSelectedEvent((current) =>
        current?.id === removedEventId ? null : current,
      );
      suppressCurrentRequestedEvent();
      setSelectionDetailStatus('idle');
      setFocusRequest(null);
      replaceMapUrlState({ event: '' });
      setNavigationStack([]);
      setHighlightedEventId((current) =>
        current === removedEventId ? null : current,
      );
    });
  }, [
    ensureTerrainExit,
    replaceMapUrlState,
    scheduleAfterTerrainExit,
    selectedEvent,
    suppressCurrentRequestedEvent,
    visibilityProjection.visibleEventIds,
    visibilityReady,
  ]);

  // Select synchronously from the summary, then hydrate detail/children in the background.
  const handleSelectEvent = useCallback(
    async (event: HistoricalEvent | null, source: MapSelectionSource = 'sidebar') => {
      const requestId = ++selectionRequestIdRef.current;
      ensureTerrainExit();
      if (event === null) {
        pinnedExplicitSelectionIdRef.current = null;
        suppressCurrentRequestedEvent();
        setSelectionDetailStatus('idle');
        setFocusRequest(null);
        replaceMapUrlState({ event: '' });
        scheduleAfterTerrainExit(() => {
          setSelectedEvent(null);
          setNavigationStack([]);
        });
        return;
      }
      if (!visibleEventIdsRef.current.has(event.id)) return;

      const selectedAtRequest = selectedEvent;
      pinnedExplicitSelectionIdRef.current =
        event.startYear == null && (source === 'search' || source === 'url-restore')
          ? event.id
          : null;
      const detailKey = event.slug || event.id;
      loadedRequestedEventRef.current = detailKey;
      setSelectedEvent(event);
      setSelectionDetailStatus('loading');
      if (source === 'popup-child') {
        if (selectedAtRequest?.id !== event.id && selectedAtRequest) {
          setNavigationStack((currentStack) => [...currentStack, selectedAtRequest]);
        }
      } else {
        setNavigationStack((currentStack) =>
          currentStack.length === 0 ? currentStack : [],
        );
      }
      if (source === 'search' && event.startYear != null) setCurrentYear(event.startYear);
      requestEventFocus(event, source);
      replaceMapUrlState({
        event: detailKey,
        year: source === 'search' && event.startYear != null ? event.startYear : currentYear,
      });
      void recordEventView(event.id, { source: source === 'search' ? 'search' : 'map' });

      const [detailResult, childrenResult, ancestorsResult] = await Promise.allSettled([
        getHistoricalEventFromBackend(event.slug || event.id),
        event.children ? Promise.resolve(event.children) : getChildrenFromBackend(event.id),
        source === 'search' || source === 'url-restore'
          ? loadAncestorChain(event)
          : Promise.resolve([]),
      ]);
      if (selectionRequestIdRef.current !== requestId) return;
      if (
        !visibleEventIdsRef.current.has(event.id)
        && pinnedExplicitSelectionIdRef.current !== event.id
      ) return;
      const detailEvent = detailResult.status === 'fulfilled' ? detailResult.value : null;
      const children = childrenResult.status === 'fulfilled' ? childrenResult.value : [];
      const ancestors = ancestorsResult.status === 'fulfilled' ? ancestorsResult.value : [];
      const baseEvent = detailEvent ? { ...event, ...detailEvent } : event;
      const eventWithChildren =
        children.length > 0 ? { ...baseEvent, children } : baseEvent;
      if (children.length > 0) {
        setChildrenByParentId((prev) => ({ ...prev, [event.id]: children }));
      }
      if (source === 'search' || source === 'url-restore') {
        setNavigationStack(ancestors);
      }
      const summaryPositionCount = focusPositionsForEvent(event).length;
      const hydratedPositionCount = focusPositionsForEvent(eventWithChildren).length;
      const summaryFocusFrame = buildMapFocusCameraFrame(event);
      const hydratedFocusFrame = buildMapFocusCameraFrame(eventWithChildren);
      if (
        (source === 'sidebar' || source === 'search')
        && (eventWithChildren.geoType === 'multi_point' || eventWithChildren.geoType === 'mixed')
        && hydratedPositionCount >= 2
        && hydratedPositionCount > summaryPositionCount
      ) {
        requestEventFocus(eventWithChildren, source);
      } else if (
        (source === 'sidebar' || source === 'search')
        && (eventWithChildren.geoType === 'multi_polygon' || eventWithChildren.geoType === 'mixed')
        && hydratedFocusFrame?.kind === 'authoring-focus'
        && summaryFocusFrame?.kind !== 'authoring-focus'
      ) {
        requestEventFocus(eventWithChildren, source);
      }
      setSelectedEvent((current) => current?.id === event.id ? eventWithChildren : current);
      setSelectionDetailStatus(detailEvent ? 'ready' : 'error');
    },
    [
      currentYear,
      ensureTerrainExit,
      replaceMapUrlState,
      requestEventFocus,
      scheduleAfterTerrainExit,
      selectedEvent,
      suppressCurrentRequestedEvent,
    ]
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
      setSelectionDetailStatus('loading');
      try {
        const detailEvent = await getHistoricalEventFromBackend(requestedEventKey);
        if (cancelled || selectionRequestIdRef.current !== requestId) return;
        if (!detailEvent) {
          loadedRequestedEventRef.current = requestedEventKey;
          setSelectionDetailStatus('error');
          return;
        }

        const [childrenResult, ancestorsResult] = await Promise.allSettled([
          detailEvent.children
            ? Promise.resolve(detailEvent.children)
            : getChildrenFromBackend(detailEvent.id),
          loadAncestorChain(detailEvent),
        ]);
        if (cancelled || selectionRequestIdRef.current !== requestId) return;
        const children = childrenResult.status === 'fulfilled' ? childrenResult.value : [];
        const ancestors = ancestorsResult.status === 'fulfilled' ? ancestorsResult.value : [];
        const restoredEvent = children.length > 0 ? { ...detailEvent, children } : detailEvent;

        if (children.length > 0) {
          setChildrenByParentId((prev) => ({ ...prev, [detailEvent.id]: children }));
        }
        const currentUrlState = parsedUrlStateRef.current;
        if (currentUrlState.year == null && detailEvent.startYear != null) {
          setCurrentYear(detailEvent.startYear);
        }
        pinnedExplicitSelectionIdRef.current = detailEvent.startYear == null
          ? detailEvent.id
          : null;
        setNavigationStack(ancestors);
        setSelectedEvent(restoredEvent);
        setSelectionDetailStatus('ready');
        loadedRequestedEventRef.current = requestedEventKey;
        requestEventFocus(restoredEvent, 'url-restore');
        if (!currentUrlState.event) {
          replaceMapUrlStateRef.current({
            event: detailEvent.slug || detailEvent.id,
            year: currentUrlState.year ?? detailEvent.startYear,
          });
        }
        void recordEventView(detailEvent.id, { source: 'detail' });
      } catch {
        if (cancelled || selectionRequestIdRef.current !== requestId) return;
        loadedRequestedEventRef.current = requestedEventKey;
        setSelectionDetailStatus('error');
      }
    }

    loadRequestedEvent();
    return () => {
      cancelled = true;
    };
  }, [
    ensureTerrainExit,
    requestEventFocus,
    requestedEventKey,
  ]);
  // Navigate to a child event from popup
  const handleNavigateToChild = useCallback(
    (child: HistoricalEvent) => {
      void handleSelectEvent(child, 'popup-child');
    },
    [handleSelectEvent]
  );

  // Navigate back to parent
  const handleNavigateToParent = useCallback(() => {
    ++selectionRequestIdRef.current;
    scheduleAfterTerrainExit(() => {
      if (navigationStack.length > 0) {
        const parent = navigationStack[navigationStack.length - 1];
        if (visibleEventIdsRef.current.has(parent.id)) {
          pinnedExplicitSelectionIdRef.current = null;
          setNavigationStack((prev) => prev.slice(0, -1));
          setSelectedEvent(parent);
          setSelectionDetailStatus('ready');
          const detailKey = parent.slug || parent.id;
          loadedRequestedEventRef.current = detailKey;
          replaceMapUrlState({ event: detailKey });
          requestEventFocus(parent, 'sidebar');
        } else {
          pinnedExplicitSelectionIdRef.current = null;
          setNavigationStack([]);
          setSelectedEvent(null);
          setSelectionDetailStatus('idle');
          setFocusRequest(null);
          suppressCurrentRequestedEvent();
          replaceMapUrlState({ event: '' });
        }
      } else {
        pinnedExplicitSelectionIdRef.current = null;
        setSelectedEvent(null);
        setSelectionDetailStatus('idle');
        setFocusRequest(null);
        suppressCurrentRequestedEvent();
        replaceMapUrlState({ event: '' });
      }
    });
  }, [
    navigationStack,
    replaceMapUrlState,
    requestEventFocus,
    scheduleAfterTerrainExit,
    suppressCurrentRequestedEvent,
  ]);

  // Get parent event for the popup "back" button
  const parentEvent = useMemo(() => {
    if (navigationStack.length > 0) {
      return navigationStack[navigationStack.length - 1];
    }
    return null;
  }, [navigationStack]);

  const invalidateSelectionRequestUnlessPinned = useCallback(() => {
    if (
      !selectedEvent
      || pinnedExplicitSelectionIdRef.current !== selectedEvent.id
    ) {
      ++selectionRequestIdRef.current;
    }
  }, [selectedEvent]);

  // Handle year change from timeline
  const handleYearChange = useCallback((year: number) => {
    if (!timelineModel) return;
    const resolvedYear = resolveTimelineYear(timelineModel, year);
    invalidateSelectionRequestUnlessPinned();
    scheduleAfterTerrainExit(() => {
      setCurrentYear(resolvedYear);
      replaceMapUrlState({ year: resolvedYear });
    });
  }, [
    invalidateSelectionRequestUnlessPinned,
    replaceMapUrlState,
    scheduleAfterTerrainExit,
    timelineModel,
  ]);

  const handleGradeChange = useCallback((grade: number | null) => {
    invalidateSelectionRequestUnlessPinned();
    scheduleAfterTerrainExit(() => {
      setSelectedGrade(grade);
      replaceMapUrlState({ grade });
    });
  }, [invalidateSelectionRequestUnlessPinned, replaceMapUrlState, scheduleAfterTerrainExit]);

  const handleSearchQueryChange = useCallback((query: string) => {
    invalidateSelectionRequestUnlessPinned();
    setSearchQuery(query);
    replaceMapUrlState({ query });
  }, [invalidateSelectionRequestUnlessPinned, replaceMapUrlState]);

  const handleActiveCategoryChange = useCallback((category: EventType | null) => {
    invalidateSelectionRequestUnlessPinned();
    setActiveCategory(category);
    replaceMapUrlState({ category });
  }, [invalidateSelectionRequestUnlessPinned, replaceMapUrlState]);

  // Close popup
  const handleClosePopup = useCallback(() => {
    ++selectionRequestIdRef.current;
    pinnedExplicitSelectionIdRef.current = null;
    suppressCurrentRequestedEvent();
    setSelectionDetailStatus('idle');
    setFocusRequest(null);
    replaceMapUrlState({ event: '' });
    scheduleAfterTerrainExit(() => {
      setSelectedEvent(null);
      setNavigationStack([]);
    });
  }, [replaceMapUrlState, scheduleAfterTerrainExit, suppressCurrentRequestedEvent]);

  const handleViewEventDetails = useCallback(() => {
    if (!selectedEvent) return;
    const detailKey = selectedEvent.slug || selectedEvent.id;
    scheduleAfterTerrainExit(() => {
      const returnTo = `${location.pathname}${location.search}`;
      navigate(`/events/${detailKey}`, { state: { returnTo, from: returnTo } });
    });
  }, [location.pathname, location.search, navigate, scheduleAfterTerrainExit, selectedEvent]);

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

  // Generic terrain sessions are disabled in the canonical overview flow (C1):
  // no "Xem địa hình" CTA, no target selector, no auto session. The deep 3D
  // module is developed separately and must not depend on this overview path.

  // ─── Terrain Exploration toolbar wiring (Task C) ───────────────────────────
  const clearExploration = useCallback(() => {
    setExplorationMode('none');
    setInspectSessionId((prev) => prev + 1);
    setInspection({ result: null, loading: false, error: null });
    cesiumApiRef.current?.clearInspectionMarker();
    const measurementId = ++measurementSessionCounterRef.current;
    setMeasurementSessionId(measurementId);
    measurementDispatch({ type: 'DEACTIVATE' });
    cesiumApiRef.current?.clearDistanceMeasurement();
  }, []);

  const handleToggleExplorationMode = useCallback((next: TerrainExplorationMode) => {
    setInspectSessionId((prev) => prev + 1);
    setInspection({ result: null, loading: false, error: null });
    cesiumApiRef.current?.clearInspectionMarker();

    const measurementId = ++measurementSessionCounterRef.current;
    setMeasurementSessionId(measurementId);
    cesiumApiRef.current?.clearDistanceMeasurement();
    if (next === 'measure-distance') {
      measurementDispatch({ type: 'ACTIVATE', sessionId: measurementId });
    } else {
      measurementDispatch({ type: 'DEACTIVATE' });
    }
    setExplorationMode(next);
  }, []);

  const resetMeasurement = useCallback(() => {
    if (explorationMode !== 'measure-distance') return;
    const measurementId = ++measurementSessionCounterRef.current;
    setMeasurementSessionId(measurementId);
    cesiumApiRef.current?.clearDistanceMeasurement();
    measurementDispatch({ type: 'RESET', sessionId: measurementId });
  }, [explorationMode]);

  const handleZoomIn = useCallback(() => {
    cesiumApiRef.current?.zoomByFactor(0.2);
  }, []);

  const handleZoomOut = useCallback(() => {
    cesiumApiRef.current?.zoomByFactor(-0.2);
  }, []);

  const handleInspectionResultChange = useCallback(
    (payload: TerrainInspectionPayload) => {
      if (payload.loading) {
        setInspection({ result: null, loading: true, error: null });
        return;
      }
      setInspection({
        result: payload.result,
        loading: false,
        error: payload.error,
      });
    },
    [],
  );

  const handleMeasurementPointChange = useCallback((payload: TerrainMeasurementPayload) => {
    if (payload.sessionId !== measurementSessionCounterRef.current) return;
    if (payload.point) {
      measurementDispatch({
        type: 'CAPTURE_POINT',
        sessionId: payload.sessionId,
        point: payload.point,
      });
    } else if (payload.error) {
      measurementDispatch({
        type: 'SET_ERROR',
        sessionId: payload.sessionId,
        error: payload.error,
      });
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

  const terrainDataSourceStatus = useMemo<TerrainDataSourceStatus>(() => {
    if (terrainViewModel.mode === 'active' && terrainViewModel.providerStatus === 'ready') {
      return 'world-terrain';
    }
    if (terrainViewModel.mode === 'entering') return 'loading';
    if (terrainViewModel.mode === 'error') return 'ellipsoid-fallback';
    return 'unavailable';
  }, [terrainViewModel.mode, terrainViewModel.providerStatus]);

  useEffect(() => {
    const closePanelsOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (activeOverlay) setActiveOverlay(null);
      else if (sidebarOpen) setSidebarOpen(false);
      else if (selectedEvent) handleClosePopup();
    };
    document.addEventListener('keydown', closePanelsOnEscape);
    return () => document.removeEventListener('keydown', closePanelsOnEscape);
  }, [activeOverlay, handleClosePopup, selectedEvent, sidebarOpen]);

  // Clear all exploration data whenever the terrain session leaves "active".
  useEffect(() => {
    if (terrainViewModel.mode !== 'active') clearExploration();
  }, [clearExploration, terrainViewModel.mode]);

  // ─── Also clear whenever the selected event id changes mid-session. ───────
  useEffect(() => {
    if (explorationMode !== 'none') clearExploration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvent?.id]);

  const handleDesktopSidebarCollapse = useCallback((collapsed: boolean) => {
    setDesktopSidebarCollapsed(collapsed);
    if (sidebarResizeTimerRef.current !== null) {
      window.clearTimeout(sidebarResizeTimerRef.current);
    }
    sidebarResizeTimerRef.current = window.setTimeout(() => {
      cesiumApiRef.current?.resize();
      sidebarResizeTimerRef.current = null;
    }, 210);
  }, []);

  // Invalidate pending selection/terrain work when MapPage unmounts.
  useEffect(() => {
    const selectionRequest = selectionRequestIdRef;
    return () => {
      ++selectionRequest.current;
      pendingAfterTerrainExitRef.current = null;
      clearExploration();
      if (sidebarResizeTimerRef.current !== null) {
        window.clearTimeout(sidebarResizeTimerRef.current);
      }
      cesiumApiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="map-shell"
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
      <div className="map-main" style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {sidebarOpen && (
          <button
            type="button"
            className="map-panel-overlay"
            aria-label="Đóng danh sách sự kiện"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        {/* Sidebar */}
        <Sidebar
          events={visibilityProjection.sidebarTree}
          selectedEvent={selectedEvent}
          onSelectEvent={event => {
            void handleSelectEvent(event, normalizedSearchTerm ? 'search' : 'sidebar');
            setSidebarOpen(false);
          }}
          onHoverEvent={setHighlightedEventId}
          searchQuery={searchQuery}
          onSearchQueryChange={handleSearchQueryChange}
          activeCategory={activeCategory}
          onActiveCategoryChange={handleActiveCategoryChange}
          selectedGrade={selectedGrade}
          onGradeChange={handleGradeChange}
          listItemCount={visibilityProjection.rootCount}
          mappedEventCount={visibilityProjection.locatableMapEvents.length}
          loading={eventsLoading || searchLoading || !visibilityReady}
          currentYear={currentYear ?? undefined}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          desktopCollapsed={desktopSidebarCollapsed}
          onDesktopCollapsedChange={handleDesktopSidebarCollapse}
        />

        {/* Map area */}
        <div className="relative flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
          {/* Cesium Map (flex-1 + min-h-0 để không đẩy Timeline ra khỏi viewport) */}
          <div className="relative flex-1 min-h-0">
            <button
              type="button"
              className="map-sidebar-toggle map-sidebar-text-toggle"
              onClick={() => setSidebarOpen(true)}
              aria-label="Mở danh sách sự kiện"
            >
              Danh sách
            </button>
            <CesiumMap
              events={visibilityProjection.locatableMapEvents}
              selectedEvent={selectedEvent}
              onSelectEvent={(event) => void handleSelectEvent(event, 'map-marker')}
              focusRequest={focusRequest}
              highlightedEventId={highlightedEventId}
              terrainSession={terrainSession}
              onTerrainReady={handleTerrainReady}
              onTerrainProviderReady={handleTerrainProviderReady}
              onTerrainGeometryReady={handleTerrainGeometryReady}
              onTerrainEnterError={handleTerrainEnterError}
              onTerrainExitComplete={handleTerrainExitComplete}
              onTerrainTargetSelect={handleTerrainTargetSelect}
              onRegionGeometryStatus={handleRegionGeometryStatus}
              explorationMode={explorationMode}
              inspectionSessionId={inspectSessionId}
              onInspectionResultChange={handleInspectionResultChange}
              measurementSessionId={measurementSessionId}
              measurementPhase={measurement.phase}
              measurementState={measurement}
              onMeasurementPointChange={handleMeasurementPointChange}
              apiRef={cesiumApiRef}
            />

            <div className="map-floating-controls">
              <div className="map-floating-controls__stack" aria-label="Công cụ trợ giúp bản đồ">
                <button
                  type="button"
                  className="map-floating-control"
                  aria-expanded={activeOverlay === 'guide'}
                  onClick={() => setActiveOverlay((current) => current === 'guide' ? null : 'guide')}
                >
                  Hướng dẫn
                </button>
                <button
                  type="button"
                  className="map-floating-control"
                  aria-expanded={activeOverlay === 'legend'}
                  onClick={() => setActiveOverlay((current) => current === 'legend' ? null : 'legend')}
                >
                  Chú giải
                </button>
              </div>

              {activeOverlay === 'legend' && (
                <div className="map-floating-popover">
                  <MapLegend />
                </div>
              )}

            {/* Hero Preview — Bento-style floating museum introduction */}
            {activeOverlay === 'guide' && (
              <div
                className="map-onboarding map-floating-popover glass-map animate-fade-in-up rounded-2xl overflow-hidden"
                style={{
                  maxWidth: '380px',
                  boxShadow: 'var(--shadow)',
                }}
              >
                {/* Gold accent top bar */}
                <div
                  style={{
                    height: '3px',
                    background: 'linear-gradient(to right, var(--accent), var(--admin-accent), transparent)',
                  }}
                />
                <div style={{ padding: '16px 18px 18px' }}>
                  {/* Title row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '10px',
                          background: 'var(--accent-soft)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Compass size={17} strokeWidth={1.8} style={{ color: 'var(--accent)' }} />
                      </div>
                      <h3
                        className="app-heading"
                        style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}
                      >
                        Khám phá Lịch sử Việt Nam
                      </h3>
                    </div>
                    <button
                      onClick={() => setActiveOverlay(null)}
                      aria-label="Đóng hướng dẫn"
                      style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border)',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                        padding: '4px',
                        borderRadius: '6px',
                        display: 'flex',
                      }}
                    >
                      <X size={13} strokeWidth={2.4} />
                    </button>
                  </div>

                  {/* Intro text */}
                  <p
                    style={{
                      fontSize: '12.5px',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.6,
                      marginBottom: '14px',
                    }}
                  >
                    Hành trình xuyên suốt hơn 2.000 năm lịch sử dân tộc qua bản đồ 3D tương tác.
                    Chọn một mốc thời gian để bắt đầu.
                  </p>

                  {/* Quick start steps */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[
                      { icon: Clock, label: 'Chọn mốc thời gian', desc: 'Kéo thanh Timeline bên dưới để chọn thời kỳ lịch sử bạn muốn khám phá' },
                      { icon: List, label: 'Duyệt danh sách sự kiện', desc: 'Tìm kiếm, lọc và duyệt qua danh sách sự kiện hiển thị ở bảng điều khiển bên trái' },
                      { icon: MapPin, label: 'Chọn sự kiện từ sidebar', desc: 'Nhấp vào một sự kiện trong danh sách bên trái để xem chi tiết và khám phá trên bản đồ' },
                    ].map((step, i) => (
                      <div
                        key={i}
                        className="museum-card"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '10px 12px',
                          borderRadius: '12px',
                          cursor: 'default',
                        }}
                      >
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '8px',
                            background: 'var(--accent-soft)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <step.icon size={13} strokeWidth={2} style={{ color: 'var(--accent)' }} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="ui-label" style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '1px' }}>
                            {String(i + 1).padStart(2, '0')} — {step.label}
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-primary)', fontWeight: 500 }}>
                            {step.desc}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            </div>
            {eventsLoading && (
              <div
                className="map-loading-banner glass-map animate-fade-in rounded-xl px-4 py-2.5 text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                Đang tải dữ liệu từ backend...
              </div>
            )}
            {mapError && (
              <div className="map-error-banner" role="alert">
                <CircleAlert size={16} aria-hidden="true" />
                <span>{mapError}</span>
                <button type="button" onClick={() => setMapError(null)} aria-label="Đóng thông báo lỗi">
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            )}

            {/* Terrain exploration toolbar (Task C). Anchored to the map-area
                relative container so it sits over the Cesium canvas, not over
                the sidebar. */}
            {terrainViewModel.mode === 'active' && (
              <TerrainExplorationToolbar
                isVisible
                terrainDataSourceStatus={terrainDataSourceStatus}
                explorationMode={explorationMode}
                onToggleMode={handleToggleExplorationMode}
                inspectionState={inspection}
                measurementState={measurement}
                onResetMeasurement={resetMeasurement}
                onClearMeasurement={resetMeasurement}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                zoomDisabled={terrainViewModel.mode !== 'active'}
                explorationDisabled={terrainViewModel.mode !== 'active'}
              />
            )}
          </div>

          {/* Timeline — flex-shrink-0 đảm bảo không bị squeeze khi map shrink */}
          {timelineModel && currentYear != null && (
            <Timeline
              currentYear={currentYear}
              onYearChange={handleYearChange}
              model={timelineModel}
            />
          )}
        </div>

        {/* Event popup */}
        {selectedEvent && (
          <EventPopup
            event={selectedEvent}
            detailStatus={selectionDetailStatus}
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
              clearExploration();
            }}
            onShowTerrainOverview={() => {
              handleShowTerrainOverview();
              clearExploration();
            }}
            onExitTerrain={() => {
              handleExitTerrain();
              clearExploration();
            }}
            onViewDetails={() => {
              handleViewEventDetails();
              clearExploration();
            }}
          />
        )}
      </div>
    </div>
  );
}
