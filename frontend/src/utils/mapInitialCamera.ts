export const INITIAL_MAP_CAMERA_ANGLES_DEGREES = Object.freeze({
  heading: 0,
  pitch: -90,
  roll: 0,
});

export function buildInitialMapCameraOrientation(
  toRadians: (degrees: number) => number,
) {
  return {
    heading: toRadians(INITIAL_MAP_CAMERA_ANGLES_DEGREES.heading),
    pitch: toRadians(INITIAL_MAP_CAMERA_ANGLES_DEGREES.pitch),
    roll: toRadians(INITIAL_MAP_CAMERA_ANGLES_DEGREES.roll),
  };
}
