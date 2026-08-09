import { describe, expect, it } from 'vitest';
import type { HistoricalEvent } from '../types/event';
import {
  buildMapFocusCameraFrame,
  MAP_MULTI_POINT_MINIMUM_RANGE_METERS,
  MAP_POINT_FOCUS_RANGE_METERS,
} from './mapCameraFocus';

function event(overrides: Partial<HistoricalEvent>): HistoricalEvent {
  return {
    id: 'focus-event',
    name: 'Focus event',
    description: '',
    startYear: 1954,
    endYear: 1954,
    effectiveEndYear: 1954,
    eventType: 'military',
    geoType: 'point',
    coordinates: { lat: 21.386, lng: 103.023 },
    parentId: null,
    ...overrides,
  };
}

describe('CesiumMap ordinary selection focus', () => {
  it('uses the representative point at the 50 km map-focus range', () => {
    const frame = buildMapFocusCameraFrame(event({}));

    expect(frame?.positions).toEqual([{ lat: 21.386, lng: 103.023 }]);
    expect(frame?.range).toBe(MAP_POINT_FOCUS_RANGE_METERS);
    expect(frame?.range).toBeGreaterThanOrEqual(30_000);
    expect(frame?.range).toBeLessThanOrEqual(80_000);
  });

  it('fits every valid canonical multi-point marker with a bounded minimum range', () => {
    const markers = [
      { name: 'Him Lam', lat: 21.417, lng: 103.043 },
      { name: 'Độc Lập', lat: 21.458, lng: 103.002 },
      { name: 'A1', lat: 21.379, lng: 103.018 },
      { name: 'Mường Thanh', lat: 21.386, lng: 103.015 },
      { name: 'invalid', lat: 999, lng: 103 },
    ];
    const frame = buildMapFocusCameraFrame(event({
      geoType: 'multi_point',
      sourceMapData: { geoType: 'multi_point', markers },
    }));

    expect(frame?.positions).toEqual(markers.slice(0, 4).map(({ lat, lng }) => ({ lat, lng })));
    expect(frame?.sphere.radius).toBeGreaterThan(0);
    expect(frame?.range).toBeGreaterThanOrEqual(MAP_MULTI_POINT_MINIMUM_RANGE_METERS);
  });

  it('does not fake a point focus for region-only or non-locatable geography', () => {
    expect(buildMapFocusCameraFrame(event({ geoType: 'multi_polygon' }))).toBeNull();
    expect(buildMapFocusCameraFrame(event({ geoType: 'nationwide' }))).toBeNull();
    expect(buildMapFocusCameraFrame(event({ geoType: 'no_location' }))).toBeNull();
  });
});
