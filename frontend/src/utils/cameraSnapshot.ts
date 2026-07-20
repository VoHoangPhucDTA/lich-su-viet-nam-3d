export type VectorTuple = readonly [number, number, number];

export interface CameraVectorSource {
  x: number;
  y: number;
  z: number;
}

export interface CameraSnapshotSource {
  positionWC: CameraVectorSource;
  directionWC: CameraVectorSource;
  upWC: CameraVectorSource;
  heading: number;
  pitch: number;
  roll: number;
}

export interface CameraSnapshot {
  sessionId: number;
  positionWC: VectorTuple;
  directionWC: VectorTuple;
  upWC: VectorTuple;
  heading: number;
  pitch: number;
  roll: number;
}

function tuple(source: CameraVectorSource): VectorTuple {
  return [source.x, source.y, source.z];
}

export function createCameraSnapshot(
  sessionId: number,
  camera: CameraSnapshotSource,
): CameraSnapshot {
  return {
    sessionId,
    positionWC: tuple(camera.positionWC),
    directionWC: tuple(camera.directionWC),
    upWC: tuple(camera.upWC),
    heading: camera.heading,
    pitch: camera.pitch,
    roll: camera.roll,
  };
}

export function isSnapshotForSession(snapshot: CameraSnapshot | null, sessionId: number) {
  return snapshot?.sessionId === sessionId;
}

export function terrainFlightDuration(prefersReducedMotion: boolean, duration = 1.4) {
  return prefersReducedMotion ? 0 : duration;
}
