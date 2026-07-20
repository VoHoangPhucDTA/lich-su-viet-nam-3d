export interface RegionCoordinate {
  lng: number;
  lat: number;
}

export interface RegionBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface ResolvedRegionGeometry {
  gadmRef: string;
  label: string;
  polygons: RegionCoordinate[][][];
  bounds: RegionBounds;
}

export interface RegionGeometryFeature {
  gadmRef: string;
  label: string;
  geometry: ResolvedRegionGeometry;
}

export interface RegionGeometryDiagnostic {
  code:
    | 'invalid_geojson'
    | 'feature_missing_gadm_ref'
    | 'unsupported_geometry'
    | 'invalid_region_coordinates'
    | 'empty_geometry'
    | 'antimeridian_bounds';
  gadmRef?: string;
  featureIndex?: number;
}

export interface RegionGeometryIndex {
  features: RegionGeometryFeature[];
  byGadmRef: Record<string, RegionGeometryFeature>;
  diagnostics: RegionGeometryDiagnostic[];
}

interface RawFeature {
  properties?: Record<string, unknown>;
  geometry?: { type?: unknown; coordinates?: unknown } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asCoordinate(value: unknown): RegionCoordinate | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lng = value[0];
  const lat = value[1];
  if (typeof lng !== 'number' || typeof lat !== 'number') return null;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  return { lng, lat };
}

function sameCoordinate(a: RegionCoordinate, b: RegionCoordinate) {
  return a.lng === b.lng && a.lat === b.lat;
}

function parseRing(value: unknown): RegionCoordinate[] | null {
  if (!Array.isArray(value)) return null;
  const ring = value.map(asCoordinate);
  if (ring.some((point) => point === null)) return null;
  const coordinates = ring as RegionCoordinate[];
  if (coordinates.length < 3) return null;
  if (!sameCoordinate(coordinates[0], coordinates[coordinates.length - 1])) {
    coordinates.push({ ...coordinates[0] });
  }
  return coordinates.length >= 4 ? coordinates : null;
}

function parsePolygon(value: unknown): RegionCoordinate[][] | null {
  if (!Array.isArray(value)) return null;
  const rings = value.map(parseRing);
  if (!rings[0] || rings[0].length < 4) return null;
  return [rings[0], ...rings.slice(1).filter((ring): ring is RegionCoordinate[] => !!ring)];
}

function parsePolygons(
  geometry: RawFeature['geometry'],
): { polygons: RegionCoordinate[][][] | null; unsupported: boolean } {
  if (!geometry || !isRecord(geometry)) return { polygons: null, unsupported: false };
  if (geometry.type === 'Polygon') {
    const polygon = parsePolygon(geometry.coordinates);
    return { polygons: polygon ? [polygon] : null, unsupported: false };
  }
  if (geometry.type === 'MultiPolygon') {
    if (!Array.isArray(geometry.coordinates)) return { polygons: null, unsupported: false };
    const polygons = geometry.coordinates
      .map(parsePolygon)
      .filter((polygon): polygon is RegionCoordinate[][] => !!polygon);
    return { polygons: polygons.length > 0 ? polygons : null, unsupported: false };
  }
  return { polygons: null, unsupported: true };
}

function boundsForPolygons(polygons: RegionCoordinate[][][]): RegionBounds | null {
  const outer = polygons.flatMap((polygon) => polygon[0] ?? []);
  if (outer.length === 0) return null;
  const longitudes = outer.map((point) => point.lng);
  const latitudes = outer.map((point) => point.lat);
  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  return {
    west,
    east,
    south: Math.min(...latitudes),
    north: Math.max(...latitudes),
  };
}

function parseFeature(
  feature: RawFeature,
  featureIndex: number,
  diagnostics: RegionGeometryDiagnostic[],
): RegionGeometryFeature | null {
  const properties = isRecord(feature.properties) ? feature.properties : {};
  const gadmRef = typeof properties.GID_1 === 'string' ? properties.GID_1.trim() : '';
  if (!gadmRef) {
    diagnostics.push({ code: 'feature_missing_gadm_ref', featureIndex });
    return null;
  }
  const parsed = parsePolygons(feature.geometry);
  if (parsed.unsupported) {
    diagnostics.push({ code: 'unsupported_geometry', gadmRef, featureIndex });
    return null;
  }
  if (!parsed.polygons) {
    diagnostics.push({ code: 'invalid_region_coordinates', gadmRef, featureIndex });
    return null;
  }
  const bounds = boundsForPolygons(parsed.polygons);
  if (!bounds) {
    diagnostics.push({ code: 'empty_geometry', gadmRef, featureIndex });
    return null;
  }
  if (bounds.east - bounds.west > 180) {
    diagnostics.push({ code: 'antimeridian_bounds', gadmRef, featureIndex });
    return null;
  }
  const label = typeof properties.NAME_1 === 'string' && properties.NAME_1.trim()
    ? properties.NAME_1.trim()
    : gadmRef;
  const geometry: ResolvedRegionGeometry = {
    gadmRef,
    label,
    polygons: parsed.polygons,
    bounds,
  };
  return { gadmRef, label, geometry };
}

export function parseRegionGeoJSON(input: unknown): RegionGeometryIndex {
  const diagnostics: RegionGeometryDiagnostic[] = [];
  if (!isRecord(input) || input.type !== 'FeatureCollection' || !Array.isArray(input.features)) {
    return { features: [], byGadmRef: {}, diagnostics: [{ code: 'invalid_geojson' }] };
  }
  const features = input.features
    .map((feature, featureIndex) =>
      isRecord(feature) ? parseFeature(feature as RawFeature, featureIndex, diagnostics) : null,
    )
    .filter((feature): feature is RegionGeometryFeature => !!feature);
  const byGadmRef: Record<string, RegionGeometryFeature> = {};
  for (const feature of features) byGadmRef[feature.gadmRef] = feature;
  return { features, byGadmRef, diagnostics };
}

export function resolveRegionGeometry(
  index: RegionGeometryIndex,
  gadmRef: string,
  label?: string,
): ResolvedRegionGeometry | null {
  const feature = index.byGadmRef[gadmRef.trim()];
  if (!feature) return null;
  return label?.trim() ? { ...feature.geometry, label: label.trim() } : feature.geometry;
}

export function unionRegionBounds(
  geometries: ResolvedRegionGeometry[],
): RegionBounds | null {
  if (geometries.length === 0) return null;
  return geometries.reduce<RegionBounds | null>((result, geometry) => {
    if (!result) return { ...geometry.bounds };
    return {
      west: Math.min(result.west, geometry.bounds.west),
      east: Math.max(result.east, geometry.bounds.east),
      south: Math.min(result.south, geometry.bounds.south),
      north: Math.max(result.north, geometry.bounds.north),
    };
  }, null);
}
