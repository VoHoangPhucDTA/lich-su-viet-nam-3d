import type { EventType, HistoricalEvent, SourceMapMarker } from '../types/event';
import { hasEventRegionReferences } from './regionGeometry';

export interface MapQueryState {
  year: number;
  searchTerm: string;
  grade: number | null;
  category: EventType | null;
}

export interface MapVisibilityOptions {
  childrenByParentId?: Readonly<Record<string, readonly HistoricalEvent[]>>;
  /** IDs returned by the backend search for the normalized search term. */
  searchCandidateIds?: ReadonlySet<string>;
  /** IDs returned by the backend year + grade query. */
  scopeEventIds?: ReadonlySet<string>;
}

export interface MapVisibilityProjection {
  sidebarTree: HistoricalEvent[];
  flattenedEvents: HistoricalEvent[];
  locatableMapEvents: HistoricalEvent[];
  visibleEventIds: Set<string>;
  rootCount: number;
  flattenedCount: number;
  markerCandidateCount: number;
}

export function normalizeMapSearchTerm(value: string): string {
  return value
    .normalize('NFC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('vi-VN');
}

export function collectMapScopeEventIds(
  events: readonly HistoricalEvent[],
): Set<string> {
  const eventIds = new Set<string>();

  const visit = (event: HistoricalEvent) => {
    if (eventIds.has(event.id)) return;
    eventIds.add(event.id);
    event.children?.forEach(visit);
  };

  events.forEach(visit);
  return eventIds;
}

function isValidCoordinate(value: unknown): value is { lat: number; lng: number } {
  if (!value || typeof value !== 'object') return false;
  const coordinate = value as { lat?: unknown; lng?: unknown };
  return typeof coordinate.lat === 'number'
    && Number.isFinite(coordinate.lat)
    && coordinate.lat >= -90
    && coordinate.lat <= 90
    && typeof coordinate.lng === 'number'
    && Number.isFinite(coordinate.lng)
    && coordinate.lng >= -180
    && coordinate.lng <= 180;
}

function hasValidMarker(value: SourceMapMarker | null | undefined): boolean {
  return isValidCoordinate(value);
}

function hasEventPointGeometry(event: HistoricalEvent): boolean {
  if (isValidCoordinate(event.coordinates) || hasValidMarker(event.sourceMapData?.marker)) {
    return true;
  }
  return event.sourceMapData?.markers?.some(hasValidMarker) === true;
}

export function isEventLocatableOnMap(event: HistoricalEvent): boolean {
  switch (event.geoType) {
    case 'point':
    case 'multi_point':
      return hasEventPointGeometry(event);
    case 'multi_polygon':
      return hasEventRegionReferences(event);
    case 'mixed':
      return hasEventPointGeometry(event) || hasEventRegionReferences(event);
    case 'nationwide':
    case 'no_location':
      return false;
  }
}

function eventMatchesSearch(event: HistoricalEvent, normalizedSearch: string): boolean {
  if (!normalizedSearch) return true;

  const name = normalizeMapSearchTerm(event.name);
  const description = normalizeMapSearchTerm(event.description);
  return name.includes(normalizedSearch) || description.includes(normalizedSearch);
}

function eventMatchesYear(event: HistoricalEvent, year: number): boolean {
  if (event.startYear == null) return false;

  const rawEnd = event.effectiveEndYear ?? event.endYear ?? event.startYear;
  const start = Math.min(event.startYear, rawEnd);
  const end = Math.max(event.startYear, rawEnd);
  return year >= start && year <= end;
}

function flattenTree(events: readonly HistoricalEvent[]): HistoricalEvent[] {
  const flattened: HistoricalEvent[] = [];
  const seen = new Set<string>();

  const visit = (event: HistoricalEvent) => {
    if (seen.has(event.id)) return;
    seen.add(event.id);
    flattened.push(event);
    event.children?.forEach(visit);
  };

  events.forEach(visit);
  return flattened;
}

function createSourceTree(
  candidates: readonly HistoricalEvent[],
  cachedChildren: Readonly<Record<string, readonly HistoricalEvent[]>>,
): HistoricalEvent[] {
  const eventsById = new Map<string, HistoricalEvent>();
  const childIdsByParent = new Map<string, string[]>();
  const insertionOrder: string[] = [];

  const register = (event: HistoricalEvent) => {
    const existing = eventsById.get(event.id);
    if (!existing) insertionOrder.push(event.id);
    eventsById.set(event.id, {
      ...existing,
      ...event,
      children: undefined,
    });
  };

  const addRelationship = (parentId: string, childId: string) => {
    const childIds = childIdsByParent.get(parentId) ?? [];
    if (!childIds.includes(childId)) childIds.push(childId);
    childIdsByParent.set(parentId, childIds);
  };

  const registerTree = (event: HistoricalEvent) => {
    register(event);
    for (const child of event.children ?? []) {
      registerTree(child);
      addRelationship(event.id, child.id);
    }
  };

  candidates.forEach(registerTree);
  for (const [parentId, children] of Object.entries(cachedChildren)) {
    for (const child of children) {
      registerTree(child);
      addRelationship(parentId, child.id);
    }
  }

  for (const event of eventsById.values()) {
    if (event.parentId && eventsById.has(event.parentId)) {
      addRelationship(event.parentId, event.id);
    }
  }

  const childIds = new Set<string>();
  for (const ids of childIdsByParent.values()) ids.forEach((id) => childIds.add(id));

  const buildNode = (id: string, ancestors: ReadonlySet<string>): HistoricalEvent | null => {
    const event = eventsById.get(id);
    if (!event || ancestors.has(id)) return null;

    const nextAncestors = new Set(ancestors);
    nextAncestors.add(id);
    const children = (childIdsByParent.get(id) ?? [])
      .map((childId) => buildNode(childId, nextAncestors))
      .filter((child): child is HistoricalEvent => child !== null);

    return {
      ...event,
      children: children.length > 0 ? children : undefined,
    };
  };

  return insertionOrder
    .filter((id) => !childIds.has(id))
    .map((id) => buildNode(id, new Set()))
    .filter((event): event is HistoricalEvent => event !== null);
}

export function buildMapVisibilityProjection(
  candidates: readonly HistoricalEvent[],
  query: MapQueryState,
  options: MapVisibilityOptions = {},
): MapVisibilityProjection {
  const normalizedSearch = normalizeMapSearchTerm(query.searchTerm);
  const isGlobalSearch = normalizedSearch.length > 0;
  const scopeEventIds = options.scopeEventIds ?? collectMapScopeEventIds(candidates);
  const sourceTree = createSourceTree(candidates, options.childrenByParentId ?? {});
  const visibleEventIds = new Set<string>();
  const matchingEvents: HistoricalEvent[] = [];

  const filterNode = (event: HistoricalEvent): HistoricalEvent | null => {
    const children = (event.children ?? [])
      .map(filterNode)
      .filter((child): child is HistoricalEvent => child !== null);
    const isSearchCandidate =
      !normalizedSearch || options.searchCandidateIds?.has(event.id) === true;
    const matchesSelf =
      (isGlobalSearch || scopeEventIds.has(event.id)) &&
      (isGlobalSearch || eventMatchesYear(event, query.year)) &&
      isSearchCandidate &&
      eventMatchesSearch(event, normalizedSearch) &&
      (!query.category || event.eventType === query.category);

    if (matchesSelf) {
      visibleEventIds.add(event.id);
      matchingEvents.push(event);
    }

    if (!matchesSelf && children.length === 0) return null;
    return {
      ...event,
      children: event.children ? children : undefined,
    };
  };

  const sidebarTree = sourceTree
    .map(filterNode)
    .filter((event): event is HistoricalEvent => event !== null);
  const flattenedEvents = flattenTree(sidebarTree);
  const locatableMapEvents = matchingEvents.filter(
    (event, index, events) =>
      isEventLocatableOnMap(event) &&
      events.findIndex((candidate) => candidate.id === event.id) === index,
  );

  return {
    sidebarTree,
    flattenedEvents,
    locatableMapEvents,
    visibleEventIds,
    rootCount: sidebarTree.length,
    flattenedCount: flattenedEvents.length,
    markerCandidateCount: locatableMapEvents.length,
  };
}
