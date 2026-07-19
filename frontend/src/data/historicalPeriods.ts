import type { EventType, HistoricalEvent } from '../types/event';

export type HistoricalPeriodId =
  | 'ancient'
  | 'feudal'
  | 'colonial'
  | 'modern'
  | 'contemporary';

export interface HistoricalPeriod {
  id: HistoricalPeriodId;
  label: string;
  shortLabel: string;
  description: string;
  startYearInclusive?: number;
  endYearExclusive?: number;
  thumbnail?: string;
  fallbackEventType: EventType;
}

export interface HistoricalPeriodRange {
  startYearFrom?: number;
  startYearTo?: number;
}

export const HISTORICAL_PERIODS: HistoricalPeriod[] = [
  {
    id: 'ancient',
    label: 'Thời kỳ cổ đại',
    shortLabel: 'Cổ đại',
    description: 'Từ buổi đầu dựng nước đến trước năm 938.',
    endYearExclusive: 938,
    thumbnail: '/event-titles/hung-vuong.jpg',
    fallbackEventType: 'cultural',
  },
  {
    id: 'feudal',
    label: 'Thời kỳ phong kiến',
    shortLabel: 'Phong kiến',
    description: 'Từ chiến thắng Bạch Đằng năm 938 đến trước năm 1858.',
    startYearInclusive: 938,
    endYearExclusive: 1858,
    thumbnail: '/event-titles/bach-dang-938.jpg',
    fallbackEventType: 'political',
  },
  {
    id: 'colonial',
    label: 'Thời kỳ cận đại',
    shortLabel: 'Cận đại',
    description: 'Từ năm 1858 đến trước Cách mạng Tháng Tám năm 1945.',
    startYearInclusive: 1858,
    endYearExclusive: 1945,
    thumbnail: '/vietnam_heritage_hero.jpg',
    fallbackEventType: 'military',
  },
  {
    id: 'modern',
    label: 'Thời kỳ hiện đại',
    shortLabel: 'Hiện đại',
    description: 'Từ năm 1945 đến trước năm 1975.',
    startYearInclusive: 1945,
    endYearExclusive: 1975,
    thumbnail: '/event-titles/tuyen-ngon-doc-lap-1945.jpg',
    fallbackEventType: 'political',
  },
  {
    id: 'contemporary',
    label: 'Thời kỳ đương đại',
    shortLabel: 'Đương đại',
    description: 'Từ năm 1975 đến nay.',
    startYearInclusive: 1975,
    thumbnail: '/vietnam_heritage_hero.jpg',
    fallbackEventType: 'economic',
  },
];

export function getHistoricalPeriodById(id: string | null | undefined): HistoricalPeriod | undefined {
  return HISTORICAL_PERIODS.find((period) => period.id === id);
}

export function getHistoricalPeriodRange(id: string | null | undefined): HistoricalPeriodRange | undefined {
  const period = getHistoricalPeriodById(id);
  if (!period) return undefined;
  return {
    startYearFrom: period.startYearInclusive,
    startYearTo: period.endYearExclusive,
  };
}

export function getPeriodQueryRange(id: string | null | undefined): HistoricalPeriodRange | undefined {
  return getHistoricalPeriodRange(id);
}

export function isEventInHistoricalPeriod(
  event: Pick<HistoricalEvent, 'startYear'> | { start_year?: number | null },
  periodId: string | null | undefined
): boolean {
  const period = getHistoricalPeriodById(periodId);
  const startYear = 'startYear' in event ? event.startYear : event.start_year;
  if (!period || startYear == null || !Number.isFinite(startYear)) return false;
  return (
    (period.startYearInclusive == null || startYear >= period.startYearInclusive) &&
    (period.endYearExclusive == null || startYear < period.endYearExclusive)
  );
}

export function intersectHistoricalPeriodRanges(
  base: HistoricalPeriodRange,
  extra: HistoricalPeriodRange
): HistoricalPeriodRange | null {
  const startYearFrom = Math.max(
    base.startYearFrom ?? Number.NEGATIVE_INFINITY,
    extra.startYearFrom ?? Number.NEGATIVE_INFINITY
  );
  const startYearTo = Math.min(
    base.startYearTo ?? Number.POSITIVE_INFINITY,
    extra.startYearTo ?? Number.POSITIVE_INFINITY
  );
  if (startYearFrom >= startYearTo) return null;
  return {
    startYearFrom: Number.isFinite(startYearFrom) ? startYearFrom : undefined,
    startYearTo: Number.isFinite(startYearTo) ? startYearTo : undefined,
  };
}
