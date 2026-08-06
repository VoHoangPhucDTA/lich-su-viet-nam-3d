export const TERRAIN_VERTICAL_EXAGGERATION = 2;

export interface TerrainSceneLike {
  globe: {
    enableLighting: boolean;
    depthTestAgainstTerrain: boolean;
    maximumScreenSpaceError: number;
  };
  verticalExaggeration: number;
  verticalExaggerationRelativeHeight: number;
}

export interface TerrainSceneSnapshot {
  enableLighting: boolean;
  depthTestAgainstTerrain: boolean;
  verticalExaggeration: number;
  verticalExaggerationRelativeHeight: number;
  maximumScreenSpaceError: number;
}

export function snapshotTerrainScene(scene: TerrainSceneLike): TerrainSceneSnapshot {
  return {
    enableLighting: scene.globe.enableLighting,
    depthTestAgainstTerrain: scene.globe.depthTestAgainstTerrain,
    verticalExaggeration: scene.verticalExaggeration,
    verticalExaggerationRelativeHeight: scene.verticalExaggerationRelativeHeight,
    maximumScreenSpaceError: scene.globe.maximumScreenSpaceError,
  };
}

export function applyTerrainScene(scene: TerrainSceneLike): void {
  scene.globe.enableLighting = true;
  scene.globe.depthTestAgainstTerrain = true;
  scene.verticalExaggeration = TERRAIN_VERTICAL_EXAGGERATION;
  scene.verticalExaggerationRelativeHeight = 0;
}

export function restoreTerrainScene(
  scene: TerrainSceneLike,
  snapshot: TerrainSceneSnapshot,
): void {
  scene.globe.enableLighting = snapshot.enableLighting;
  scene.globe.depthTestAgainstTerrain = snapshot.depthTestAgainstTerrain;
  scene.verticalExaggeration = snapshot.verticalExaggeration;
  scene.verticalExaggerationRelativeHeight = snapshot.verticalExaggerationRelativeHeight;
  scene.globe.maximumScreenSpaceError = snapshot.maximumScreenSpaceError;
}
