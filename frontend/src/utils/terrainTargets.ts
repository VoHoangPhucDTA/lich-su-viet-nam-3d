import type {
  CanonicalGeoType,
  SourceMapData,
  SourceMapMarker,
} from '../types/event';

export interface TerrainPointTarget {
  id: string;
  kind: 'point';
  label: string;
  position: {
    lat: number;
    lng: number;
  };
  confidence?: string;
  sourceIndex: number;
}

export interface TerrainRegionTarget {
  id: string;
  kind: 'region';
  label: string;
  gadmRef: string;
  provinceName?: string;
  sourceIndex: number;
}

export type TerrainTarget = TerrainPointTarget | TerrainRegionTarget;

export type TerrainDiagnosticKind = 'point' | 'region';

export interface TerrainDiagnostic {
  code: string;
  targetKind?: TerrainDiagnosticKind;
  sourceIndex?: number;
  reference?: string;
}

export type TerrainTargetReason =
  | null
  | 'unsupported_geo_type'
  | 'missing_map_data'
  | 'invalid_geo_type'
  | 'no_valid_targets';

export interface TerrainTargetResult {
  canonicalGeoType: CanonicalGeoType | null;
  targets: TerrainTarget[];
  eligible: boolean;
  reason: TerrainTargetReason;
  diagnostics: TerrainDiagnostic[];
}

