export interface TimelineRuntimeModel {
  years: number[];
  minYear: number;
  maxYear: number;
}

export function buildTimelineRuntimeModel(sourceYears: readonly number[]): TimelineRuntimeModel | null {
  const years = Array.from(
    new Set(sourceYears.filter((year) => Number.isFinite(year) && Number.isInteger(year))),
  ).sort((a, b) => a - b);

  if (years.length === 0) return null;

  return {
    years,
    minYear: years[0],
    maxYear: years[years.length - 1],
  };
}

export function getPreviousTimelineYear(
  model: TimelineRuntimeModel,
  year: number,
): number | null {
  for (let index = model.years.length - 1; index >= 0; index -= 1) {
    if (model.years[index] < year) return model.years[index];
  }
  return null;
}

export function getNextTimelineYear(
  model: TimelineRuntimeModel,
  year: number,
): number | null {
  for (const candidate of model.years) {
    if (candidate > year) return candidate;
  }
  return null;
}

export function getNearestTimelineYear(
  model: TimelineRuntimeModel,
  year: number,
): number {
  if (year <= model.minYear) return model.minYear;
  if (year >= model.maxYear) return model.maxYear;

  const previous = getPreviousTimelineYear(model, year);
  const next = getNextTimelineYear(model, year);
  if (previous == null) return next ?? model.minYear;
  if (next == null) return previous;

  return year - previous <= next - year ? previous : next;
}

export function resolveTimelineYear(
  model: TimelineRuntimeModel,
  requestedYear: number,
): number {
  return model.years.includes(requestedYear)
    ? requestedYear
    : getNearestTimelineYear(model, requestedYear);
}
