import { describe, expect, it, vi } from 'vitest';
import {
  buildInitialMapCameraOrientation,
  INITIAL_MAP_CAMERA_ANGLES_DEGREES,
} from './mapInitialCamera';

describe('initial map camera', () => {
  it('uses a stable north-up, zero-roll view without geographic offsets', () => {
    const toRadians = vi.fn((degrees: number) => degrees * Math.PI / 180);

    expect(buildInitialMapCameraOrientation(toRadians)).toEqual({
      heading: 0,
      pitch: -Math.PI / 2,
      roll: 0,
    });
    expect(INITIAL_MAP_CAMERA_ANGLES_DEGREES).toEqual({
      heading: 0,
      pitch: -90,
      roll: 0,
    });
  });
});
