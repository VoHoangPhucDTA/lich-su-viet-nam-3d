// frontend/src/utils/terrainInspection.ts
//
// Pure formatting and normalization helpers for the Terrain Exploration toolbar's
// "inspect-location" mode. These helpers never touch Cesium objects — they only
// transform already-sampled numbers into display strings, and provide a tiny
// "latest wins" comparator used to discard stale async results.
//
// Task C scope: minimal exploration toolbar. No measurement, area, or
// profile features live in this file.

export type TerrainInspectionHeightStatus =
  | 'available'
  | 'ellipsoid_only'
  | 'unavailable'
  | 'error';

export interface TerrainInspectionResult {
  latitude: number;
  longitude: number;
  heightMeters: number | null;
  heightStatus: TerrainInspectionHeightStatus;
}

/**
 * Number of decimals used when displaying latitude / longitude. 4 decimals
 * means roughly 11 m precision at the equator — plenty for casual exploration
 * while still readable.
 */
const COORDINATE_DECIMALS = 4;

/**
 * Number of decimals used for height in meters. 1 decimal gives ~0.1 m
 * precision which matches typical World Terrain precision in Vietnam.
 */
const HEIGHT_DECIMALS = 1;

/**
 * Clamp a longitude value to the canonical [-180, 180] range. Cesium never
 * returns values outside this range, but this protects against any future
 * pipeline that does.
 */
export function normalizeLongitude(value: number): number {
  if (!Number.isFinite(value)) return 0;
  let next = ((value + 180) % 360 + 360) % 360 - 180;
  if (next === -180) next = 180;
  return next;
}

/**
 * Clamp a latitude value to the canonical [-90, 90] range.
 */
export function normalizeLatitude(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value > 90) return 90;
  if (value < -90) return -90;
  return value;
}

/**
 * Format latitude for display: positive → "N", negative → "S".
 */
export function formatLatitude(value: number): string {
  const safe = normalizeLatitude(value);
  const direction = safe >= 0 ? 'N' : 'S';
  return `${Math.abs(safe).toFixed(COORDINATE_DECIMALS)}° ${direction}`;
}

/**
 * Format longitude for display: positive → "E", negative → "W".
 */
export function formatLongitude(value: number): string {
  const safe = normalizeLongitude(value);
  const direction = safe >= 0 ? 'E' : 'W';
  return `${Math.abs(safe).toFixed(COORDINATE_DECIMALS)}° ${direction}`;
}

/**
 * Format a terrain height in meters for display. Returns "—" for null/undefined
 * or when an error occurred, so the user always sees a value rather than
 * "undefined m".
 */
export function formatHeight(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return '—';
  const rounded = meters.toFixed(HEIGHT_DECIMALS);
  return `${rounded} m`;
}

/**
 * Human-readable error / unavailable message for the height panel. Returns null
 * for the "available" status, since the success path doesn't need extra text.
 */
export function inspectionErrorMessage(
  status: TerrainInspectionHeightStatus,
): string | null {
  switch (status) {
    case 'available':
      return null;
    case 'ellipsoid_only':
      return 'Chưa có dữ liệu độ cao địa hình chi tiết — đang hiển thị bề mặt ellipsoid.';
    case 'unavailable':
      return 'Không thể xác định vị trí trên bản đồ.';
    case 'error':
      return 'Không thể tải độ cao địa hình tại vị trí này.';
    default:
      return null;
  }
}

/**
 * Was this status a failure that should be surfaced as an inline error?
 */
export function isInspectionFailure(
  status: TerrainInspectionHeightStatus,
): boolean {
  return status === 'unavailable' || status === 'error';
}

/**
 * "Latest inspection wins" — true iff `newerId` strictly supersedes `olderId`.
 * Used by both CesiumMap and the toolbar so stale async results never overwrite
 * fresher ones.
 */
export function isLatestInspection(
  newerId: number,
  olderId: number,
): boolean {
  if (!Number.isFinite(newerId) || !Number.isFinite(olderId)) return false;
  return newerId > olderId;
}

/**
 * Build a fresh inspection result from a Cartographic-like triple. Used by
 * the unit tests; CesiumMap builds equivalent objects at runtime.
 */
export function buildInspectionResult(
  longitude: number,
  latitude: number,
  heightMeters: number | null,
  heightStatus: TerrainInspectionHeightStatus,
): TerrainInspectionResult {
  return {
    latitude: normalizeLatitude(latitude),
    longitude: normalizeLongitude(longitude),
    heightMeters,
    heightStatus,
  };
}
