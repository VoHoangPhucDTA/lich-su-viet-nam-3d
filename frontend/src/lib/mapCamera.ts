import {
  Cartesian3,
  Math as CesiumMath,
  type Rectangle,
  type Viewer,
} from 'cesium';

const DEFAULT_CAMERA_DURATION_SECONDS = 1.5;

export type CameraTarget =
  | { kind: 'none'; reason: 'no_location' | 'missing_geometry' | 'geojson_pending' }
  | { kind: 'point'; lng: number; lat: number; altitude: number; duration?: number }
  | { kind: 'rectangle'; rectangle: Rectangle; duration?: number };

function defaultCameraOrientation() {
  return {
    heading: CesiumMath.toRadians(0),
    pitch: CesiumMath.toRadians(-90),
    roll: 0,
  };
}

export function applyCameraTarget(viewer: Viewer, target: CameraTarget): boolean {
  if (target.kind === 'none') return false;

  const duration = target.duration ?? DEFAULT_CAMERA_DURATION_SECONDS;
  const orientation = defaultCameraOrientation();

  if (target.kind === 'rectangle') {
    viewer.camera.flyTo({
      destination: target.rectangle,
      orientation,
      duration,
    });
    return true;
  }

  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(target.lng, target.lat, target.altitude),
    orientation,
    duration,
  });
  return true;
}

