import type { TerrainTarget, TerrainTargetReason } from '../utils/terrainTargets';

export type TerrainProviderStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Serializable description of the terrain source currently available to UI. */
export type TerrainDataSourceStatus =
  | 'world-terrain'
  | 'ellipsoid-fallback'
  | 'loading'
  | 'unavailable';

export type RegionGeometryStatus = 'idle' | 'loading' | 'ready' | 'error';

export type TerrainMode = 'idle' | 'entering' | 'active' | 'exiting' | 'error';

export type TerrainRuntimeErrorCode =
  | 'missing_token'
  | 'provider_load_failed'
  | 'viewer_unavailable'
  | 'no_valid_targets'
  | 'region_geometry_pending'
  | 'geojson_load_failed'
  | 'invalid_geojson'
  | 'region_not_found'
  | 'unsupported_geometry'
  | 'invalid_region_coordinates'
  | 'no_resolved_regions'
  | 'camera_failed'
  | 'session_cancelled';

export interface TerrainRuntimeError {
  code: TerrainRuntimeErrorCode;
  message: string;
}

export interface TerrainSessionCommand {
  id: number;
  eventId: string;
  mode: 'entering' | 'active' | 'exiting';
  targets: TerrainTarget[];
  selectedTargetId: string | null;
  overview: boolean;
  cameraRequestId: number;
}

export interface TerrainViewModel {
  mode: TerrainMode;
  providerStatus: TerrainProviderStatus;
  geometryStatus: RegionGeometryStatus;
  targets: TerrainTarget[];
  selectedTargetId: string | null;
  eligible: boolean;
  ineligibleReason: TerrainTargetReason;
  error: TerrainRuntimeError | null;
}
