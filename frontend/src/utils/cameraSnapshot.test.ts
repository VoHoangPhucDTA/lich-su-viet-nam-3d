import { describe, expect, it } from 'vitest';
import {
  createCameraSnapshot,
  isSnapshotForSession,
  terrainFlightDuration,
} from './cameraSnapshot';

describe('cameraSnapshot', () => {
  it('clones mutable camera vectors into tuples', () => {
    const camera = {
      positionWC: { x: 1, y: 2, z: 3 },
      directionWC: { x: 4, y: 5, z: 6 },
      upWC: { x: 7, y: 8, z: 9 },
      heading: 0.1,
      pitch: -0.5,
      roll: 0,
    };
    const snapshot = createCameraSnapshot(10, camera);
    camera.positionWC.x = 99;
    camera.directionWC.y = 99;

    expect(snapshot.positionWC).toEqual([1, 2, 3]);
    expect(snapshot.directionWC).toEqual([4, 5, 6]);
    expect(snapshot.upWC).toEqual([7, 8, 9]);
    expect(isSnapshotForSession(snapshot, 10)).toBe(true);
    expect(isSnapshotForSession(snapshot, 11)).toBe(false);
  });

  it('uses zero duration for reduced motion', () => {
    expect(terrainFlightDuration(true)).toBe(0);
    expect(terrainFlightDuration(false, 2)).toBe(2);
  });
});
