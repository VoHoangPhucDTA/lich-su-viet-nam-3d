import { describe, expect, it } from 'vitest';
import {
  applyTerrainScene,
  restoreTerrainScene,
  snapshotTerrainScene,
  TERRAIN_VERTICAL_EXAGGERATION,
  type TerrainSceneLike,
} from './terrainScene';

function sceneFixture(): TerrainSceneLike {
  return {
    globe: {
      enableLighting: false,
      depthTestAgainstTerrain: false,
      maximumScreenSpaceError: 2.75,
    },
    verticalExaggeration: 1.35,
    verticalExaggerationRelativeHeight: 412,
  };
}

describe('terrain scene lifecycle settings', () => {
  it('snapshots every scene setting that the terrain session owns', () => {
    const scene = sceneFixture();

    expect(snapshotTerrainScene(scene)).toEqual({
      enableLighting: false,
      depthTestAgainstTerrain: false,
      verticalExaggeration: 1.35,
      verticalExaggerationRelativeHeight: 412,
      maximumScreenSpaceError: 2.75,
    });
  });

  it('applies Goal 1 settings with a zero relative height and unchanged screen-space error', () => {
    const scene = sceneFixture();

    applyTerrainScene(scene);

    expect(scene.globe.enableLighting).toBe(true);
    expect(scene.globe.depthTestAgainstTerrain).toBe(true);
    expect(scene.verticalExaggeration).toBe(TERRAIN_VERTICAL_EXAGGERATION);
    expect(scene.verticalExaggerationRelativeHeight).toBe(0);
    expect(scene.globe.maximumScreenSpaceError).toBe(2.75);
  });

  it('restores the exact snapshot after a normal exit or provider error', () => {
    const scene = sceneFixture();
    const snapshot = snapshotTerrainScene(scene);

    applyTerrainScene(scene);
    restoreTerrainScene(scene, snapshot);

    expect(scene).toEqual(sceneFixture());
    expect(scene.verticalExaggerationRelativeHeight).toBe(412);
  });

  it('remains stable across repeated enter/exit cycles', () => {
    const scene = sceneFixture();
    const original = sceneFixture();

    for (let cycle = 0; cycle < 10; cycle += 1) {
      const snapshot = snapshotTerrainScene(scene);
      applyTerrainScene(scene);
      restoreTerrainScene(scene, snapshot);
    }

    expect(scene).toEqual(original);
  });
});