const CANONICAL_TYPES = new Set<CanonicalGeoType>([
  'point',
  'multi_point',
  'multi_polygon',
  'mixed',
  'nationwide',
  'no_location',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalGeoType(value: unknown): CanonicalGeoType | null {
  return typeof value === 'string' && CANONICAL_TYPES.has(value as CanonicalGeoType)
    ? value as CanonicalGeoType
    : null;
}

function sourceMapData(source: unknown): SourceMapData | null {
  if (!isRecord(source)) return null;
  const nested = source.mapData;
  if (isRecord(nested)) return nested as SourceMapData;
  // Accept a mapData object directly for pure utility callers and tests.
  return 'geoType' in source || 'marker' in source || 'markers' in source
    ? source as SourceMapData
    : null;
}

function markerValue(value: unknown): SourceMapMarker | null {
  return isRecord(value) ? value as SourceMapMarker : null;
}

function validCoordinate(marker: SourceMapMarker | null): marker is SourceMapMarker & {
  lat: number;
  lng: number;
} {
  if (!marker || typeof marker.lat !== 'number' || typeof marker.lng !== 'number') return false;
  return Number.isFinite(marker.lat) && Number.isFinite(marker.lng)
    && marker.lat >= -90 && marker.lat <= 90
    && marker.lng >= -180 && marker.lng <= 180;
}

function markerLabel(marker: SourceMapMarker, sourceIndex: number): string {
  const label = typeof marker.label === 'string' ? marker.label.trim() : '';
  if (label) return label;
  const name = typeof marker.name === 'string' ? marker.name.trim() : '';
  return name || `Địa điểm ${sourceIndex + 1}`;
}

function confidenceValue(marker: SourceMapMarker): string | undefined {
  return typeof marker.confidence === 'string' && marker.confidence.trim()
    ? marker.confidence.trim()
    : undefined;
}

function pointTarget(
  eventId: string,
  marker: SourceMapMarker,
  sourceIndex: number,
  idSuffix = String(sourceIndex),
): TerrainPointTarget {
  return {
    id: `${eventId}:point:${idSuffix}`,
    kind: 'point',
    label: markerLabel(marker, sourceIndex),
    position: { lat: marker.lat as number, lng: marker.lng as number },
    confidence: confidenceValue(marker),
    sourceIndex,
  };
}

function diagnostic(
  diagnostics: TerrainDiagnostic[],
  code: string,
  targetKind: TerrainDiagnosticKind,
  sourceIndex: number,
  reference?: string,
) {
  diagnostics.push({ code, targetKind, sourceIndex, reference });
}

function pointFromMarker(
  eventId: string,
  value: unknown,
  sourceIndex: number,
  diagnostics: TerrainDiagnostic[],
  idSuffix?: string,
): TerrainPointTarget | null {
  const marker = markerValue(value);
  if (!validCoordinate(marker)) {
    diagnostic(diagnostics, 'invalid_point_marker', 'point', sourceIndex);
    return null;
  }
  return pointTarget(eventId, marker, sourceIndex, idSuffix);
}

function regionTargets(
  eventId: string,
  map: SourceMapData,
  diagnostics: TerrainDiagnostic[],
): TerrainRegionTarget[] {
  const refs = Array.isArray(map.gadmRefs) ? map.gadmRefs : [];
  const names = Array.isArray(map.provinceNames) ? map.provinceNames : [];
  if (refs.length !== names.length && (refs.length > 0 || names.length > 0)) {
    diagnostics.push({
      code: 'region_arrays_length_mismatch',
      targetKind: 'region',
      reference: `gadmRefs=${refs.length};provinceNames=${names.length}`,
    });
  }

  const occurrences = new Map<string, number>();
  const targets: TerrainRegionTarget[] = [];
  refs.forEach((value, sourceIndex) => {
    const gadmRef = typeof value === 'string' ? value.trim() : '';
    if (!gadmRef) {
      diagnostic(diagnostics, 'invalid_gadm_ref', 'region', sourceIndex);
      return;
    }
    const occurrence = occurrences.get(gadmRef) ?? 0;
    occurrences.set(gadmRef, occurrence + 1);
    if (occurrence > 0) {
      diagnostic(diagnostics, 'duplicate_gadm_ref', 'region', sourceIndex, gadmRef);
    }
    const provinceName = typeof names[sourceIndex] === 'string' ? names[sourceIndex].trim() : '';
    const idSuffix = occurrence === 0 ? gadmRef : `${gadmRef}:${sourceIndex}`;
    targets.push({
      id: `${eventId}:region:${idSuffix}`,
      kind: 'region',
      label: provinceName || gadmRef,
      gadmRef,
      provinceName: provinceName || undefined,
      sourceIndex,
    });
  });
  return targets;
}

function eventIdValue(eventId: string): { value: string; missing: boolean } {
  const value = typeof eventId === 'string' ? eventId.trim() : '';
  return { value: value || 'event:unknown', missing: !value };
}

/**
 * Normalize only source map data. It intentionally does not resolve GADM or import Cesium.
 * `source` may be a public mapData object or a legacy wrapper used by local fixtures.
 */
export function normalizeTerrainTargets(eventId: string, source: unknown): TerrainTargetResult {
  const diagnostics: TerrainDiagnostic[] = [];
  const id = eventIdValue(eventId);
  if (id.missing) diagnostics.push({ code: 'missing_event_id' });

  const map = sourceMapData(source);
  if (!map) {
    return {
      canonicalGeoType: null,
      targets: [],
      eligible: false,
      reason: 'missing_map_data',
      diagnostics,
    };
  }

  const type = canonicalGeoType(map.geoType);
  if (!type) {
    return {
      canonicalGeoType: null,
      targets: [],
      eligible: false,
      reason: 'invalid_geo_type',
      diagnostics: [...diagnostics, { code: 'invalid_geo_type' }],
    };
  }
  if (type === 'nationwide' || type === 'no_location') {
    return {
      canonicalGeoType: type,
      targets: [],
      eligible: false,
      reason: 'unsupported_geo_type',
      diagnostics: [...diagnostics, { code: 'unsupported_geo_type' }],
    };
  }

  const targets: TerrainTarget[] = [];
  if (type === 'point') {
    const marker = pointFromMarker(id.value, map.marker, 0, diagnostics);
    if (marker) targets.push(marker);
  } else if (type === 'multi_point') {
    if (!Array.isArray(map.markers)) {
      diagnostics.push({ code: 'invalid_markers_array', targetKind: 'point' });
    } else {
      map.markers.forEach((marker, sourceIndex) => {
        const point = pointFromMarker(id.value, marker, sourceIndex, diagnostics);
        if (point) targets.push(point);
      });
    }
  } else if (type === 'multi_polygon') {
    targets.push(...regionTargets(id.value, map, diagnostics));
  } else if (type === 'mixed') {
    const primary = pointFromMarker(id.value, map.marker, 0, diagnostics, 'marker');
    const markers = Array.isArray(map.markers) ? map.markers : [];
    const pointTargets = markers.flatMap((marker, sourceIndex) => {
      const point = pointFromMarker(
        id.value,
        marker,
        sourceIndex,
        diagnostics,
        `array:${sourceIndex}`,
      );
      if (!point) return [];
      if (
        primary && sourceIndex === 0
        && primary.position.lat === point.position.lat
        && primary.position.lng === point.position.lng
        && primary.label === point.label
      ) {
        diagnostics.push({ code: 'primary_marker_mirrors_first_array_marker', targetKind: 'point', sourceIndex });
        return [];
      }
      return [point];
    });
    if (primary) targets.push(primary);
    targets.push(...pointTargets, ...regionTargets(id.value, map, diagnostics));
  }

  return {
    canonicalGeoType: type,
    targets,
    eligible: targets.length > 0,
    reason: targets.length > 0 ? null : 'no_valid_targets',
    diagnostics,
  };
}
