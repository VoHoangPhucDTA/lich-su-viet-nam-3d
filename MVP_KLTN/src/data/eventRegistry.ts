/**
 * Event Registry – nạp toàn bộ JSON sự kiện trong `src/data/history_events/**`
 * và xây dựng các index để tra cứu nhanh.
 *
 * Đặt JSON trong `src/` thay vì `public/` để Vite có thể bundle qua
 * `import.meta.glob` mà không hiện cảnh báo "Assets in public directory
 * cannot be imported from JavaScript". Bundle size: ~250 file × ~2KB ≈ 500KB
 * raw, gzip xuống rất nhỏ – chấp nhận được cho 1 SPA bộ data tĩnh.
 */

/* ─── Raw JSON shape (đúng với những gì có trong `src/data/history_events/`) ─── */

export type RawEventLevel = 'collection' | 'atomic';
export type RawEventTypeId = 'military' | 'political' | 'economic' | 'cultural';

export interface RawDateField {
  year?: number;
  month?: number;
  day?: number;
}

export interface RawTextbookRef {
  grade: number | string;
  book: string;
  theme?: string;
  lesson?: string;
  pageStart?: number;
  pageEnd?: number;
  excerpt?: string;
}

export interface RawEventJson {
  id: string;
  slug?: string;
  entityType?: 'event';
  eventLevel?: RawEventLevel;

  titles?: {
    primary?: string;
    short?: string;
    alternatives?: string[];
  };

  classification?: {
    eventType?: RawEventTypeId;
    eventSubtype?: string;
    /** Tags có thể chứa cả số (e.g. năm 938) lẫn chuỗi */
    tags?: Array<string | number>;
  };

  coverage?: {
    grades?: number[];
  };

  chronology?: {
    start?: RawDateField;
    end?: RawDateField;
    datePrecision?: string;
    displayDate?: string;
    isApproximate?: boolean;
  };

  mapData?: {
    displayGeometry?: {
      geoType?: string;
      marker?: { lat: number; lng: number; label?: string };
      provinceNames?: string[];
      historicalLocations?: string[];
    };
    focusGeometry?: {
      mode?: string;
      center?: { lat: number; lng: number };
      zoom?: number;
      provinceNames?: string[];
    };
  };

  summary?: {
    homepageTitle?: string;
    homepageSummary?: string;
    cardSummary?: string;
  };

  textbookContent?: {
    canonicalSummary?: string;
    detailedNarrative?: string;
    significance?: string;
    keyFacts?: Array<string | number>;
  };

  /** Lưu ý: trong JSON thật, `textbookRefs` ở TOP-LEVEL chứ không lồng trong textbookContent */
  textbookRefs?: RawTextbookRef[];

  hierarchy?: {
    rootId?: string;
    parentId?: string;
    childIds?: string[];
    level?: number;
    orderInParent?: number;
  };

  associations?: {
    relatedEventIds?: string[];
    relatedFigureIds?: string[];
    predecessorEventIds?: string[];
    successorEventIds?: string[];
  };

  display?: {
    showOnHomepage?: boolean;
    showOnTimeline?: boolean;
    featured?: boolean;
  };

  sourcePolicy?: {
    canonicalSource?: string;
    /** JSON thật dùng dạng "wikipedia | wikidata" (string), không phải mảng */
    supplementalSources?: string;
  };

  notes?: string;
  merge?: unknown;
  validation?: unknown;
}

/* ─── Eager load tất cả JSON (Vite glob) ────────────────────────────────── */

const modules = import.meta.glob<RawEventJson>(
  './history_events/**/*.json',
  { eager: true, import: 'default' }
);

const eventsById = new Map<string, RawEventJson>();
const eventsBySlug = new Map<string, RawEventJson>();
const childIdsByParent = new Map<string, string[]>();

/** Merge 2 bản RawEventJson cùng id (1 sự kiện xuất hiện trong nhiều SGK).
 *  - coverage.grades : union
 *  - textbookRefs    : union (dedupe theo grade+book+pageStart)
 *  - các field text  : ưu tiên field non-empty của bản hiện có, bổ sung từ bản mới nếu trống
 */
