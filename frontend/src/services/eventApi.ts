/**
 * Lớp tích hợp Event API giữa frontend và Spring Boot backend.
 *
 * File này giữ vai trò adapter:
 * - Gọi các endpoint `/api/events`, `/api/events/{id}`, `/api/events/{id}/children`.
 * - Chuyển DTO nhẹ từ backend sang shape `HistoricalEvent` mà UI bản đồ đang dùng.
 * - Chuyển DTO detail sang `MockEventDetail` để tái sử dụng các component chi tiết cũ.
 * - Không trộn dữ liệu static/mock vào runtime khi backend lỗi.
 */

import type { MockEventDetail } from '../data/mockEventDetails';
import type {
  EventAssociationType,
  CanonicalGeoType,
  EventType,
  GeoType,
  HistoricalEvent,
  RelatedHistoricalEvent,
  RelatedHistoricalEvents,
  SourceMapData,
} from '../types/event';
import {
  compareChronologyS1,
  compareChronologyS1Descending,
  compareHierarchyChronology,
  formatChronologyLabel,
  normalizeChronology,
  timelineYearsFromEvents,
} from '../utils/chronology';
import { apiGet, apiPost, toQueryString } from './apiClient';

interface EventListResponse {
  items: EventSummaryDto[];
  count: number;
  total?: number;
  limit?: number;
  offset?: number;
}

interface EventSummaryDto {
  id: string;
  slug?: string;
  title: string;
  shortTitle?: string;
  eventLevel: 'collection' | 'atomic';
  eventType: EventType;
  eventSubtype?: string;
  startYear: number | null;
  endYear: number | null;
  effectiveEndYear?: number | null;
  displayDate?: string;
  geoType: GeoType;
  lat?: number | null;
  lng?: number | null;
  provinceNames?: string[];
  parentId?: string | null;
  rootId?: string | null;
  level?: number;
  orderInParent?: number;
  cardSummary?: string;
  featured?: boolean;
  thumbnailUrl?: string | null;
  childCount?: number;
}

interface EventDetailDto extends EventSummaryDto {
  effectiveEndYear: number | null;
  datePrecision?: string;
  historicalLocations?: string[];
  canonicalSummary?: string;
  detailedNarrative?: string;
  significance?: string;
  keyFacts?: string[];
  showOnHomepage: boolean;
  showOnTimeline: boolean;
  status: string;
  grades: number[];
  textbookRefs: {
    grade: number;
    book: string;
    theme?: string;
    lesson?: string;
    pageStart?: number;
    pageEnd?: number;
    excerpt?: string;
    url?: string;
  }[];
  textbookContent?: string;
  externalSources: {
    sourceType: string;
    title: string;
    canonicalUri?: string;
    externalId?: string;
    language?: string;
    sourceOrder?: number;
    matchType: string;
    primary: boolean;
    verificationStatus: string;
    notes?: string;
  }[];
  media: {
    id: number;
    mediaType: 'image' | 'video' | 'document' | 'audio';
    url: string;
    caption?: string;
    thumbnail: boolean;
  }[];
  relations: EventRelationDto[];
  relatedEvents?: EventRelatedEventsDto;
  mapData?: SourceMapData | null;
}

function isCanonicalGeoType(value: unknown): value is CanonicalGeoType {
  return (
    value === 'point' ||
    value === 'multi_point' ||
    value === 'multi_polygon' ||
    value === 'mixed' ||
    value === 'nationwide' ||
    value === 'no_location'
  );
}

function sourceMapDataFromDto(dto: EventDetailDto): SourceMapData | undefined {
  const mapData = dto.mapData;
  if (!mapData || typeof mapData !== 'object' || Array.isArray(mapData)) return undefined;
  return mapData;
}

interface EventRelationDto {
  associationType?: EventAssociationType;
  relationType: 'related' | 'predecessor' | 'successor' | 'same_topic' | 'same_location' | string;
  relationLabel?: string;
  sortOrder?: number;
  event: EventSummaryDto;
}

interface EventRelatedEventDto {
  id: string;
  slug?: string;
  title: string;
  shortTitle?: string;
  displayDate?: string;
  cardSummary?: string;
  eventType: EventType;
  geoType: GeoType;
  thumbnailUrl?: string | null;
  associationType: EventAssociationType;
  relationType: 'related' | 'predecessor' | 'successor' | 'same_topic' | 'same_location' | string;
  relationLabel: string;
  sortOrder?: number | null;
}

