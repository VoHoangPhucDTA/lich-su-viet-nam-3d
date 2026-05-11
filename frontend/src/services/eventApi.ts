/**
 * Lớp tích hợp Event API giữa frontend và Spring Boot backend.
 *
 * File này giữ vai trò adapter:
 * - Gọi các endpoint `/api/events`, `/api/events/{id}`, `/api/events/{id}/children`.
 * - Chuyển DTO nhẹ từ backend sang shape `HistoricalEvent` mà UI bản đồ đang dùng.
 * - Chuyển DTO detail sang `MockEventDetail` để tái sử dụng các component chi tiết cũ.
 * - Có fallback về static JSON để dev không bị gãy UI khi backend tạm thời tắt.
 */

import type { MockEventDetail } from '../data/mockEventDetails';
import {
  findRawEventByIdOrSlug,
  getRawEventById,
  type RawEventJson,
} from '../data/eventRegistry';
import { rawToEventDetail, rawToHistoricalEvent } from '../data/eventAdapter';
import {
  findEventById,
  getEventsByYear,
} from '../data/events';
import type { EventType, GeoType, HistoricalEvent } from '../types/event';
import { apiGet, apiPost, toQueryString } from './apiClient';

interface EventListResponse {
  items: EventSummaryDto[];
  count: number;
}

interface EventSummaryDto {
  id: string;
  slug?: string;
  title: string;
  shortTitle?: string;
  eventLevel: 'collection' | 'atomic';
  eventType: EventType;
  eventSubtype?: string;
  startYear: number;
  endYear?: number | null;
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
  childCount?: number;
}

interface EventDetailDto extends EventSummaryDto {
  effectiveEndYear: number;
  datePrecision?: string;
  historicalLocations?: string[];
  canonicalSummary?: string;
  detailedNarrative?: string;
  significance?: string;
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
  }[];
  media: {
    id: number;
    mediaType: 'image' | 'video' | 'document' | 'audio';
    url: string;
    caption?: string;
    thumbnail: boolean;
  }[];
  sourceJson?: RawEventJson;
}

interface TimelineEventDto {
  id: string;
  slug?: string;
  title: string;
  shortTitle?: string;
  eventType: EventType;
  startYear: number;
  endYear?: number | null;
  displayDate?: string;
  parentId?: string | null;
  level?: number;
  featured?: boolean;
}

type DisplayMediaType = 'image' | 'video' | 'document';

function isDisplayMediaType(value: string): value is DisplayMediaType {
  return value === 'image' || value === 'video' || value === 'document';
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
  return {
    id: dto.id,
    slug: dto.slug ?? dto.id,
    eventLevel: dto.eventLevel,
    name: dto.title,
    description: dto.cardSummary ?? '',
    startYear: dto.startYear,
    endYear: dto.endYear != null && dto.endYear !== dto.startYear ? dto.endYear : undefined,
    eventType: dto.eventType,
    eventSubtype: dto.eventSubtype,
    geoType: dto.geoType,
    coordinates: hasCoordinates ? { lat: Number(dto.lat), lng: Number(dto.lng) } : undefined,
    primaryRegions: toStringArray(dto.provinceNames),
    parentId: dto.parentId ?? null,
    childCount: dto.childCount ?? 0,
    orderInParent: dto.orderInParent ?? 0,
    details: dto.cardSummary,
  };
}

export function sortHistoricalEvents(events: HistoricalEvent[]): HistoricalEvent[] {
  return [...events].sort(
    (a, b) =>
      (a.orderInParent ?? 0) - (b.orderInParent ?? 0) ||
      a.startYear - b.startYear ||
      a.name.localeCompare(b.name, 'vi')
  );
}

function detailToMockEvent(dto: EventDetailDto): MockEventDetail {
  if (dto.sourceJson) {
    return rawToEventDetail(dto.sourceJson);
  }

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
      start: String(dto.startYear),
      end: dto.endYear != null ? String(dto.endYear) : undefined,
      datePrecision: dto.datePrecision ?? 'year',
      displayDate: dto.displayDate ?? String(dto.startYear),
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
      textbookRefs: dto.textbookRefs.map((ref) => ({
        grade: String(ref.grade),
        book: ref.book,
        theme: ref.theme,
        lesson: ref.lesson,
        pageStart: ref.pageStart,
        pageEnd: ref.pageEnd,
        excerpt: ref.excerpt,
      })),
    },
    media: dto.media.length
      ? {
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
        }
      : undefined,
    hierarchy: {
      rootId: dto.rootId ?? undefined,
      parentId: dto.parentId ?? undefined,
      level: dto.level,
      orderInParent: dto.orderInParent,
    },
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
    const data = await apiGet<EventListResponse>(`/api/events${query}`);
    return sortHistoricalEvents(data.items.map(summaryToHistoricalEvent));
  } catch (error) {
    console.warn('Fallback to static events because backend event list failed.', error);
    return getEventsByYear(year);
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
    console.warn('Fallback to static events because backend search failed.', error);
    const q = normalized.toLowerCase();
    return getEventsByYear(new Date().getFullYear()).filter(
      (event) =>
        event.name.toLowerCase().includes(q) ||
        event.description.toLowerCase().includes(q)
    );
  }
}

export async function getChildrenFromBackend(eventId: string): Promise<HistoricalEvent[]> {
  try {
    const data = await apiGet<EventListResponse>(`/api/events/${eventId}/children`);
    return sortHistoricalEvents(data.items.map(summaryToHistoricalEvent));
  } catch (error) {
    console.warn('Fallback to static children because backend children API failed.', error);
    return findEventById(eventId)?.children ?? [];
  }
}

export async function getHistoricalEventFromBackend(idOrSlug: string): Promise<HistoricalEvent | null> {
  try {
    const data = await apiGet<EventDetailDto>(`/api/events/${idOrSlug}`);
    if (data.sourceJson) {
      return rawToHistoricalEvent(data.sourceJson, { withChildren: true });
    }
    return summaryToHistoricalEvent(data);
  } catch (error) {
    console.warn('Fallback to static event because backend detail API failed.', error);
    return findEventById(idOrSlug) ?? null;
  }
}

export async function getEventDetailFromBackend(slugOrId: string): Promise<MockEventDetail | null> {
  try {
    const data = await apiGet<EventDetailDto>(`/api/events/${slugOrId}`);
    return detailToMockEvent(data);
  } catch (error) {
    console.warn('Fallback to static event detail because backend detail API failed.', error);
    const raw = getRawEventById(slugOrId) ?? findRawEventByIdOrSlug(slugOrId);
    return raw ? rawToEventDetail(raw) : null;
  }
}

export async function getTimelineYearsFromBackend(grade?: number | null): Promise<number[]> {
  try {
    const query = toQueryString({ grade });
    const data = await apiGet<TimelineEventDto[]>(`/api/timeline${query}`);
    return Array.from(new Set(data.map((item) => item.startYear))).sort((a, b) => a - b);
  } catch (error) {
    console.warn('Fallback to static timeline years because backend timeline failed.', error);
    return [];
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
