import type { RawEventJson } from './eventRegistry';
import { getChildIdsOf, getRawEventById } from './eventRegistry';
import type { MockEventDetail } from './mockEventDetails';
import type { EventType, GeoType, HistoricalEvent } from '../types/event';
import { getCentroidFromProvinceNames } from './vietnamProvinceCentroids';

/* ─── Helpers ───────────────────────────────────────────────────────────── */

/** Convert geoType từ JSON (point, multi_point, polygon, multi_polygon, mixed,
 *  nationwide, no_location) → bộ 4 GeoType cũ dùng trong MapPage. */
function toGeoType(geoType?: string): GeoType {
  switch (geoType) {
    case 'point':
    case 'single_point':
      return 'single_point';
    case 'multi_point':
    case 'multi_region':
    case 'multi_polygon':
    case 'polygon':
    case 'mixed':
      return 'multi_region';
    case 'nationwide':
      return 'nationwide';
    case 'no_location':
    default:
      return 'no_location';
  }
}

function toEventType(value?: string): EventType {
  if (value === 'military' || value === 'political' || value === 'economic' || value === 'cultural') {
    return value;
  }
  return 'cultural';
}

function formatDisplayDate(raw: RawEventJson): string {
  if (raw.chronology?.displayDate) return raw.chronology.displayDate;
  const sy = raw.chronology?.start?.year;
  const ey = raw.chronology?.end?.year;
  if (sy != null && ey != null && ey !== sy) return `${sy} – ${ey}`;
  if (sy != null) return sy < 0 ? `${Math.abs(sy)} TCN` : `Năm ${sy}`;
  return 'Không rõ';
}

function tagsToStrings(tags?: Array<string | number>): string[] | undefined {
  if (!tags || tags.length === 0) return undefined;
  return tags.map((t) => String(t));
}

function keyFactsToStrings(facts?: Array<string | number>): string[] | undefined {
  if (!facts || facts.length === 0) return undefined;
  return facts.map((f) => String(f));
}

/* ─── Raw → MockEventDetail (dùng cho EventDetailPage) ──────────────────── */

export function rawToEventDetail(raw: RawEventJson): MockEventDetail {
  const grades = (raw.coverage?.grades ?? []).map((g) => String(g));
  const startYear = raw.chronology?.start?.year;
  const endYear = raw.chronology?.end?.year;

  const detail: MockEventDetail = {
    id: raw.id,
    slug: raw.slug ?? raw.id,
    entityType: 'event',
    eventLevel: raw.eventLevel ?? 'atomic',
    titles: {
      primary: raw.titles?.primary ?? raw.id,
      short: raw.titles?.short,
      alternatives: raw.titles?.alternatives,
    },
    classification: {
      eventType: toEventType(raw.classification?.eventType),
      eventSubtype: raw.classification?.eventSubtype,
      tags: tagsToStrings(raw.classification?.tags),
    },
    coverage: { grades },
    chronology: {
      start: startYear != null ? String(startYear) : '',
      end: endYear != null ? String(endYear) : undefined,
      datePrecision: raw.chronology?.datePrecision ?? 'year',
      displayDate: formatDisplayDate(raw),
    },
    summary: {
      homepageTitle: raw.summary?.homepageTitle ?? raw.titles?.primary ?? '',
      homepageSummary: raw.summary?.homepageSummary ?? '',
      cardSummary: raw.summary?.cardSummary ?? raw.summary?.homepageSummary ?? '',
    },
    textbookContent: {
      canonicalSummary: raw.textbookContent?.canonicalSummary ?? '',
      detailedNarrative: raw.textbookContent?.detailedNarrative,
      significance: raw.textbookContent?.significance,
      keyFacts: keyFactsToStrings(raw.textbookContent?.keyFacts),
      textbookRefs: raw.textbookRefs?.map((r) => ({
        grade: String(r.grade),
        book: r.book,
        theme: r.theme,
        lesson: r.lesson,
        pageStart: r.pageStart,
        pageEnd: r.pageEnd,
        excerpt: r.excerpt,
      })),
    },
    display: {
      showOnHomepage: raw.display?.showOnHomepage ?? true,
      showOnTimeline: raw.display?.showOnTimeline ?? true,
      featured: raw.display?.featured ?? false,
    },
    sourcePolicy: {
      canonicalSource: raw.sourcePolicy?.canonicalSource ?? 'textbook',
      supplementalSources: raw.sourcePolicy?.supplementalSources
        ? raw.sourcePolicy.supplementalSources
            .split('|')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
    },
  };

  /* mapData */
  if (raw.mapData?.displayGeometry) {
    const dg = raw.mapData.displayGeometry;
    detail.mapData = {
      displayGeometry: {
        geoType: toGeoType(dg.geoType),
        marker: dg.marker
          ? { coordinates: [dg.marker.lng, dg.marker.lat] }
          : undefined,
        provinceNames: dg.provinceNames,
        historicalLocations: dg.historicalLocations,
      },
    };
    if (raw.mapData.focusGeometry?.center) {
      const center = raw.mapData.focusGeometry.center;
      detail.mapData.focusGeometry = {
        center: [center.lng, center.lat],
        zoom: raw.mapData.focusGeometry.zoom ?? 8,
      };
    }
  }

  /* hierarchy + computed childIds */
  const childIds = getChildIdsOf(raw.id);
  if (childIds.length > 0 || raw.hierarchy) {
    detail.hierarchy = {
      rootId: raw.hierarchy?.rootId,
      parentId: raw.hierarchy?.parentId,
      level: raw.hierarchy?.level,
      orderInParent: raw.hierarchy?.orderInParent,
      childIds: childIds.length > 0 ? childIds : undefined,
    };
  }

  /* associations */
  if (raw.associations) {
    detail.associations = {
      relatedEventIds: raw.associations.relatedEventIds,
      relatedFigureIds: raw.associations.relatedFigureIds,
      predecessorEventIds: raw.associations.predecessorEventIds,
      successorEventIds: raw.associations.successorEventIds,
    };
  }

  return detail;
}

