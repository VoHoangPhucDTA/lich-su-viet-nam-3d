export type AdministrativeBoundaryLayerId = 'existing-gadm' | 'vn-2026-34';

export type AdministrativeBoundaryLayer = {
  id: AdministrativeBoundaryLayerId;
  label: string;
  url: string;
  sourceLabel: string;
  temporalLabel: string;
  purpose: 'reference';
};

export type AdministrativeBoundaryLoadResult =
  | { status: 'ready'; raw: unknown }
  | { status: 'error'; error: Error };

export const EXISTING_GADM_LAYER_ID: AdministrativeBoundaryLayerId = 'existing-gadm';
export const VIETNAM_2026_34_LAYER_ID: AdministrativeBoundaryLayerId = 'vn-2026-34';
export const DEFAULT_ADMINISTRATIVE_BOUNDARY_LAYER_ID = EXISTING_GADM_LAYER_ID;

export const ADMINISTRATIVE_BOUNDARY_LAYERS: readonly AdministrativeBoundaryLayer[] = [
  {
    id: EXISTING_GADM_LAYER_ID,
    label: 'GADM — ranh giới tham chiếu hiện đại',
    url: '/geojson/vietnam-provinces.json',
    sourceLabel: 'GADM',
    temporalLabel: 'Hiện đại / current reference',
    purpose: 'reference',
  },
  {
    id: VIETNAM_2026_34_LAYER_ID,
    label: 'Việt Nam 2026 — 34 tỉnh/thành',
    url: '/geojson/vietnam-provinces-2026-34.geojson',
    sourceLabel: 'GIS Việt Nam',
    temporalLabel: '2026 / current reference',
    purpose: 'reference',
  },
];

export function getAdministrativeBoundaryLayer(
  id: AdministrativeBoundaryLayerId,
): AdministrativeBoundaryLayer {
  return ADMINISTRATIVE_BOUNDARY_LAYERS.find((layer) => layer.id === id)
    ?? ADMINISTRATIVE_BOUNDARY_LAYERS[0];
}

export function normalizeAdministrativeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .toLocaleLowerCase('vi-VN');
}

export function isFeatureCollectionGeoJson(value: unknown): value is {
  type: 'FeatureCollection';
  features: unknown[];
} {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { type?: unknown; features?: unknown };
  return candidate.type === 'FeatureCollection' && Array.isArray(candidate.features);
}

/**
 * Reference layers are optional presentation data. A failed fetch or invalid
 * payload is returned as a value so the caller can retain the existing GADM
 * layer and all event/terrain geometry behavior.
 */
export async function loadAdministrativeBoundaryLayer(
  layer: AdministrativeBoundaryLayer,
  fetchImpl: typeof fetch = fetch,
): Promise<AdministrativeBoundaryLoadResult> {
  try {
    const response = await fetchImpl(layer.url);
    if (!response.ok) throw new Error(`GeoJSON HTTP ${response.status}`);
    const raw = await response.json() as unknown;
    if (!isFeatureCollectionGeoJson(raw) || raw.features.length === 0) {
      throw new Error('Invalid or empty boundary GeoJSON');
    }
    return { status: 'ready', raw };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
