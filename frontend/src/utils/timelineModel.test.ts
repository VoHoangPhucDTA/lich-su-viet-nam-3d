import { describe, expect, it } from 'vitest';
import {
  buildTimelineRuntimeModel,
  getNearestTimelineYear,
  getNextTimelineYear,
  getPreviousTimelineYear,
  resolveTimelineYear,
} from './timelineModel';

describe('timeline runtime model', () => {
  it('normalizes the API dataset into one sorted, unique source of truth', () => {
    expect(buildTimelineRuntimeModel([1010, 40, 938, 40, Number.NaN, 938.5])).toEqual({
      years: [40, 938, 1010],
      minYear: 40,
      maxYear: 1010,
    });
    expect(buildTimelineRuntimeModel([])).toBeNull();
  });

  it('drives first, last, nearest, previous and next from the same model', () => {
    const model = buildTimelineRuntimeModel([40, 41, 43, 938]);
    expect(model).not.toBeNull();
    if (!model) return;

    expect(model.minYear).toBe(40);
    expect(model.maxYear).toBe(938);
    expect(getPreviousTimelineYear(model, 40)).toBeNull();
    expect(getPreviousTimelineYear(model, 43)).toBe(41);
    expect(getNextTimelineYear(model, 41)).toBe(43);
    expect(getNextTimelineYear(model, 938)).toBeNull();
    expect(getNearestTimelineYear(model, 42)).toBe(41);
    expect(resolveTimelineYear(model, 43)).toBe(43);
    expect(resolveTimelineYear(model, 500)).toBe(938);
  });

  it('reflects an API dataset update without retaining legacy years', () => {
    const before = buildTimelineRuntimeModel([40, 938]);
    const after = buildTimelineRuntimeModel([41, 42, 43]);
    expect(before?.years).toEqual([40, 938]);
    expect(after?.years).toEqual([41, 42, 43]);
    expect(after && resolveTimelineYear(after, 40)).toBe(41);
    expect(after && resolveTimelineYear(after, 938)).toBe(43);
  });
});
