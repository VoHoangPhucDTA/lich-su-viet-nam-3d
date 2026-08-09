import { JulianDate } from 'cesium';

export const TERRAIN_VERTICAL_EXAGGERATION = 2;
export const TERRAIN_REFERENCE_TIME_ISO = '2024-06-21T05:00:00Z';

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
  currentTime: JulianDate;
  shouldAnimate: boolean;
}

export interface TerrainClockLike {
  currentTime: JulianDate;
  shouldAnimate: boolean;
}

export function snapshotTerrainScene(
  scene: TerrainSceneLike,
  clock: TerrainClockLike,
): TerrainSceneSnapshot {
  return {
    enableLighting: scene.globe.enableLighting,
    depthTestAgainstTerrain: scene.globe.depthTestAgainstTerrain,
    verticalExaggeration: scene.verticalExaggeration,
    verticalExaggerationRelativeHeight: scene.verticalExaggerationRelativeHeight,
    maximumScreenSpaceError: scene.globe.maximumScreenSpaceError,
    currentTime: JulianDate.clone(clock.currentTime),
    shouldAnimate: clock.shouldAnimate,
  };
}

export function applyTerrainScene(scene: TerrainSceneLike, clock: TerrainClockLike): void {
  scene.globe.enableLighting = true;
  scene.globe.depthTestAgainstTerrain = true;
  scene.verticalExaggeration = TERRAIN_VERTICAL_EXAGGERATION;
  scene.verticalExaggerationRelativeHeight = 0;
  clock.currentTime = JulianDate.fromIso8601(TERRAIN_REFERENCE_TIME_ISO);
  clock.shouldAnimate = false;
}

export function restoreTerrainScene(
  scene: TerrainSceneLike,
  clock: TerrainClockLike,
  snapshot: TerrainSceneSnapshot,
): void {
  scene.globe.enableLighting = snapshot.enableLighting;
  scene.globe.depthTestAgainstTerrain = snapshot.depthTestAgainstTerrain;
  scene.verticalExaggeration = snapshot.verticalExaggeration;
  scene.verticalExaggerationRelativeHeight = snapshot.verticalExaggerationRelativeHeight;
  scene.globe.maximumScreenSpaceError = snapshot.maximumScreenSpaceError;
  clock.currentTime = JulianDate.clone(snapshot.currentTime);
  clock.shouldAnimate = snapshot.shouldAnimate;
}
