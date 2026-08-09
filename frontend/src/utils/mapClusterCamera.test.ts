import { Cartesian3, Entity, JulianDate } from 'cesium';
import { describe, expect, it, vi } from 'vitest';
import { MAP_ORDINARY_CAMERA_PITCH_DEGREES } from './mapCameraFocus';
import {
  MAP_CLUSTER_MINIMUM_RANGE_METERS,
  MAP_CLUSTER_PITCH_DEGREES,
  flyToMapClusterEntities,
  mapClusterCameraRange,
} from './mapClusterCamera';

describe('ordinary cluster camera', () => {
  it('keeps tiny clusters above a readable map range with explicit pitch', () => {
    expect(mapClusterCameraRange(1)).toBe(MAP_CLUSTER_MINIMUM_RANGE_METERS);
    expect(MAP_CLUSTER_PITCH_DEGREES).toBe(MAP_ORDINARY_CAMERA_PITCH_DEGREES);
    expect(MAP_CLUSTER_PITCH_DEGREES).toBe(-75);
  });

  it('fits a larger cluster without losing the deterministic minimum contract', () => {
    expect(mapClusterCameraRange(100_000)).toBe(250_000);
  });

  it('executes the deterministic BoundingSphere camera operation for resolved cluster entities', () => {
    const currentTime = JulianDate.now();
    const entities = [
      new Entity({ id: 'a', position: Cartesian3.fromDegrees(103.01, 21.38) }),
      new Entity({ id: 'b', position: Cartesian3.fromDegrees(103.04, 21.42) }),
      new Entity({ id: 'c', position: Cartesian3.fromDegrees(103.00, 21.46) }),
    ];
    const flyToBoundingSphere = vi.fn();

    expect(flyToMapClusterEntities({ flyToBoundingSphere }, entities, currentTime)).toBe(true);
    expect(flyToBoundingSphere).toHaveBeenCalledOnce();
    const [sphere, options] = flyToBoundingSphere.mock.calls[0];
    expect(sphere.radius).toBeGreaterThan(0);
    expect(options.duration).toBe(0.8);
    expect(options.offset.heading).toBe(0);
    expect(options.offset.pitch).toBeCloseTo(-75 * Math.PI / 180);
    expect(options.offset.range).toBe(mapClusterCameraRange(sphere.radius));
  });

  it('does not invoke camera fitting when fewer than two positions resolve', () => {
    const flyToBoundingSphere = vi.fn();
    const entities = [new Entity({ id: 'a', position: Cartesian3.fromDegrees(103, 21) })];
    expect(flyToMapClusterEntities({ flyToBoundingSphere }, entities, JulianDate.now())).toBe(false);
    expect(flyToBoundingSphere).not.toHaveBeenCalled();
  });
});
