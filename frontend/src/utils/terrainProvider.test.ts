import { describe, expect, it } from 'vitest';
import { WORLD_TERRAIN_PROVIDER_OPTIONS } from './terrainProvider';

describe('World Terrain provider options', () => {
  it('requests vertex normals without requesting the water mask', () => {
    expect(WORLD_TERRAIN_PROVIDER_OPTIONS).toEqual({
      requestVertexNormals: true,
      requestWaterMask: false,
    });
  });
});