interface EventRelatedEventsDto {
  predecessors?: EventRelatedEventDto[];
  successors?: EventRelatedEventDto[];
  related?: EventRelatedEventDto[];
}

interface TimelineEventDto {
  id: string;
  slug?: string;
  title: string;
  shortTitle?: string;
  eventType: EventType;
  startYear: number | null;
  endYear: number | null;
  effectiveEndYear?: number | null;
  displayDate?: string;
  parentId?: string | null;
  level?: number;
  featured?: boolean;
}

type DisplayMediaType = 'image' | 'video' | 'document';

function isDisplayMediaType(value: string): value is DisplayMediaType {
  return value === 'image' || value === 'video' || value === 'document';
}

function detailMediaFromDto(dto: EventDetailDto): MockEventDetail['media'] | undefined {
  if (!dto.media.length) return undefined;
  return {
    thumbnail: dto.media.find((item) => item.thumbnail)?.url,
    items: dto.media
      .filter((item): item is typeof item & { mediaType: DisplayMediaType } =>
        isDisplayMediaType(item.mediaType)
      )
      .map((item) => ({
        id: String(item.id),
        type: item.mediaType,
        url: item.url,
        caption: item.caption,
      })),
  };
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .filter((item): item is string | number => typeof item === 'string' || typeof item === 'number')
    .map((item) => String(item));
  return items.length > 0 ? items : undefined;
}

function summaryToHistoricalEvent(dto: EventSummaryDto): HistoricalEvent {
  const hasCoordinates = dto.lat != null && dto.lng != null;
  const chronology = normalizeChronology({
    startYear: dto.startYear,
    endYear: dto.endYear,
    effectiveEndYear: dto.effectiveEndYear,
    displayDate: dto.displayDate,
  });
  return {
    id: dto.id,
    slug: dto.slug ?? dto.id,
    eventLevel: dto.eventLevel,
    name: dto.title,
    description: dto.cardSummary ?? '',
    startYear: chronology.startYear,
    endYear: chronology.endYear,
    effectiveEndYear: chronology.effectiveEndYear,
    displayDate: chronology.displayDate,
    eventType: dto.eventType,
    eventSubtype: dto.eventSubtype,
    geoType: dto.geoType,
    coordinates: hasCoordinates ? { lat: Number(dto.lat), lng: Number(dto.lng) } : undefined,
    primaryRegions: toStringArray(dto.provinceNames),
    parentId: dto.parentId ?? null,
    childCount: dto.childCount ?? 0,
    orderInParent: dto.orderInParent ?? 0,
    thumbnailUrl: dto.thumbnailUrl || undefined,
    details: dto.cardSummary,
  };
}

function detailToHistoricalEvent(dto: EventDetailDto): HistoricalEvent {
  const event = summaryToHistoricalEvent(dto);
  const sourceMapData = sourceMapDataFromDto(dto);
  return {
    ...event,
    sourceMapData,
    canonicalGeoType: isCanonicalGeoType(sourceMapData?.geoType)
      ? sourceMapData.geoType
      : undefined,
  };
}

function relatedDtoToHistoricalEvent(dto: EventRelatedEventDto): RelatedHistoricalEvent {
  return {
    id: dto.id,
    slug: dto.slug ?? dto.id,
    name: dto.title,
    description: dto.cardSummary ?? '',
    startYear: null,
    endYear: null,
    effectiveEndYear: null,
    displayDate: dto.displayDate,
    eventType: dto.eventType,
    geoType: dto.geoType,
    parentId: null,
    thumbnailUrl: dto.thumbnailUrl || undefined,
    details: dto.cardSummary,
    associationType: dto.associationType,
    relationType: dto.relationType,
    relationLabel: dto.relationLabel,
    sortOrder: dto.sortOrder ?? 0,
  };
}

function relatedEventsFromDto(dto?: EventRelatedEventsDto): RelatedHistoricalEvents {
  return {
    predecessors: (dto?.predecessors ?? []).map(relatedDtoToHistoricalEvent),
    successors: (dto?.successors ?? []).map(relatedDtoToHistoricalEvent),
    related: (dto?.related ?? []).map(relatedDtoToHistoricalEvent),
  };
}