/* ─── Raw → HistoricalEvent (dùng cho MapPage / Timeline) ───────────────── */

export function rawToHistoricalEvent(
  raw: RawEventJson,
  options: { withChildren?: boolean } = {}
): HistoricalEvent {
  const { withChildren = false } = options;

  const dg = raw.mapData?.displayGeometry;
  const fg = raw.mapData?.focusGeometry;
  const startYear = raw.chronology?.start?.year ?? 0;
  const endYear = raw.chronology?.end?.year;
  const rawGeoType = toGeoType(dg?.geoType);

  // Coordinates: ưu tiên marker → focus center → fallback centroid của tỉnh đầu
  // tiên trong provinceNames. Fallback chỉ áp dụng cho event có gắn địa điểm
  // (≠ no_location), giúp các sự kiện chỉ liệt kê tỉnh vẫn zoom được trên map.
  let coordinates: { lat: number; lng: number } | undefined;
  let resolvedGeoType: GeoType = rawGeoType;
  if (dg?.marker) {
    coordinates = { lat: dg.marker.lat, lng: dg.marker.lng };
  } else if (fg?.center) {
    coordinates = { lat: fg.center.lat, lng: fg.center.lng };
  } else if (rawGeoType !== 'no_location') {
    const centroid = getCentroidFromProvinceNames(dg?.provinceNames);
    if (centroid) {
      coordinates = { lat: centroid.lat, lng: centroid.lng };
      // Đánh dấu là multi_region để CesiumMap zoom với altitude cao hơn (vì
      // marker này chỉ là centroid tỉnh, không phải vị trí chính xác)
      if (rawGeoType === 'single_point') resolvedGeoType = 'multi_region';
    }
  }

  const event: HistoricalEvent = {
    id: raw.id,
    slug: raw.slug,
    name: raw.titles?.primary ?? raw.id,
    description:
      raw.summary?.cardSummary ??
      raw.summary?.homepageSummary ??
      raw.textbookContent?.canonicalSummary ??
      '',
    startYear,
    endYear: endYear != null && endYear !== startYear ? endYear : undefined,
    eventType: toEventType(raw.classification?.eventType),
    eventSubtype: raw.classification?.eventSubtype,
    geoType: resolvedGeoType,
    coordinates,
    primaryRegions: dg?.provinceNames,
    parentId: raw.hierarchy?.parentId ?? null,
    details:
      raw.textbookContent?.detailedNarrative ??
      raw.textbookContent?.canonicalSummary,
  };

  if (withChildren) {
    const childIds = getChildIdsOf(raw.id);
    if (childIds.length > 0) {
      const children = childIds
        .map((cid) => getRawEventById(cid))
        .filter((c): c is RawEventJson => !!c)
        .map((c) => rawToHistoricalEvent(c, { withChildren: true }));
      if (children.length > 0) {
        event.children = children;
      }
    }
  }

  return event;
}
