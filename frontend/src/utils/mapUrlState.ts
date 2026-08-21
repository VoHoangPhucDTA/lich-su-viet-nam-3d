import type { EventType } from '../types/event';

const EVENT_TYPES: readonly EventType[] = [
  'military',
  'political',
  'economic',
  'cultural',
];

export interface MapUrlState {
  year: number | null;
  event: string;
  query: string;
  category: EventType | null;
  grade: number | null;
}

export function parseExactYearInput(value: string | null | undefined): number | null {
  if (value == null) return null;
  const normalized = value.trim();
  if (!/^[+-]?\d+$/u.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function integerParam(value: string | null): number | null {
  return parseExactYearInput(value);
}

function gradeParam(value: string | null): number | null {
  const grade = integerParam(value);
  return grade === 10 || grade === 11 || grade === 12 ? grade : null;
}

export function parseMapUrlState(search: string): MapUrlState {
  const params = new URLSearchParams(search);
  const categoryValue = params.get('category');
  return {
    year: integerParam(params.get('year')),
    event: params.get('event')?.trim() ?? '',
    query: params.get('q')?.trim() ?? '',
    category: EVENT_TYPES.includes(categoryValue as EventType)
      ? categoryValue as EventType
      : null,
    grade: gradeParam(params.get('grade')),
  };
}

export function serializeMapUrlState(state: MapUrlState): string {
  const params = new URLSearchParams();
  if (state.year != null) params.set('year', String(state.year));
  if (state.event.trim()) params.set('event', state.event.trim());
  if (state.query.trim()) params.set('q', state.query.trim());
  if (state.category) params.set('category', state.category);
  if (state.grade === 10 || state.grade === 11 || state.grade === 12) {
    params.set('grade', String(state.grade));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}
