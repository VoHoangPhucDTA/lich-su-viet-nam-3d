/**
 * Events data layer
 *
 * Trước đây file này chứa mock array `HISTORICAL_EVENTS` cứng. Giờ chúng ta
 * derive toàn bộ data trực tiếp từ bộ JSON thực ở `src/data/history_events/`
 * thông qua `eventRegistry`.
 *
 * Public API giữ NGUYÊN để các trang Map / Timeline không bị gãy:
 *   - HISTORICAL_EVENTS : root events (parentId == null) kèm cây children
 *   - getAllEvents()    : tất cả events (kèm children) ở dạng phẳng
 *   - getRootEvents()   : alias của HISTORICAL_EVENTS
 *   - findEventById()   : tra cứu theo id (kèm children)
 *   - getEventsByYear() : lọc root events trùng năm
 *   - TIMELINE_MIN_YEAR / TIMELINE_MAX_YEAR
 */

import type { HistoricalEvent } from '../types/event';
import { getAllRawEvents, getRawEventById } from './eventRegistry';
import { rawToHistoricalEvent } from './eventAdapter';

/* ─── Build full tree once, then index ─────────────────────────────────── */

const allRaws = getAllRawEvents();

/** Mọi event ở dạng phẳng, KÈM children được lồng đầy đủ. Cache để tránh
 *  rebuild nested tree mỗi lần gọi findEventById. */
const eventByIdCache = new Map<string, HistoricalEvent>();
for (const raw of allRaws) {
  eventByIdCache.set(raw.id, rawToHistoricalEvent(raw, { withChildren: true }));
}

/** Root events: những event không có parentId. */
export const HISTORICAL_EVENTS: HistoricalEvent[] = allRaws
  .filter((raw) => !raw.hierarchy?.parentId)
  .map((raw) => eventByIdCache.get(raw.id)!)
  .filter(Boolean);

/* ─── Public API ────────────────────────────────────────────────────────── */

export function getAllEvents(): HistoricalEvent[] {
  return Array.from(eventByIdCache.values());
}

export function getRootEvents(): HistoricalEvent[] {
  return HISTORICAL_EVENTS;
}

export function findEventById(id: string): HistoricalEvent | undefined {
  if (eventByIdCache.has(id)) return eventByIdCache.get(id);
  // Fallback: thử tra cứu qua registry rồi build (trường hợp slug != id)
  const raw = getRawEventById(id);
  if (!raw) return undefined;
  const built = rawToHistoricalEvent(raw, { withChildren: true });
  eventByIdCache.set(id, built);
  return built;
}

export function getEventsByYear(year: number): HistoricalEvent[] {
  return HISTORICAL_EVENTS.filter((e) => {
    const endYear = e.endYear ?? e.startYear;
    return e.startYear <= year && endYear >= year;
  });
}

/* ─── Timeline range tự động tính từ data thật ──────────────────────────── */

const allYears: number[] = [];
for (const raw of allRaws) {
  const sy = raw.chronology?.start?.year;
  const ey = raw.chronology?.end?.year;
  if (typeof sy === 'number' && Number.isFinite(sy)) allYears.push(sy);
  if (typeof ey === 'number' && Number.isFinite(ey)) allYears.push(ey);
}

export const TIMELINE_MIN_YEAR =
  allYears.length > 0 ? Math.min(...allYears) : 0;
export const TIMELINE_MAX_YEAR =
  allYears.length > 0 ? Math.max(...allYears) : new Date().getFullYear();

/* ─── Danh sách năm có sự kiện (sorted, unique) – dùng cho timeline jump ── */

/**
 * Tất cả các năm START có sự kiện được hiển thị trên timeline (lọc theo
 * `display.showOnTimeline`). Sorted tăng dần, unique. Dùng cho 2 nút "Sự
 * kiện trước / sau" trên Timeline.
 */
export const EVENT_YEARS_SORTED: number[] = (() => {
  const set = new Set<number>();
  for (const raw of allRaws) {
    if (raw.display?.showOnTimeline === false) continue;
    const sy = raw.chronology?.start?.year;
    if (typeof sy === 'number' && Number.isFinite(sy)) set.add(sy);
  }
  return Array.from(set).sort((a, b) => a - b);
})();

/**
 * Tìm năm có sự kiện gần nhất theo hướng `direction`.
 *  - direction = 'prev' → năm sự kiện gần nhất NHỎ HƠN `year`
 *  - direction = 'next' → năm sự kiện gần nhất LỚN HƠN `year`
 *
 * Trả về `null` nếu không còn sự kiện theo hướng đó.
 */
export function getNearestEventYear(
  year: number,
  direction: 'prev' | 'next'
): number | null {
  if (EVENT_YEARS_SORTED.length === 0) return null;
  if (direction === 'prev') {
    let result: number | null = null;
    for (let i = EVENT_YEARS_SORTED.length - 1; i >= 0; i--) {
      if (EVENT_YEARS_SORTED[i] < year) {
        result = EVENT_YEARS_SORTED[i];
        break;
      }
    }
    return result;
  } else {
    for (let i = 0; i < EVENT_YEARS_SORTED.length; i++) {
      if (EVENT_YEARS_SORTED[i] > year) return EVENT_YEARS_SORTED[i];
    }
    return null;
  }
}
