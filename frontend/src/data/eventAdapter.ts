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
    case 'multi_point':
    case 'multi_polygon':
    case 'mixed':
    case 'single_point':
    case 'multi_region':
    case 'polygon':
    case 'nationwide':
    case 'no_location':
      return geoType;
    default:
      return 'no_location';
  }
}

type MapMarker = { lat: number; lng: number; label?: string };

function toMarker(marker?: { lat: number; lng: number; label?: string; name?: string }): MapMarker | undefined {
  if (!marker || !Number.isFinite(marker.lat) || !Number.isFinite(marker.lng)) return undefined;
  const result: MapMarker = {
    lat: marker.lat,
    lng: marker.lng,
  };
  const label = marker.label ?? marker.name;
  if (label) result.label = label;
  return result;
}

function toMarkers(markers?: Array<{ lat: number; lng: number; label?: string; name?: string }>) {
  if (!Array.isArray(markers)) return undefined;
  const items = markers
    .map(toMarker)
    .filter((marker): marker is MapMarker => !!marker);
  return items.length > 0 ? items : undefined;
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

/** Hỗ trợ cả supplementalSources dạng string (cũ: "a|b|c") và dạng array (mới: ["a","b"]) */
function normalizeSupplementalSources(src: unknown): string[] | undefined {
  if (Array.isArray(src)) {
    const items = src.filter((s): s is string => typeof s === 'string').map((s) => s.trim()).filter(Boolean);
    return items.length > 0 ? items : undefined;
  }
  if (typeof src === 'string') {
    const items = src.split('|').map((s) => s.trim()).filter(Boolean);
    return items.length > 0 ? items : undefined;
  }
  return undefined;
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
      textbookRefs: (raw.textbookContent?.textbookRefs ?? raw.textbookRefs)?.map((r) => ({
        grade: String(r.grade),
        book: r.book,
        theme: r.theme,
        lesson: r.lesson,
        pageStart: r.pageStart,
        pageEnd: r.pageEnd,
        excerpt: r.excerpt,
      })),
    },
    /* media */
    media: raw.media
      ? {
          thumbnail: raw.media.thumbnail || undefined,
          items: raw.media.items
            ?.filter((item) => item.url && item.url.trim() !== '')
            .map((item) => ({
              id: item.id,
              type: item.type as 'image' | 'video' | 'document',
              url: item.url,
              caption: item.caption,
            })),
        }
      : undefined,

    /* externalContent */
    externalContent: raw.externalContent
      ? {
          wikipedia: raw.externalContent.wikipedia
            ? { title: raw.externalContent.wikipedia.title, url: raw.externalContent.wikipedia.url }
            : undefined,
          wikidata: raw.externalContent.wikidata
            ? { url: raw.externalContent.wikidata.url }
            : undefined,
          otherSources: raw.externalContent.otherSources?.filter((s) => s.url.trim() !== ''),
        }
      : undefined,

    display: {
      showOnHomepage: raw.display?.showOnHomepage ?? raw.display?.showOnMap ?? true,
      showOnTimeline: raw.display?.showOnTimeline ?? true,
      featured: raw.display?.featured ?? false,
    },
    sourcePolicy: {
      canonicalSource: raw.sourcePolicy?.canonicalSource ?? raw.sourcePolicy?.primarySource ?? 'textbook',
      supplementalSources: raw.sourcePolicy?.supplementalSources
        ? normalizeSupplementalSources(raw.sourcePolicy.supplementalSources)
        : undefined,
    },
  };

  /* mapData — hỗ trợ cả format cũ (displayGeometry wrapper) và format mới (flat) */
  const rawDg = raw.mapData?.displayGeometry;
  detail.mapData = rawDg
    ? /* ─── Old format: displayGeometry wrapper ─── */
      {
        displayGeometry: {
          geoType: toGeoType(rawDg.geoType),
          marker: rawDg.marker
            ? { coordinates: [rawDg.marker.lng, rawDg.marker.lat] }
            : undefined,
          markers: toMarkers(rawDg.markers)?.map((marker) => ({
            coordinates: [marker.lng, marker.lat],
            label: marker.label,
          })),
          provinceNames: rawDg.provinceNames,
          historicalLocations: rawDg.historicalLocations,
        },
        focusGeometry: raw.mapData!.focusGeometry?.center
          ? {
              center: [raw.mapData!.focusGeometry!.center!.lng, raw.mapData!.focusGeometry!.center!.lat],
              zoom: raw.mapData!.focusGeometry!.zoom ?? 8,
            }
          : undefined,
      }
    : /* ─── New JSONL format: flat mapData ─── */
      raw.mapData
      ? {
          displayGeometry: {
            geoType: toGeoType(raw.mapData.geoType),
            marker: raw.mapData.marker
              ? { coordinates: [raw.mapData.marker.lng, raw.mapData.marker.lat] }
              : undefined,
            markers: toMarkers(raw.mapData.markers)?.map((marker) => ({
              coordinates: [marker.lng, marker.lat],
              label: marker.label,
            })),
            provinceNames: raw.mapData.provinceNames,
            historicalLocations: raw.mapData.historicalLocations,
          },
          focusGeometry: raw.mapData.focusGeometry?.center
            ? {
                center: [raw.mapData.focusGeometry.center.lng, raw.mapData.focusGeometry.center.lat],
                zoom: raw.mapData.focusGeometry.zoom ?? 8,
              }
            : undefined,
        }
      : undefined;

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

  /* Hỗ trợ cả format cũ (displayGeometry wrapper) và format mới (flat) */
  const rawDg = raw.mapData?.displayGeometry;
  const isNewMapFormat = raw.mapData && !rawDg && raw.mapData.geoType != null;
  const dg = rawDg ?? (isNewMapFormat
    ? {
        geoType: raw.mapData!.geoType,
        marker: raw.mapData!.marker ?? undefined,
        markers: raw.mapData!.markers ?? undefined,
        provinceNames: raw.mapData!.provinceNames,
        historicalLocations: raw.mapData!.historicalLocations,
      }
    : undefined
  );
  const fg = raw.mapData?.focusGeometry;
  const startYear = raw.chronology?.start?.year ?? 0;
  const endYear = raw.chronology?.end?.year;
  const rawGeoType = toGeoType(dg?.geoType ?? raw.mapData?.geoType);
  const markers = toMarkers(dg?.markers ?? (isNewMapFormat ? raw.mapData!.markers : undefined));

  // Coordinates: ưu tiên marker → focus center → fallback centroid của tỉnh đầu
  // tiên trong provinceNames. Fallback chỉ áp dụng cho event có gắn địa điểm
  // (≠ no_location), giúp các sự kiện chỉ liệt kê tỉnh vẫn zoom được trên map.
  let coordinates: { lat: number; lng: number } | undefined;
  let resolvedGeoType: GeoType = rawGeoType;
  const resolvedMarker = dg?.marker ?? (isNewMapFormat ? raw.mapData!.marker : undefined);
  const marker = toMarker(resolvedMarker);
  if (marker) {
    coordinates = { lat: marker.lat, lng: marker.lng };
  } else if (markers?.length) {
    coordinates = { lat: markers[0].lat, lng: markers[0].lng };
  } else if (fg?.center) {
    coordinates = { lat: fg.center.lat, lng: fg.center.lng };
  } else if (rawGeoType !== 'no_location') {
    const provinceNames = dg?.provinceNames ?? (isNewMapFormat ? raw.mapData!.provinceNames : undefined);
    const centroid = getCentroidFromProvinceNames(provinceNames);
    if (centroid) {
      coordinates = { lat: centroid.lat, lng: centroid.lng };
      // Đánh dấu là multi_region để CesiumMap zoom với altitude cao hơn (vì
      // marker này chỉ là centroid tỉnh, không phải vị trí chính xác)
    }
  }

  const event: HistoricalEvent = {
    id: raw.id,
    slug: raw.slug,
    eventLevel: raw.eventLevel,
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
    markers,
    primaryRegions: dg?.provinceNames ?? (isNewMapFormat ? raw.mapData!.provinceNames : undefined),
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