function hasRelatedGroups(groups: RelatedHistoricalEvents): boolean {
  return groups.predecessors.length > 0 || groups.successors.length > 0 || groups.related.length > 0;
}

function associationTypeFromRelationType(relationType: EventRelationDto['relationType']): EventAssociationType {
  if (relationType === 'predecessor') return 'predecessor';
  if (relationType === 'successor') return 'successor';
  return 'related';
}

function relationLabel(relationType: EventRelationDto['relationType']): string {
  switch (relationType) {
    case 'predecessor':
      return 'Sự kiện trước đó';
    case 'successor':
      return 'Diễn biến tiếp theo';
    case 'same_topic':
      return 'Cùng chủ đề';
    case 'same_location':
      return 'Cùng địa điểm';
    default:
      return 'Liên quan';
  }
}

function relatedEventsFromRelations(relations: EventRelationDto[] | undefined, currentEventId: string): RelatedHistoricalEvents {
  const groups: RelatedHistoricalEvents = { predecessors: [], successors: [], related: [] };
  const seen = new Set<string>();

  for (const relation of relations ?? []) {
    if (relation.event.id === currentEventId || seen.has(relation.event.id)) continue;
    seen.add(relation.event.id);

    const associationType = relation.associationType ?? associationTypeFromRelationType(relation.relationType);
    const item: RelatedHistoricalEvent = {
      ...summaryToHistoricalEvent(relation.event),
      associationType,
      relationType: relation.relationType,
      relationLabel: relation.relationLabel ?? relationLabel(relation.relationType),
      sortOrder: relation.sortOrder ?? 0,
    };

    if (associationType === 'predecessor') groups.predecessors.push(item);
    else if (associationType === 'successor') groups.successors.push(item);
    else groups.related.push(item);
  }

  return groups;
}

export function sortHistoricalEvents(events: HistoricalEvent[]): HistoricalEvent[] {
  return [...events].sort(compareChronologyS1);
}

export function sortHistoricalEventsDescending(events: HistoricalEvent[]): HistoricalEvent[] {
  return [...events].sort(compareChronologyS1Descending);
}

export function sortHierarchyEvents(events: HistoricalEvent[]): HistoricalEvent[] {
  return [...events].sort(compareHierarchyChronology);
}

function detailToMockEvent(dto: EventDetailDto): MockEventDetail {
  const apiRelatedEvents = relatedEventsFromDto(dto.relatedEvents);
  const relatedEvents = hasRelatedGroups(apiRelatedEvents)
    ? apiRelatedEvents
    : relatedEventsFromRelations(dto.relations, dto.id);
  const relatedEventIds = relatedEvents.related.map((event) => event.id);
  const predecessorEventIds = relatedEvents.predecessors.map((event) => event.id);
  const successorEventIds = relatedEvents.successors.map((event) => event.id);
  const externalSources = dto.externalSources ?? [];

  const media = detailMediaFromDto(dto);

  return {
    id: dto.id,
    slug: dto.slug ?? dto.id,
    entityType: 'event',
    eventLevel: dto.eventLevel,
    titles: {
      primary: dto.title,
      short: dto.shortTitle,
    },
    classification: {
      eventType: dto.eventType,
      eventSubtype: dto.eventSubtype,
    },
    coverage: {
      grades: dto.grades.map(String),
    },
    chronology: {
      start: dto.startYear != null ? String(dto.startYear) : '',
      end: dto.endYear != null ? String(dto.endYear) : undefined,
      datePrecision: dto.datePrecision ?? 'year',
      displayDate: formatChronologyLabel(dto),
    },
    mapData: {
      displayGeometry: {
        geoType: dto.geoType,
        marker:
          dto.lat != null && dto.lng != null
            ? { coordinates: [Number(dto.lng), Number(dto.lat)] }
            : undefined,
        provinceNames: toStringArray(dto.provinceNames),
        historicalLocations: toStringArray(dto.historicalLocations),
      },
    },
    summary: {
      homepageTitle: dto.title,
      homepageSummary: dto.canonicalSummary ?? dto.cardSummary ?? '',
      cardSummary: dto.cardSummary ?? dto.canonicalSummary ?? '',
    },
    textbookContent: {
      canonicalSummary: dto.canonicalSummary ?? '',
      detailedNarrative: dto.detailedNarrative,
      significance: dto.significance,
      keyFacts: dto.keyFacts,
      sourceContent: dto.textbookContent,
      textbookRefs: dto.textbookRefs.map((ref) => ({
        grade: String(ref.grade),
        book: ref.book,
        theme: ref.theme,
        lesson: ref.lesson,
        pageStart: ref.pageStart,
        pageEnd: ref.pageEnd,
        excerpt: ref.excerpt,
        url: ref.url,
      })),
    },
    externalSources,
    media,
    hierarchy: {
      rootId: dto.rootId ?? undefined,
      parentId: dto.parentId ?? undefined,
      childCount: dto.childCount ?? 0,
      level: dto.level,
      orderInParent: dto.orderInParent,
    },
    associations: {
      relatedEventIds,
      predecessorEventIds,
      successorEventIds,
    },
    relatedEvents,
    display: {
      showOnHomepage: dto.showOnHomepage,
      showOnTimeline: dto.showOnTimeline,
      featured: dto.featured ?? false,
    },
    sourcePolicy: {
      canonicalSource: 'textbook',
    },
  };
}

