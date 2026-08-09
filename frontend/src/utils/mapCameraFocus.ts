import { BoundingSphere, Cartesian3 } from 'cesium';
import type { HistoricalEvent } from '../types/event';

export const MAP_POINT_FOCUS_RANGE_METERS = 50_000;
export const MAP_MULTI_POINT_MINIMUM_RANGE_METERS = 50_000;

function validMapCoordinate(value: unknown): value is { lat: number; lng: number } {
  if (!value || typeof value !== 'object') return false;
  const coordinate = value as { lat?: unknown; lng?: unknown };
  return typeof coordinate.lat === 'number'
    && Number.isFinite(coordinate.lat)
    && coordinate.lat >= -90
    && coordinate.lat <= 90
    && typeof coordinate.lng === 'number'
    && Number.isFinite(coordinate.lng)
    && coordinate.lng >= -180
    && coordinate.lng <= 180;
}

/** Coordinates that an ordinary map selection may focus without entering terrain mode. */
export function focusPositionsForEvent(event: HistoricalEvent): { lat: number; lng: number }[] {
  if (event.geoType === 'point') {
    if (validMapCoordinate(event.sourceMapData?.marker)) {
      const { lat, lng } = event.sourceMapData.marker;
      return [{ lat, lng }];
    }
    const firstMarker = event.sourceMapData?.markers?.find(validMapCoordinate);
    if (firstMarker) return [{ lat: firstMarker.lat, lng: firstMarker.lng }];
    return validMapCoordinate(event.coordinates) ? [event.coordinates] : [];
  }

  if (event.geoType === 'multi_point' || event.geoType === 'mixed') {
    const markers = (event.sourceMapData?.markers?.filter(validMapCoordinate) ?? [])
      .map(({ lat, lng }) => ({ lat, lng }));
    if (markers.length > 0) return markers;
    if (validMapCoordinate(event.sourceMapData?.marker)) {
      const { lat, lng } = event.sourceMapData.marker;
      return [{ lat, lng }];
    }
    return validMapCoordinate(event.coordinates) ? [event.coordinates] : [];
  }

  // Region fitting is deliberately deferred until the resolved polygon geometry
  // can be shared with this ordinary-map camera path.
  return [];
}

export function buildMapFocusCameraFrame(event: HistoricalEvent): {
  positions: { lat: number; lng: number }[];
  sphere: BoundingSphere;
  range: number;
} | null {
  const positions = focusPositionsForEvent(event);
  if (positions.length === 0) return null;
  const points = positions.map((position) =>
    Cartesian3.fromDegrees(position.lng, position.lat),
  );
  const sphere = points.length === 1
    ? new BoundingSphere(points[0], 1)
    : BoundingSphere.fromPoints(points);
  return {
    positions,
    sphere,
    range: event.geoType === 'point'
      ? MAP_POINT_FOCUS_RANGE_METERS
      : Math.max(MAP_MULTI_POINT_MINIMUM_RANGE_METERS, sphere.radius * 2.5),
  };
}
