import { describe, expect, it } from 'vitest';
import { buildTimelineRuntimeModel, resolveTimelineYear } from './timelineModel';
import {
  resolveTimelinePresentation,
  TIMELINE_LABEL_MIN_GAP_PX,
} from './timelinePresentation';

const anchors = [-2000, -700, 40, 938, 1945, 1975, 2000];

describe('resolveTimelinePresentation', () => {
  it('keeps dense 1945–1975 data in one deterministic lane', () => {
    const years = Array.from({ length: 31 }, (_, index) => 1945 + index);
    const result = resolveTimelinePresentation({
      availableYears: years,
      anchors,
      selectedYear: 1954,
      containerWidthPx: 640,
    });

    expect(result.laneCount).toBe(1);
    expect(result.ticks).toHaveLength(31);
    expect(result.labels.some((label) => label.year === 1954 && label.kind === 'selected')).toBe(true);
    expect(result.labels.length).toBeLessThanOrEqual(5);
    for (let index = 1; index < result.labels.length; index += 1) {
      const previous = result.labels[index - 1].positionPercent * 6.4;
      const current = result.labels[index].positionPercent * 6.4;
      expect(current - previous).toBeGreaterThanOrEqual(TIMELINE_LABEL_MIN_GAP_PX);
    }
  });

  it('keeps sparse ancient and modern data in one lane with runtime bounds', () => {
    const result = resolveTimelinePresentation({
      availableYears: [-700, 40, 938, 2016],
      anchors,
      selectedYear: 938,
      containerWidthPx: 960,
    });

    expect(result.domain).toEqual({ min: -700, max: 2016 });
    expect(result.laneCount).toBe(1);
    expect(result.ticks.map((tick) => tick.year)).toEqual([-700, 40, 938, 2016]);
  });

  it('retains the selected year when it collides with a historical anchor', () => {
    const result = resolveTimelinePresentation({
      availableYears: [1945, 1946, 1975],
      anchors: [1945, 1975],
      selectedYear: 1946,
      containerWidthPx: 300,
    });

    expect(result.labels).toContainEqual(expect.objectContaining({ year: 1946, kind: 'selected' }));
    expect(result.labels).not.toContainEqual(expect.objectContaining({ year: 1945 }));
  });

  it.each([1920, 1366, 1280, 390])(
    'prioritizes selected, then runtime endpoints, then anchors at %spx',
    (containerWidthPx) => {
      const result = resolveTimelinePresentation({
        availableYears: [-500, 1000, 2023],
        anchors: [-450, 938, 1975],
        selectedYear: 1000,
        containerWidthPx,
      });
      const years = result.labels.map((label) => label.year);

      expect(result.laneCount).toBe(1);
      expect(result.labels.length).toBeLessThanOrEqual(containerWidthPx < 480 ? 4 : 7);
      expect(result.labels).toContainEqual(expect.objectContaining({
        year: 1000,
        kind: 'selected',
      }));
      expect(years).toContain(-500);
      expect(years).toContain(2023);
      expect(years).not.toContain(-450);
      expect(years).not.toContain(1975);

      for (let index = 1; index < result.labels.length; index += 1) {
        const previous = result.labels[index - 1].positionPercent * containerWidthPx / 100;
        const current = result.labels[index].positionPercent * containerWidthPx / 100;
        expect(current - previous).toBeGreaterThanOrEqual(TIMELINE_LABEL_MIN_GAP_PX);
      }
    },
  );

  it('caps common desktop density while retaining priority and removing near-duplicates', () => {
    const result = resolveTimelinePresentation({
      availableYears: [-500, 40, 500, 900, 938, 1010, 1428, 1789, 1858, 1945, 1954, 1975, 2000, 2023],
      anchors: [-500, 40, 500, 938, 1010, 1428, 1789, 1858, 1945, 1975, 2000],
      selectedYear: 1954,
      containerWidthPx: 1366,
    });

    expect(result.labels).toHaveLength(7);
    expect(result.labels).toContainEqual(expect.objectContaining({ year: 1954, kind: 'selected' }));
    for (let index = 1; index < result.labels.length; index += 1) {
      const previous = result.labels[index - 1].positionPercent * 13.66;
      const current = result.labels[index].positionPercent * 13.66;
      expect(current - previous).toBeGreaterThanOrEqual(TIMELINE_LABEL_MIN_GAP_PX);
    }
  });

  it('handles an empty year list safely', () => {
    expect(resolveTimelinePresentation({
      availableYears: [],
      anchors,
      selectedYear: null,
      containerWidthPx: 0,
    })).toEqual({ domain: null, labels: [], ticks: [], laneCount: 1 });
  });

  it('handles one available year without division by zero', () => {
    const result = resolveTimelinePresentation({
      availableYears: [938],
      anchors,
      selectedYear: 938,
      containerWidthPx: 640,
    });
    expect(result.domain).toEqual({ min: 938, max: 938 });
    expect(result.labels).toEqual([
      expect.objectContaining({ year: 938, kind: 'selected', positionPercent: 50 }),
    ]);
    expect(result.ticks).toEqual([{ year: 938, positionPercent: 50 }]);
  });

  it('omits anchors outside the runtime domain instead of clamping them', () => {
    const result = resolveTimelinePresentation({
      availableYears: [1945, 1975],
      anchors: [-2000, 1945, 1975, 2000],
      selectedYear: 1945,
      containerWidthPx: 640,
    });
    expect(result.labels.map((label) => label.year)).not.toContain(-2000);
    expect(result.labels.map((label) => label.year)).not.toContain(2000);
  });

  it('reconciles a grade/domain change to the nearest available year', () => {
    const model = buildTimelineRuntimeModel([1945, 1975]);
    expect(model && resolveTimelineYear(model, 1950)).toBe(1945);
  });
});
