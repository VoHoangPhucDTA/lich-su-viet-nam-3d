import { BoundingSphere, Cartesian3 } from 'cesium';
import type { HistoricalEvent } from '../types/event';
import type { RegionGeometryIndex } from './regionGeometry';
import { regionOuterCoordinates, resolveEventRegions } from './regionGeometry';

export const MAP_POINT_FOCUS_RANGE_METERS = 50_000;
export const MAP_MULTI_POINT_MINIMUM_RANGE_METERS = 50_000;
export const MAP_ORDINARY_CAMERA_PITCH_DEGREES = -75;
export const MAP_FOCUS_ZOOM_BASE_RANGE_METERS = 32_000_000;
export const MAP_FOCUS_MINIMUM_RANGE_METERS = 50_000;
export const MAP_FOCUS_MAXIMUM_RANGE_METERS = 1_500_000;

export interface MapFocusGeometry {
  mode: 'bounds';
  center: { lat: number; lng: number };
  zoom: number;
}

export type MapFocusRequestReason = 'selection' | 'hydration';

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

export function parseMapFocusGeometry(value: unknown): MapFocusGeometry | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { mode?: unknown; center?: unknown; zoom?: unknown };
  if (candidate.mode !== 'bounds' || !validMapCoordinate(candidate.center)) return null;
  if (
    typeof candidate.zoom !== 'number'
    || !Number.isFinite(candidate.zoom)
    || candidate.zoom < 0
    || candidate.zoom > 24
  ) return null;
  return {
    mode: 'bounds',
    center: { lat: candidate.center.lat, lng: candidate.center.lng },
    zoom: candidate.zoom,
  };
}

/** UI camera semantics authored in mapData; this is not a polygon-bounds calculation. */
export function mapFocusZoomToRange(zoom: number): number {
  return Math.min(
    MAP_FOCUS_MAXIMUM_RANGE_METERS,
    Math.max(MAP_FOCUS_MINIMUM_RANGE_METERS, MAP_FOCUS_ZOOM_BASE_RANGE_METERS / (2 ** zoom)),
  );
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

  // Region coordinates are resolved separately from the shared GeoJSON index.
  return [];
}

function coordinateTargetKey(position: { lat: number; lng: number }): string {
  const lat = Object.is(position.lat, -0) ? 0 : position.lat;
  const lng = Object.is(position.lng, -0) ? 0 : position.lng;
  return `${lat},${lng}`;
}

/**
 * Stable identity for the semantic targets of an ordinary camera request.
 * Region labels and GADM references converge on sorted canonical GADM IDs;
 * mixed events additionally retain their point targets.
 */
export function buildMapFocusSemanticSignature(
  event: HistoricalEvent,
  regionIndex: RegionGeometryIndex | null = null,
): string | null {
  const regionCapable = event.geoType === 'multi_polygon' || event.geoType === 'mixed';
  const regionIds = regionCapable && regionIndex
    ? resolveEventRegions(regionIndex, event).resolved
      .map((item) => item.geometry.gadmRef)
      .sort((a, b) => a.localeCompare(b))
    : [];
  const pointPositions = event.geoType === 'point'
    || event.geoType === 'multi_point'
    || event.geoType === 'mixed'
    ? focusPositionsForEvent(event)
    : [];
  const pointKeys = [...new Set(pointPositions.map(coordinateTargetKey))].sort();
  const targetParts: string[] = [];
  if (regionIds.length > 0) targetParts.push(`regions:${regionIds.join(',')}`);
  if (pointKeys.length > 0) targetParts.push(`points:${pointKeys.join(';')}`);
  if (targetParts.length > 0) return `${event.id}|${targetParts.join('|')}`;

  if (regionCapable) {
    const focusGeometry = parseMapFocusGeometry(event.sourceMapData?.focusGeometry);
    if (focusGeometry) {
      return `${event.id}|authoring:${coordinateTargetKey(focusGeometry.center)}@${focusGeometry.zoom}`;
    }
  }
  return null;
}

export function shouldApplyMapFocusRequest(
  previousSignature: string | null,
  nextSignature: string | null,
  reason: MapFocusRequestReason,
): boolean {
  if (!nextSignature) return false;
  return reason === 'selection' || previousSignature !== nextSignature;
}

export function buildMapFocusCameraFrame(
  event: HistoricalEvent,
  regionIndex: RegionGeometryIndex | null = null,
): {
  kind: 'point-geometry' | 'region-geometry' | 'combined-geometry' | 'authoring-focus';
  positions: { lat: number; lng: number }[];
  sphere: BoundingSphere;
  range: number;
} | null {
  const regionCapable = event.geoType === 'multi_polygon' || event.geoType === 'mixed';
  const pointPositions = event.geoType === 'mixed' ? focusPositionsForEvent(event) : [];
  const regionPositions = regionCapable && regionIndex
    ? regionOuterCoordinates(
      resolveEventRegions(regionIndex, event).resolved.map((item) => item.geometry),
    ).map(({ lat, lng }) => ({ lat, lng }))
    : [];

  const actualPositions = [...regionPositions, ...pointPositions];
  if (actualPositions.length > 0) {
    const points = actualPositions.map((position) =>
      Cartesian3.fromDegrees(position.lng, position.lat),
    );
    const sphere = points.length === 1
      ? new BoundingSphere(points[0], 1)
      : BoundingSphere.fromPoints(points);
    return {
      kind: regionPositions.length > 0 && pointPositions.length > 0
        ? 'combined-geometry'
        : regionPositions.length > 0
          ? 'region-geometry'
          : 'point-geometry',
      positions: actualPositions,
      sphere,
      range: Math.max(MAP_MULTI_POINT_MINIMUM_RANGE_METERS, sphere.radius * 2.5),
    };
  }

  if (regionCapable) {
    const focusGeometry = parseMapFocusGeometry(event.sourceMapData?.focusGeometry);
    if (focusGeometry) {
      const center = Cartesian3.fromDegrees(focusGeometry.center.lng, focusGeometry.center.lat);
      return {
        kind: 'authoring-focus',
        positions: [focusGeometry.center],
        sphere: new BoundingSphere(center, 1),
        range: mapFocusZoomToRange(focusGeometry.zoom),
      };
    }
    return null;
  }
  const positions = focusPositionsForEvent(event);
  if (positions.length === 0) return null;
  const points = positions.map((position) =>
    Cartesian3.fromDegrees(position.lng, position.lat),
  );
  const sphere = points.length === 1
    ? new BoundingSphere(points[0], 1)
    : BoundingSphere.fromPoints(points);
  return {
    kind: 'point-geometry',
    positions,
    sphere,
    range: event.geoType === 'point'
      ? MAP_POINT_FOCUS_RANGE_METERS
      : Math.max(MAP_MULTI_POINT_MINIMUM_RANGE_METERS, sphere.radius * 2.5),
  };
}
