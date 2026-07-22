import { describe, expect, it } from 'vitest';
import {
  INITIAL_TERRAIN_DISTANCE_MEASUREMENT,
  calculateGeodesicDistanceMeters,
  formatReferenceDistance,
  normalizeLongitudeDegrees,
  terrainDistanceMeasurementReducer,
  type TerrainMeasurementPoint,
} from './terrainMeasurement';

const pointA: TerrainMeasurementPoint = {
  latitude: 10,
  longitude: 106,
  terrainHeightMeters: 12,
};

const pointB: TerrainMeasurementPoint = {
  latitude: 10.01,
  longitude: 106.02,
  terrainHeightMeters: 812,
};

describe('calculateGeodesicDistanceMeters', () => {
  it('returns zero for the same coordinate', () => {
    expect(calculateGeodesicDistanceMeters(pointA, pointA)).toBe(0);
  });

  it('returns a finite short distance', () => {
    const distance = calculateGeodesicDistanceMeters(pointA, pointB);
    expect(distance).toBeGreaterThan(2000);
    expect(distance).toBeLessThan(3000);
    expect(Number.isFinite(distance)).toBe(true);
  });

  it('returns a finite long distance', () => {
    const distance = calculateGeodesicDistanceMeters(
      { latitude: 21.0285, longitude: 105.8542 },
      { latitude: 10.8231, longitude: 106.6297 },
    );
    expect(distance).toBeGreaterThan(1_000_000);
    expect(Number.isFinite(distance)).toBe(true);
  });

  it('uses the short path across the 180-degree meridian', () => {
    const distance = calculateGeodesicDistanceMeters(
      { latitude: 0, longitude: 179.9 },
      { latitude: 0, longitude: -179.9 },
    );
    expect(distance).toBeGreaterThan(20_000);
    expect(distance).toBeLessThan(25_000);
  });

  it('normalizes finite longitude values', () => {
    expect(normalizeLongitudeDegrees(190)).toBe(-170);
    expect(normalizeLongitudeDegrees(-190)).toBe(170);
    expect(calculateGeodesicDistanceMeters(
      { latitude: 0, longitude: 190 },
      { latitude: 0, longitude: -170 },
    )).toBe(0);
  });

  it.each([-90.1, 90.1])('rejects invalid latitude %s', (latitude) => {
    expect(() => calculateGeodesicDistanceMeters(
      { latitude, longitude: 0 },
      { latitude: 0, longitude: 0 },
    )).toThrow(RangeError);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite longitude %s',
    (longitude) => {
      expect(() => calculateGeodesicDistanceMeters(
        { latitude: 0, longitude },
        { latitude: 0, longitude: 0 },
      )).toThrow(RangeError);
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite latitude %s',
    (latitude) => {
      expect(() => calculateGeodesicDistanceMeters(
        { latitude, longitude: 0 },
        { latitude: 0, longitude: 0 },
      )).toThrow(RangeError);
    },
  );

  it('does not use height in the geodesic result', () => {
    const low = calculateGeodesicDistanceMeters(pointA, pointB);
    const highStart: TerrainMeasurementPoint = {
      ...pointA,
      terrainHeightMeters: 10_000,
    };
    const highEnd: TerrainMeasurementPoint = {
      ...pointB,
      terrainHeightMeters: -500,
    };
    const high = calculateGeodesicDistanceMeters(highStart, highEnd);
    expect(high).toBeCloseTo(low, 8);
  });
});

describe('formatReferenceDistance', () => {
  it('formats distances below one kilometre in metres', () => {
    expect(formatReferenceDistance(684.6)).toBe('685 m');
  });

  it('formats distances from one kilometre in kilometres', () => {
    expect(formatReferenceDistance(2450)).toBe('2,45 km');
  });
});

describe('terrainDistanceMeasurementReducer', () => {
  it('runs activate, point A and point B through the required phases', () => {
    const active = terrainDistanceMeasurementReducer(
      INITIAL_TERRAIN_DISTANCE_MEASUREMENT,
      { type: 'ACTIVATE', sessionId: 1 },
    );
    expect(active.phase).toBe('waiting-for-start');

    const withStart = terrainDistanceMeasurementReducer(active, {
      type: 'CAPTURE_POINT', sessionId: 1, point: pointA,
    });
    expect(withStart.phase).toBe('waiting-for-end');
    expect(withStart.start).toEqual(pointA);

    const complete = terrainDistanceMeasurementReducer(withStart, {
      type: 'CAPTURE_POINT', sessionId: 1, point: pointB,
    });
    expect(complete.phase).toBe('complete');
    expect(complete.end).toEqual(pointB);
    expect(complete.distanceMeters).toBeGreaterThan(0);
  });

  it('ignores a third click until the user explicitly resets', () => {
    const active = terrainDistanceMeasurementReducer(
      INITIAL_TERRAIN_DISTANCE_MEASUREMENT,
      { type: 'ACTIVATE', sessionId: 2 },
    );
    const withStart = terrainDistanceMeasurementReducer(active, {
      type: 'CAPTURE_POINT', sessionId: 2, point: pointA,
    });
    const complete = terrainDistanceMeasurementReducer(withStart, {
      type: 'CAPTURE_POINT', sessionId: 2, point: pointB,
    });
    expect(terrainDistanceMeasurementReducer(complete, {
      type: 'CAPTURE_POINT',
      sessionId: 2,
      point: { ...pointB, longitude: 107 },
    })).toBe(complete);
  });

  it('resets and deactivates deterministically', () => {
    const active = terrainDistanceMeasurementReducer(
      INITIAL_TERRAIN_DISTANCE_MEASUREMENT,
      { type: 'ACTIVATE', sessionId: 3 },
    );
    const withStart = terrainDistanceMeasurementReducer(active, {
      type: 'CAPTURE_POINT', sessionId: 3, point: pointA,
    });
    const reset = terrainDistanceMeasurementReducer(withStart, {
      type: 'RESET', sessionId: 4,
    });
    expect(reset).toMatchObject({
      phase: 'waiting-for-start',
      sessionId: 4,
      start: null,
      end: null,
      distanceMeters: null,
    });
    expect(terrainDistanceMeasurementReducer(reset, { type: 'DEACTIVATE' }))
      .toEqual(INITIAL_TERRAIN_DISTANCE_MEASUREMENT);
  });

  it('ignores stale-session points and errors', () => {
    const active = terrainDistanceMeasurementReducer(
      INITIAL_TERRAIN_DISTANCE_MEASUREMENT,
      { type: 'ACTIVATE', sessionId: 8 },
    );
    expect(terrainDistanceMeasurementReducer(active, {
      type: 'CAPTURE_POINT', sessionId: 7, point: pointA,
    })).toBe(active);
    expect(terrainDistanceMeasurementReducer(active, {
      type: 'SET_ERROR', sessionId: 7, error: 'stale',
    })).toBe(active);
  });
});