export async function getEventsByYearFromBackend(year: number, grade?: number | null): Promise<HistoricalEvent[]> {
  try {
    const query = toQueryString({ year, grade, limit: 1000 });
    // 1.1.3: eventApi.ts: Gọi API GET /api/events?year={year}&grade={grade} đến EventController.java.
    const data = await apiGet<EventListResponse>(`/api/events${query}`);
    // 1.1.9: eventApi.ts: Trả dữ liệu mảng sự kiện (HistoricalEvent) về cho Component quản lý state chính.
    return sortHistoricalEvents(data.items.map(summaryToHistoricalEvent));
  } catch (error) {
    console.warn('Could not load events by year from backend.', error);
    return [];
  }
}

export async function searchEventsFromBackend(queryText: string): Promise<HistoricalEvent[]> {
  const normalized = queryText.trim();
  if (!normalized) return [];

  try {
    const query = toQueryString({ q: normalized, limit: 1000 });
    const data = await apiGet<EventListResponse>(`/api/events${query}`);
    return sortHistoricalEvents(data.items.map(summaryToHistoricalEvent));
  } catch (error) {
    console.warn('Could not search events from backend.', error);
    return [];
  }
}

export async function getChildrenFromBackend(eventId: string): Promise<HistoricalEvent[]> {
  try {
    // 1.1.14: eventApi.ts: Gọi API GET /api/events/{eventId}/children đến Backend để lấy dữ liệu con.
    const data = await apiGet<EventListResponse>(`/api/events/${eventId}/children`);
    return sortHierarchyEvents(data.items.map(summaryToHistoricalEvent));
  } catch (error) {
    console.warn('Could not load children from backend.', error);
    return [];
  }
}

export async function getRelatedEventsFromBackend(eventId: string): Promise<RelatedHistoricalEvents> {
  try {
    const data = await apiGet<EventRelatedEventsDto>(`/api/events/${eventId}/related`);
    return relatedEventsFromDto(data);
  } catch (error) {
    console.warn('Could not load related events from backend.', error);
    return { predecessors: [], successors: [], related: [] };
  }
}

export async function getHistoricalEventFromBackend(idOrSlug: string): Promise<HistoricalEvent | null> {
  try {
    const data = await apiGet<EventDetailDto>(`/api/events/${idOrSlug}`);
    return detailToHistoricalEvent(data);
  } catch (error) {
    console.warn('Could not load event detail from backend.', error);
    return null;
  }
}

export async function getEventDetailFromBackend(slugOrId: string): Promise<MockEventDetail | null> {
  try {
    const data = await apiGet<EventDetailDto>(`/api/events/${slugOrId}`);
    return detailToMockEvent(data);
  } catch (error) {
    console.warn('Could not load event detail from backend.', error);
    return null;
  }
}

export async function getTimelineYearsFromBackend(grade?: number | null): Promise<number[]> {
  try {
    const query = toQueryString({ grade });
    const data = await apiGet<TimelineEventDto[]>(`/api/timeline${query}`);
    return timelineYearsFromEvents(data);
  } catch (error) {
    console.warn('Could not load timeline years from backend.', error);
    return [];
  }
}

