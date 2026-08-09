export const TIMELINE_LABEL_MIN_GAP_PX = 56;
export const TIMELINE_FALLBACK_WIDTH_PX = 960;

export type TimelineLabelKind = 'selected' | 'anchor' | 'available';

export interface TimelinePresentationLabel {
  year: number;
  kind: TimelineLabelKind;
  priority: number;
  positionPercent: number;
}

export interface TimelinePresentationTick {
  year: number;
  positionPercent: number;
}

export interface TimelinePresentation {
  domain: { min: number; max: number } | null;
  labels: TimelinePresentationLabel[];
  ticks: TimelinePresentationTick[];
  laneCount: 1;
}

interface ResolveTimelinePresentationInput {
  availableYears: readonly number[];
  anchors: readonly number[];
  selectedYear: number | null;
  containerWidthPx: number;
}

function normalizeYears(years: readonly number[]): number[] {
  return Array.from(
    new Set(years.filter((year) => Number.isFinite(year) && Number.isInteger(year))),
  ).sort((a, b) => a - b);
}

export function resolveTimelinePresentation({
  availableYears,
  anchors,
  selectedYear,
  containerWidthPx,
}: ResolveTimelinePresentationInput): TimelinePresentation {
  const years = normalizeYears(availableYears);
  if (years.length === 0) {
    return { domain: null, labels: [], ticks: [], laneCount: 1 };
  }

  const min = years[0];
  const max = years[years.length - 1];
  const range = max - min;
  const width = Math.max(1, containerWidthPx || TIMELINE_FALLBACK_WIDTH_PX);
  const positionPercent = (year: number) => range === 0 ? 50 : ((year - min) / range) * 100;
  const positionPx = (year: number) => (positionPercent(year) / 100) * width;

  const activeAnchors = normalizeYears(anchors).filter((year) => year >= min && year <= max);
  const candidates = new Map<number, TimelinePresentationLabel>();

  for (const year of activeAnchors) {
    candidates.set(year, { year, kind: 'anchor', priority: 1, positionPercent: positionPercent(year) });
  }
  // Runtime endpoints orient the track and outrank decorative historical anchors.
  for (const year of new Set([min, max])) {
    candidates.set(year, { year, kind: 'available', priority: 2, positionPercent: positionPercent(year) });
  }
  if (selectedYear != null && selectedYear >= min && selectedYear <= max) {
    candidates.set(selectedYear, {
      year: selectedYear,
      kind: 'selected',
      priority: 3,
      positionPercent: positionPercent(selectedYear),
    });
  }

  const accepted: TimelinePresentationLabel[] = [];
  const prioritized = [...candidates.values()].sort(
    (a, b) => b.priority - a.priority || a.year - b.year,
  );
  for (const candidate of prioritized) {
    if (accepted.every((label) => (
      Math.abs(positionPx(candidate.year) - positionPx(label.year)) >= TIMELINE_LABEL_MIN_GAP_PX
    ))) {
      accepted.push(candidate);
    }
  }

  return {
    domain: { min, max },
    labels: accepted.sort((a, b) => a.year - b.year),
    ticks: years.map((year) => ({ year, positionPercent: positionPercent(year) })),
    laneCount: 1,
  };
}