function mergeRawEvents(existing: RawEventJson, incoming: RawEventJson): RawEventJson {
  const mergedGrades = Array.from(
    new Set([
      ...(existing.coverage?.grades ?? []),
      ...(incoming.coverage?.grades ?? []),
    ])
  ).sort((a, b) => a - b);

  const refKey = (r: RawTextbookRef) =>
    `${r.grade}|${r.book}|${r.pageStart ?? ''}|${r.lesson ?? ''}`;
  const refMap = new Map<string, RawTextbookRef>();
  for (const r of existing.textbookRefs ?? []) refMap.set(refKey(r), r);
  for (const r of incoming.textbookRefs ?? []) {
    if (!refMap.has(refKey(r))) refMap.set(refKey(r), r);
  }

  const tagSet = new Set<string | number>([
    ...(existing.classification?.tags ?? []),
    ...(incoming.classification?.tags ?? []),
  ]);

  const pickStr = (a?: string, b?: string) => (a && a.trim() ? a : b);
  const pickArr = <T>(a?: T[], b?: T[]) =>
    a && a.length > 0 ? a : b;

  return {
    ...existing,
    titles: {
      primary:
        pickStr(existing.titles?.primary, incoming.titles?.primary) ?? existing.id,
      short: pickStr(existing.titles?.short, incoming.titles?.short),
      alternatives: pickArr(
        existing.titles?.alternatives,
        incoming.titles?.alternatives
      ),
    },
    classification: {
      eventType:
        existing.classification?.eventType ?? incoming.classification?.eventType,
      eventSubtype:
        existing.classification?.eventSubtype ??
        incoming.classification?.eventSubtype,
      tags: tagSet.size > 0 ? Array.from(tagSet) : undefined,
    },
    coverage: { grades: mergedGrades },
    chronology: existing.chronology ?? incoming.chronology,
    mapData: existing.mapData?.displayGeometry?.marker
      ? existing.mapData
      : incoming.mapData ?? existing.mapData,
    summary: {
      homepageTitle: pickStr(
        existing.summary?.homepageTitle,
        incoming.summary?.homepageTitle
      ) ?? '',
      homepageSummary: pickStr(
        existing.summary?.homepageSummary,
        incoming.summary?.homepageSummary
      ) ?? '',
      cardSummary: pickStr(
        existing.summary?.cardSummary,
        incoming.summary?.cardSummary
      ) ?? '',
    },
    textbookContent: {
      canonicalSummary:
        pickStr(
          existing.textbookContent?.canonicalSummary,
          incoming.textbookContent?.canonicalSummary
        ) ?? '',
      detailedNarrative: pickStr(
        existing.textbookContent?.detailedNarrative,
        incoming.textbookContent?.detailedNarrative
      ),
      significance: pickStr(
        existing.textbookContent?.significance,
        incoming.textbookContent?.significance
      ),
      keyFacts: pickArr(
        existing.textbookContent?.keyFacts,
        incoming.textbookContent?.keyFacts
      ),
    },
    textbookRefs: refMap.size > 0 ? Array.from(refMap.values()) : undefined,
    hierarchy: existing.hierarchy ?? incoming.hierarchy,
    associations: existing.associations ?? incoming.associations,
    display: existing.display ?? incoming.display,
    sourcePolicy: existing.sourcePolicy ?? incoming.sourcePolicy,
  };
}

// Sort entries để thứ tự load deterministic, không phụ thuộc OS / tooling
const entries = Object.entries(modules).sort(([a], [b]) => a.localeCompare(b));

for (const [, raw] of entries) {
  if (!raw || typeof raw !== 'object' || !raw.id) continue;

  const existing = eventsById.get(raw.id);
  const merged = existing ? mergeRawEvents(existing, raw) : raw;
  eventsById.set(raw.id, merged);

  const slug = merged.slug;
  if (slug && slug !== merged.id) {
    eventsBySlug.set(slug, merged);
  }
}

/** Build childIds map: ưu tiên `hierarchy.childIds` đã khai báo,
 *  bổ sung bằng cách scan `hierarchy.parentId` của tất cả events. */
function buildChildIndex() {
  const merged = new Map<string, Set<string>>();

  for (const raw of eventsById.values()) {
    const declared = raw.hierarchy?.childIds ?? [];
    if (declared.length > 0) {
      const set = merged.get(raw.id) ?? new Set<string>();
      for (const cid of declared) set.add(cid);
      merged.set(raw.id, set);
    }
  }

  for (const raw of eventsById.values()) {
    const pid = raw.hierarchy?.parentId;
    if (!pid || pid === raw.id) continue;
    const set = merged.get(pid) ?? new Set<string>();
    set.add(raw.id);
    merged.set(pid, set);
  }

  for (const [pid, set] of merged) {
    const arr = Array.from(set).filter((cid) => eventsById.has(cid));
    arr.sort((a, b) => {
      const oa = eventsById.get(a)?.hierarchy?.orderInParent ?? 0;
      const ob = eventsById.get(b)?.hierarchy?.orderInParent ?? 0;
      if (oa !== ob) return oa - ob;
      return a.localeCompare(b);
    });
    childIdsByParent.set(pid, arr);
  }
}

buildChildIndex();

/* ─── Public API ────────────────────────────────────────────────────────── */

export function getRawEventById(id: string): RawEventJson | undefined {
  return eventsById.get(id);
}

export function getRawEventBySlug(slug: string): RawEventJson | undefined {
  return eventsBySlug.get(slug) ?? eventsById.get(slug);
}

export function findRawEventByIdOrSlug(key: string): RawEventJson | undefined {
  return eventsById.get(key) ?? eventsBySlug.get(key);
}

export function getChildIdsOf(id: string): string[] {
  return childIdsByParent.get(id) ?? [];
}

export function getAllRawEvents(): RawEventJson[] {
  return Array.from(eventsById.values());
}

/** Tổng số sự kiện đã load – tiện cho debug. */
export const RAW_EVENT_COUNT = eventsById.size;