const HOMEPAGE_FEATURED_EVENT_IDS = [
  'chien-thang-bach-dang-938',
  'ly-thai-to-doi-do-thang-long',
  'khang-chien-chong-quan-thanh-1789',
  'ho-chi-minh-cong-bo-tuyen-ngon-doc-lap',
  'chien-dich-dien-bien-phu-1954',
  'chien-dich-giai-phong-sai-gon-gia-dinh-chien-dich-ho-chi-minh',
] as const;

export async function getHomepageEvents(): Promise<HistoricalEvent[]> {
  const results = await Promise.allSettled(
    HOMEPAGE_FEATURED_EVENT_IDS.map((eventId) =>
      apiGet<EventDetailDto>(`/api/events/${eventId}`),
    ),
  );
  const events = results.flatMap((result) =>
    result.status === 'fulfilled' ? [summaryToHistoricalEvent(result.value)] : [],
  );

  if (events.length === HOMEPAGE_FEATURED_EVENT_IDS.length) return events;

  try {
    const query = toQueryString({ eventLevel: 'atomic', limit: 30 });
    const data = await apiGet<EventListResponse>(`/api/events${query}`);
    const seen = new Set(events.map((event) => event.id));

    for (const dto of data.items) {
      if (seen.has(dto.id)) continue;
      seen.add(dto.id);
      events.push(summaryToHistoricalEvent(dto));
      if (events.length >= HOMEPAGE_FEATURED_EVENT_IDS.length) break;
    }
  } catch (error) {
    console.warn('Could not load fallback homepage events from backend.', error);
  }

  return events;
}

export interface BrowseEventsParams {
  q?: string;
  eventType?: string;
  eventLevel?: 'atomic' | 'collection';
  year?: number;
  grade?: number;
  limit?: number;
  offset?: number;
  sortBy?: 'year' | 'name';
  sortDir?: 'asc' | 'desc';
  startYearFrom?: number;
  startYearTo?: number;
}

export interface BrowseEventsResult {
  events: HistoricalEvent[];
  total: number;
  hasMore: boolean;
}

export async function getBrowseEvents(
  params: BrowseEventsParams,
  options?: { signal?: AbortSignal },
): Promise<BrowseEventsResult> {
  try {
    const query = toQueryString({
      q: params.q || undefined,
      eventType: params.eventType || undefined,
      eventLevel: params.eventLevel ?? 'atomic',
      year: params.year || undefined,
      grade: params.grade || undefined,
      limit: params.limit ?? 24,
      offset: params.offset ?? 0,
      sortBy: params.sortBy,
      sortDir: params.sortDir,
      startYearFrom: params.startYearFrom,
      startYearTo: params.startYearTo,
    });
    const data = await apiGet<EventListResponse>(`/api/events${query}`, { signal: options?.signal });
    const events = data.items.map(summaryToHistoricalEvent);

    if (params.sortBy === 'name') {
      events.sort((a, b) =>
        (params.sortDir === 'desc' ? -1 : 1) * a.name.localeCompare(b.name, 'vi')
      );
    } else {
      events.sort(params.sortDir === 'desc' ? compareChronologyS1Descending : compareChronologyS1);
    }

    const responseSize = events.length;
    const limit = params.limit ?? 24;
    const offset = params.offset ?? 0;
    const total = data.total ?? data.count ?? responseSize;
    return {
      events,
      total,
      hasMore: data.total != null ? offset + responseSize < total : responseSize >= limit,
    };
  } catch (error) {
    console.warn('Could not browse events from backend.', error);
    return {
      events: [],
      total: 0,
      hasMore: false,
    };
  }
}

export async function recordEventView(
  eventId: string,
  payload: { durationSeconds?: number; progressPercent?: number; source?: 'map' | 'detail' | 'search' | 'quiz' | 'exam' }
): Promise<void> {
  try {
    await apiPost(`/api/events/${eventId}/view`, payload);
  } catch (error) {
    console.warn('Could not record event view.', error);
  }
}

export interface EventProgressResponse {
  eventId: string;
  progressPercent: number;
  viewedAt: string;
}

export async function getEventProgress(eventId: string): Promise<EventProgressResponse | null> {
  try {
    return await apiGet<EventProgressResponse>(`/api/events/${eventId}/progress`);
  } catch (error) {
    console.warn('Could not fetch event progress.', error);
    return null;
  }
}
