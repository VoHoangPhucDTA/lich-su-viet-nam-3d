import type { HistoricalEvent } from '../types/event';

export const UNKNOWN_DATE_LABEL = 'Không rõ';
export const UNDATED_CONTEXT_GROUP_LABEL = 'Không rõ / theo ngữ cảnh';

export interface ChronologySource {
  startYear?: number | null;
  endYear?: number | null;
  effectiveEndYear?: number | null;
  displayDate?: string | null;
}

export interface NormalizedChronology {
  startYear: number | null;
  endYear: number | null;
  effectiveEndYear: number | null;
  displayDate: string;
}

export interface NumericRangeFilter {
  year?: number | null;
  fromYear?: number | null;
  toYear?: number | null;
}

export function normalizeYear(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function deriveEffectiveEndYear(source: ChronologySource): number | null {
  return (
    normalizeYear(source.effectiveEndYear) ??
    normalizeYear(source.endYear) ??
    normalizeYear(source.startYear)
  );
}

export function normalizeChronology(source: ChronologySource): NormalizedChronology {
  const startYear = normalizeYear(source.startYear);
  const endYear = normalizeYear(source.endYear);
  const effectiveEndYear = deriveEffectiveEndYear({ ...source, startYear, endYear });
  const displayDate = source.displayDate?.trim() || formatChronologyLabel({ startYear, endYear });

  return {
    startYear,
    endYear,
    effectiveEndYear,
    displayDate,
  };
}

export function formatYearLabel(year: number): string {
  return year < 0 ? `${Math.abs(year)} TCN` : String(year);
}

export function formatChronologyLabel(source: ChronologySource): string {
  const displayDate = source.displayDate?.trim();
  if (displayDate) return displayDate;

  const startYear = normalizeYear(source.startYear);
  const endYear = normalizeYear(source.endYear);
  if (startYear == null) return UNKNOWN_DATE_LABEL;
  if (endYear != null && endYear !== startYear) {
    return `${formatYearLabel(startYear)} – ${formatYearLabel(endYear)}`;
  }
  return formatYearLabel(startYear);
}

export function participatesInNumericChronology(source: ChronologySource): boolean {
  return normalizeYear(source.startYear) != null && deriveEffectiveEndYear(source) != null;
}

export function matchesNumericFilter(source: ChronologySource, filter: NumericRangeFilter): boolean {
  const startYear = normalizeYear(source.startYear);
  const effectiveEndYear = deriveEffectiveEndYear(source);
  if (startYear == null || effectiveEndYear == null) return false;

  if (filter.year != null) {
    return startYear <= filter.year && effectiveEndYear >= filter.year;
  }
  if (filter.fromYear != null && effectiveEndYear < filter.fromYear) return false;
  if (filter.toYear != null && startYear > filter.toYear) return false;
  return filter.fromYear != null || filter.toYear != null;
}

export function compareChronologyS1(a: HistoricalEvent, b: HistoricalEvent): number {
  const aUndated = a.startYear == null ? 1 : 0;
  const bUndated = b.startYear == null ? 1 : 0;
  if (aUndated !== bUndated) return aUndated - bUndated;

  if (a.startYear != null && b.startYear != null && a.startYear !== b.startYear) {
    return a.startYear - b.startYear;
  }

  return (
    (a.orderInParent ?? 0) - (b.orderInParent ?? 0) ||
    a.name.localeCompare(b.name, 'vi') ||
    a.id.localeCompare(b.id)
  );
}

export function compareChronologyS1Descending(a: HistoricalEvent, b: HistoricalEvent): number {
  const aUndated = a.startYear == null ? 1 : 0;
  const bUndated = b.startYear == null ? 1 : 0;
  if (aUndated !== bUndated) return aUndated - bUndated;

  if (a.startYear != null && b.startYear != null && a.startYear !== b.startYear) {
    return b.startYear - a.startYear;
  }

  return (
    (a.orderInParent ?? 0) - (b.orderInParent ?? 0) ||
    a.name.localeCompare(b.name, 'vi') ||
    a.id.localeCompare(b.id)
  );
}

export function compareHierarchyChronology(a: HistoricalEvent, b: HistoricalEvent): number {
  return (
    (a.orderInParent ?? 0) - (b.orderInParent ?? 0) ||
    compareChronologyS1(a, b)
  );
}

export function timelineYearsFromEvents(events: ChronologySource[]): number[] {
  const years = new Set<number>();
  for (const event of events) {
    const startYear = normalizeYear(event.startYear);
    if (startYear != null) years.add(startYear);
  }
  return Array.from(years).sort((a, b) => a - b);
}

export function splitDatedAndUndated(events: HistoricalEvent[]): {
  dated: HistoricalEvent[];
  undated: HistoricalEvent[];
} {
  return {
    dated: events.filter((event) => event.startYear != null),
    undated: events
      .filter((event) => event.startYear == null)
      .sort(compareHierarchyChronology),
  };
}
