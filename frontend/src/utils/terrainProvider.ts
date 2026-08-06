/**
 * Goal 1 keeps water-mask requests disabled while opting into normals so the
 * lighting already used by the terrain session can produce relief shading.
 */
export const WORLD_TERRAIN_PROVIDER_OPTIONS = {
  requestVertexNormals: true,
  requestWaterMask: false,
} as const;
