import { JulianDate } from 'cesium';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyTerrainScene,
  restoreTerrainScene,
  snapshotTerrainScene,
  TERRAIN_VERTICAL_EXAGGERATION,
  TERRAIN_REFERENCE_TIME_ISO,
  type TerrainClockLike,
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

function clockFixture(): TerrainClockLike {
  return {
    currentTime: JulianDate.fromIso8601('2025-01-02T03:04:05Z'),
    shouldAnimate: true,
  };
}

afterEach(() => vi.useRealTimers());

describe('terrain scene lifecycle settings', () => {
  it('snapshots every scene setting that the terrain session owns', () => {
    const scene = sceneFixture();

    const clock = clockFixture();
    const snapshot = snapshotTerrainScene(scene, clock);
    expect(snapshot).toMatchObject({
      enableLighting: false,
      depthTestAgainstTerrain: false,
      verticalExaggeration: 1.35,
      verticalExaggerationRelativeHeight: 412,
      maximumScreenSpaceError: 2.75,
      shouldAnimate: true,
    });
    expect(JulianDate.toIso8601(snapshot.currentTime, 0)).toBe('2025-01-02T03:04:05Z');
  });

  it('applies Goal 1 settings with a zero relative height and unchanged screen-space error', () => {
    const scene = sceneFixture();

    const clock = clockFixture();
    applyTerrainScene(scene, clock);

    expect(scene.globe.enableLighting).toBe(true);
    expect(scene.globe.depthTestAgainstTerrain).toBe(true);
    expect(scene.verticalExaggeration).toBe(TERRAIN_VERTICAL_EXAGGERATION);
    expect(scene.verticalExaggerationRelativeHeight).toBe(0);
    expect(scene.globe.maximumScreenSpaceError).toBe(2.75);
    expect(JulianDate.toIso8601(clock.currentTime, 0)).toBe(TERRAIN_REFERENCE_TIME_ISO);
    expect(clock.shouldAnimate).toBe(false);
  });

  it('restores the exact snapshot after a normal exit or provider error', () => {
    const scene = sceneFixture();
    const clock = clockFixture();
    const snapshot = snapshotTerrainScene(scene, clock);

    applyTerrainScene(scene, clock);
    restoreTerrainScene(scene, clock, snapshot);

    expect(scene).toEqual(sceneFixture());
    expect(scene.verticalExaggerationRelativeHeight).toBe(412);
    expect(JulianDate.toIso8601(clock.currentTime, 0)).toBe('2025-01-02T03:04:05Z');
    expect(clock.shouldAnimate).toBe(true);
  });

  it('remains stable across repeated enter/exit cycles', () => {
    const scene = sceneFixture();
    const clock = clockFixture();
    const original = sceneFixture();

    for (let cycle = 0; cycle < 10; cycle += 1) {
      const snapshot = snapshotTerrainScene(scene, clock);
      applyTerrainScene(scene, clock);
      restoreTerrainScene(scene, clock, snapshot);
    }

    expect(scene).toEqual(original);
  });

  it.each([
    '2026-08-09T02:00:00Z',
    '2026-08-09T14:00:00Z',
  ])('uses the same daylight reference at host time %s', (systemTime) => {
    vi.useFakeTimers();
    vi.setSystemTime(systemTime);
    const scene = sceneFixture();
    const clock = clockFixture();

    applyTerrainScene(scene, clock);

    expect(JulianDate.toIso8601(clock.currentTime, 0)).toBe(TERRAIN_REFERENCE_TIME_ISO);
  });
});
