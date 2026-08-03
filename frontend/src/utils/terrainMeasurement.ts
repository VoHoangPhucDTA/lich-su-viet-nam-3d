import { Cartographic, EllipsoidGeodesic } from 'cesium';

export interface GeographicCoordinate {
  latitude: number;
  longitude: number;
}

export interface TerrainMeasurementPoint extends GeographicCoordinate {
  terrainHeightMeters: number | null;
}

export interface TerrainDistanceMeasurement {
  start: TerrainMeasurementPoint | null;
  end: TerrainMeasurementPoint | null;
  distanceMeters: number | null;
}

export type DistanceMeasurementPhase =
  | 'idle'
  | 'waiting-for-start'
  | 'waiting-for-end'
  | 'complete';

export interface TerrainDistanceMeasurementState extends TerrainDistanceMeasurement {
  phase: DistanceMeasurementPhase;
  sessionId: number | null;
  error: string | null;
}

export type TerrainDistanceMeasurementAction =
  | { type: 'ACTIVATE'; sessionId: number }
  | { type: 'CAPTURE_POINT'; sessionId: number; point: TerrainMeasurementPoint }
  | { type: 'SET_ERROR'; sessionId: number; error: string }
  | { type: 'RESET'; sessionId: number }
  | { type: 'DEACTIVATE' };

export const INITIAL_TERRAIN_DISTANCE_MEASUREMENT: TerrainDistanceMeasurementState = {
  phase: 'idle',
  sessionId: null,
  start: null,
  end: null,
  distanceMeters: null,
  error: null,
};

export function normalizeLongitudeDegrees(longitude: number): number {
  if (!Number.isFinite(longitude)) {
    throw new RangeError('Longitude must be a finite number.');
  }
  const normalized = ((longitude + 180) % 360 + 360) % 360 - 180;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function validateLatitude(latitude: number): number {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new RangeError('Latitude must be finite and within [-90, 90].');
  }
  return latitude;
}

/**
 * Approximate surface distance on Cesium's WGS84 ellipsoid.
 *
 * Heights are intentionally excluded: this is an ellipsoid geodesic, not a
 * terrain-following path and not a historical route.
 */
export function calculateGeodesicDistanceMeters(
  start: GeographicCoordinate,
  end: GeographicCoordinate,
): number {
  const startLatitude = validateLatitude(start.latitude);
  const endLatitude = validateLatitude(end.latitude);
  const startLongitude = normalizeLongitudeDegrees(start.longitude);
  const endLongitude = normalizeLongitudeDegrees(end.longitude);

  if (startLatitude === endLatitude && startLongitude === endLongitude) {
    return 0;
  }

  const geodesic = new EllipsoidGeodesic(
    Cartographic.fromDegrees(startLongitude, startLatitude),
    Cartographic.fromDegrees(endLongitude, endLatitude),
  );
  const distance = geodesic.surfaceDistance;
  if (!Number.isFinite(distance) || distance < 0) {
    throw new RangeError('Unable to calculate a finite geodesic distance.');
  }
  return distance;
}

const METERS_FORMATTER = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 0,
});

const KILOMETERS_FORMATTER = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatReferenceDistance(distanceMeters: number | null): string {
  if (distanceMeters == null || !Number.isFinite(distanceMeters) || distanceMeters < 0) {
    return '—';
  }
  if (distanceMeters < 1000) {
    return `${METERS_FORMATTER.format(Math.round(distanceMeters))} m`;
  }
  return `${KILOMETERS_FORMATTER.format(distanceMeters / 1000)} km`;
}

export function terrainDistanceMeasurementReducer(
  state: TerrainDistanceMeasurementState,
  action: TerrainDistanceMeasurementAction,
): TerrainDistanceMeasurementState {
  switch (action.type) {
    case 'ACTIVATE':
    case 'RESET':
      return {
        phase: 'waiting-for-start',
        sessionId: action.sessionId,
        start: null,
        end: null,
        distanceMeters: null,
        error: null,
      };
    case 'CAPTURE_POINT':
      if (state.sessionId !== action.sessionId) return state;
      if (state.phase === 'waiting-for-start') {
        return {
          ...state,
          phase: 'waiting-for-end',
          start: action.point,
          error: null,
        };
      }
      if (state.phase === 'waiting-for-end' && state.start) {
        return {
          ...state,
          phase: 'complete',
          end: action.point,
          distanceMeters: calculateGeodesicDistanceMeters(state.start, action.point),
          error: null,
        };
      }
      return state;
    case 'SET_ERROR':
      if (state.sessionId !== action.sessionId || state.phase === 'complete') return state;
      return { ...state, error: action.error };
    case 'DEACTIVATE':
      return { ...INITIAL_TERRAIN_DISTANCE_MEASUREMENT };
    default:
      return state;
  }
}
