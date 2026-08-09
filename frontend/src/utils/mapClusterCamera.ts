import {
  BoundingSphere,
  Entity,
  HeadingPitchRange,
  JulianDate,
  Math as CesiumMath,
  type Camera,
} from 'cesium';
import { MAP_ORDINARY_CAMERA_PITCH_DEGREES } from './mapCameraFocus';

export const MAP_CLUSTER_MINIMUM_RANGE_METERS = 50_000;
export const MAP_CLUSTER_PITCH_DEGREES = MAP_ORDINARY_CAMERA_PITCH_DEGREES;

export function mapClusterCameraRange(sphereRadius: number): number {
  return Math.max(MAP_CLUSTER_MINIMUM_RANGE_METERS, sphereRadius * 2.5);
}

export function flyToMapClusterEntities(
  camera: Pick<Camera, 'flyToBoundingSphere'>,
  entities: readonly Entity[],
  currentTime: JulianDate,
): boolean {
  const positions = entities.flatMap((entity) => {
    const position = entity.position?.getValue(currentTime);
    return position ? [position] : [];
  });
  if (positions.length <= 1) return false;
  const sphere = BoundingSphere.fromPoints(positions);
  camera.flyToBoundingSphere(sphere, {
    offset: new HeadingPitchRange(
      0,
      CesiumMath.toRadians(MAP_CLUSTER_PITCH_DEGREES),
      mapClusterCameraRange(sphere.radius),
    ),
    duration: 0.8,
  });
  return true;
}
