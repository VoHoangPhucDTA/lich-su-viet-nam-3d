import { describe, expect, it, vi } from 'vitest';
import {
  applyImmediateTerrainCamera,
  clampTerrainRange,
  clampTerrainZoomFactor,
  normalizeCachedTerrainHeight,
  resolveCurrentTerrainPointFrame,
  resolveTerrainHeight,
  terrainPointCameraFrame,
  terrainRegionCameraFrame,
  terrainZoomAmount,
  toRawTerrainHeight,
  TERRAIN_FIRST_POINT_TIMEOUT_MS,
  TERRAIN_NEXT_POINT_TIMEOUT_MS,
  TERRAIN_SAFE_FALLBACK_PITCH_DEG,
  TERRAIN_SAFE_FALLBACK_RANGE,
  TERRAIN_FALLBACK_MIN_RANGE,
  TERRAIN_OVERVIEW_MIN_ZOOM_RANGE,
  TERRAIN_POINT_MIN_RANGE,
  TERRAIN_POINT_PITCH_DEG,
  TERRAIN_POINT_RANGE,
  TERRAIN_SELECTED_REGION_MIN_ZOOM_RANGE,
  toRenderedTerrainHeight,
} from './terrainCamera';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('terrain camera height contract', () => {
  it('renders height relative to the zero baseline', () => {
    expect(toRenderedTerrainHeight(120, 2, 0)).toBe(240);
  });

  it('renders height around a non-zero relative baseline', () => {
    expect(toRenderedTerrainHeight(500, 2, 100)).toBe(900);
    expect(toRawTerrainHeight(900, 2, 100)).toBe(500);
  });

  it('resolves a finite sampled height', async () => {
    await expect(resolveTerrainHeight({
      sample: async () => 123.5,
      timeoutMs: 10,
    })).resolves.toEqual({
      height: 123.5,
      source: 'sampled',
      timedOut: false,
    });
  });

  it('clears the timeout when sampling completes early', async () => {
    vi.useFakeTimers();
    try {
      await expect(resolveTerrainHeight({
        sample: async () => 42,
        timeoutMs: 5000,
      })).resolves.toMatchObject({ height: 42, source: 'sampled' });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses fallback for a rejected sample', async () => {
    await expect(resolveTerrainHeight({
      sample: async () => {
        throw new Error('sample failed');
      },
      timeoutMs: 10,
    })).resolves.toEqual({
      height: 0,
      source: 'ellipsoid-fallback',
      timedOut: false,
    });
  });

  it('uses fallback for undefined and NaN samples', async () => {
    await expect(resolveTerrainHeight({ sample: async () => undefined }))
      .resolves.toMatchObject({ height: 0, source: 'ellipsoid-fallback' });
    await expect(resolveTerrainHeight({ sample: async () => Number.NaN }))
      .resolves.toMatchObject({ height: 0, source: 'ellipsoid-fallback' });
  });

  it('times out without cancelling the underlying sample promise', async () => {
    vi.useFakeTimers();
    try {
      let resolveSample!: (value: number) => void;
      const sample = new Promise<number>((resolve) => {
        resolveSample = resolve;
      });
      const resultPromise = resolveTerrainHeight({
        sample: () => sample,
        timeoutMs: 25,
      });

      await vi.advanceTimersByTimeAsync(25);
      await expect(resultPromise).resolves.toEqual({
        height: 0,
        source: 'ellipsoid-fallback',
        timedOut: true,
      });
      resolveSample(999);
      await vi.runAllTimersAsync();
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses a raw cached fallback when explicitly enabled', async () => {
    await expect(resolveTerrainHeight({
      sample: async () => undefined,
      cachedHeight: 80,
      cachedSemantics: 'raw',
    })).resolves.toEqual({
      height: 80,
      source: 'cached',
      timedOut: false,
    });
  });

  it('normalizes a rendered cached height exactly once', () => {
    expect(normalizeCachedTerrainHeight(900, 'rendered', 2, 100)).toBe(500);
    expect(normalizeCachedTerrainHeight(900, 'disabled', 2, 100)).toBeUndefined();
  });

  it('uses ellipsoid fallback when cached semantics are disabled', async () => {
    await expect(resolveTerrainHeight({
      sample: async () => undefined,
      cachedHeight: 900,
      cachedSemantics: 'disabled',
    })).resolves.toEqual({
      height: 0,
      source: 'ellipsoid-fallback',
      timedOut: false,
    });
  });

  it('uses the standard point framing for sampled terrain', () => {
    expect(terrainPointCameraFrame({
      height: 500,
      source: 'sampled',
      timedOut: false,
    }, 2, 0)).toMatchObject({
      range: TERRAIN_POINT_RANGE,
      minimumRange: TERRAIN_POINT_MIN_RANGE,
      pitchDeg: TERRAIN_POINT_PITCH_DEG,
      centerHeight: 1000,
      rawGroundHeight: 500,
    });
  });

  it('uses the point minimum range for an explicitly enabled cached height', () => {
    expect(terrainPointCameraFrame({
      height: 250,
      source: 'cached',
      timedOut: false,
    }, 2, 0)).toMatchObject({
      range: TERRAIN_POINT_RANGE,
      minimumRange: TERRAIN_POINT_MIN_RANGE,
      rawGroundHeight: 250,
    });
  });

  it('uses safe framing for an ellipsoid fallback', () => {
    expect(terrainPointCameraFrame({
      height: 0,
      source: 'ellipsoid-fallback',
      timedOut: true,
    }, 2, 0)).toMatchObject({
      range: TERRAIN_SAFE_FALLBACK_RANGE,
      minimumRange: TERRAIN_FALLBACK_MIN_RANGE,
      pitchDeg: TERRAIN_SAFE_FALLBACK_PITCH_DEG,
    });
  });

  it('keeps selected-region and overview clamps separate', () => {
    expect(terrainRegionCameraFrame(1, false).range).toBe(30_000);
    expect(terrainRegionCameraFrame(1, true).range).toBe(45_000);
    expect(terrainRegionCameraFrame(1_000_000, false).range).toBe(450_000);
    expect(terrainRegionCameraFrame(1_000_000, true).range).toBe(900_000);
    expect(terrainRegionCameraFrame(1, false).minimumRange)
      .toBe(TERRAIN_SELECTED_REGION_MIN_ZOOM_RANGE);
    expect(terrainRegionCameraFrame(1, true).minimumRange)
      .toBe(TERRAIN_OVERVIEW_MIN_ZOOM_RANGE);
  });

  it('clamps zoom to 18–20 percent and preserves direction', () => {
    expect(clampTerrainZoomFactor(0.3)).toBe(0.2);
    expect(clampTerrainZoomFactor(-0.3)).toBe(-0.2);
    expect(clampTerrainZoomFactor(0.1)).toBe(0.18);
    expect(clampTerrainZoomFactor(Number.NaN)).toBe(0);
    expect(clampTerrainRange(100, 30, 450)).toBe(100);
  });

  it('exports the independent timeout defaults', () => {
    expect(TERRAIN_FIRST_POINT_TIMEOUT_MS).toBe(5_000);
    expect(TERRAIN_NEXT_POINT_TIMEOUT_MS).toBe(2_500);
  });
});

describe('terrain focus-relative zoom', () => {
  it('zooms a point at 11 km inward by a positive amount', () => {
    expect(terrainZoomAmount(11_000, 0.2, TERRAIN_POINT_MIN_RANGE)).toBeGreaterThan(0);
  });

  it('zooms a point at 11 km inward by 2.2 km', () => {
    expect(terrainZoomAmount(11_000, 0.2, TERRAIN_POINT_MIN_RANGE)).toBe(2_200);
  });

  it('does not cross the 4 km point minimum', () => {
    expect(terrainZoomAmount(4_500, 0.2, TERRAIN_POINT_MIN_RANGE)).toBe(500);
  });

  it('returns zero when the point is already at its minimum', () => {
    expect(terrainZoomAmount(4_000, 0.2, TERRAIN_POINT_MIN_RANGE)).toBe(0);
  });

  it('lets fallback framing zoom inward until its independent 12 km minimum', () => {
    expect(terrainZoomAmount(24_000, 0.2, TERRAIN_FALLBACK_MIN_RANGE)).toBe(4_800);
    expect(terrainZoomAmount(13_000, 0.2, TERRAIN_FALLBACK_MIN_RANGE)).toBe(1_000);
  });

  it('lets a selected region at 30 km zoom inward', () => {
    expect(terrainZoomAmount(30_000, 0.2, TERRAIN_SELECTED_REGION_MIN_ZOOM_RANGE)).toBe(6_000);
  });

  it('does not move an overview below 30 km', () => {
    expect(terrainZoomAmount(31_000, 0.2, TERRAIN_OVERVIEW_MIN_ZOOM_RANGE)).toBe(1_000);
    expect(terrainZoomAmount(30_000, 0.2, TERRAIN_OVERVIEW_MIN_ZOOM_RANGE)).toBe(0);
  });

  it('does not apply the minimum range to zoom-out', () => {
    expect(terrainZoomAmount(4_000, -0.2, TERRAIN_POINT_MIN_RANGE)).toBe(800);
  });

  it('returns zero for invalid range, factor, or minimum', () => {
    expect(terrainZoomAmount(Number.NaN, 0.2, 4_000)).toBe(0);
    expect(terrainZoomAmount(11_000, Number.POSITIVE_INFINITY, 4_000)).toBe(0);
    expect(terrainZoomAmount(11_000, 0.2, -1)).toBe(0);
  });

  it('preserves factor direction through normalization', () => {
    expect(clampTerrainZoomFactor(0.3)).toBe(0.2);
    expect(clampTerrainZoomFactor(-0.3)).toBe(-0.2);
    expect(terrainZoomAmount(11_000, 0.3, 4_000))
      .toBe(terrainZoomAmount(11_000, -0.3, 4_000));
  });
});

describe('current terrain point frame race contract', () => {
  const options = (sample: () => Promise<number>, isCurrent: () => boolean) => ({
    sample,
    timeoutMs: 100,
    exaggeration: 2,
    relativeHeight: 0,
    cachedSemantics: 'disabled' as const,
    isCurrent,
  });

  it('returns a frame when the operation remains current', async () => {
    await expect(resolveCurrentTerrainPointFrame(
      options(async () => 100, () => true),
    )).resolves.toMatchObject({ source: 'sampled', centerHeight: 200 });
  });

  it('returns null when the session becomes stale while sampling is pending', async () => {
    const sample = deferred<number>();
    let current = true;
    const result = resolveCurrentTerrainPointFrame(options(() => sample.promise, () => current));
    current = false;
    sample.resolve(100);
    await expect(result).resolves.toBeNull();
  });

  it('returns null when the camera operation becomes stale', async () => {
    const sample = deferred<number>();
    let cameraOperation = 1;
    const result = resolveCurrentTerrainPointFrame(
      options(() => sample.promise, () => cameraOperation === 1),
    );
    cameraOperation = 2;
    sample.resolve(100);
    await expect(result).resolves.toBeNull();
  });

  it('returns null when unmount makes the operation non-current', async () => {
    const sample = deferred<number>();
    let mounted = true;
    const result = resolveCurrentTerrainPointFrame(options(() => sample.promise, () => mounted));
    mounted = false;
    sample.resolve(100);
    await expect(result).resolves.toBeNull();
  });

  it('returns null when the selected target changes while sampling is pending', async () => {
    const sample = deferred<number>();
    let targetId = 'target-a';
    const result = resolveCurrentTerrainPointFrame(
      options(() => sample.promise, () => targetId === 'target-a'),
    );
    targetId = 'target-b';
    sample.resolve(100);
    await expect(result).resolves.toBeNull();
  });

  it('returns a fallback frame after timeout while the operation remains current', async () => {
    vi.useFakeTimers();
    try {
      const sample = deferred<number>();
      const result = resolveCurrentTerrainPointFrame(options(() => sample.promise, () => true));
      await vi.advanceTimersByTimeAsync(100);
      await expect(result).resolves.toMatchObject({
        source: 'ellipsoid-fallback',
        range: TERRAIN_SAFE_FALLBACK_RANGE,
        minimumRange: TERRAIN_FALLBACK_MIN_RANGE,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not produce a second frame when a sample resolves after timeout', async () => {
    vi.useFakeTimers();
    try {
      const sample = deferred<number>();
      const isCurrent = vi.fn(() => true);
      const result = resolveCurrentTerrainPointFrame(options(() => sample.promise, isCurrent));
      await vi.advanceTimersByTimeAsync(100);
      const firstFrame = await result;
      sample.resolve(999);
      await Promise.resolve();
      expect(firstFrame).toMatchObject({ source: 'ellipsoid-fallback' });
      expect(isCurrent).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns a fallback frame instead of throwing when sampling rejects', async () => {
    const sample = deferred<number>();
    const result = resolveCurrentTerrainPointFrame(options(() => sample.promise, () => true));
    sample.reject(new Error('network failed'));
    await expect(result).resolves.toMatchObject({
      source: 'ellipsoid-fallback',
      minimumRange: TERRAIN_FALLBACK_MIN_RANGE,
    });
  });
});

describe('immediate terrain camera path', () => {
  it('resets the transform and completes strictly after lookAt', () => {
    const calls: string[] = [];
    const camera = {
      lookAt: vi.fn(() => calls.push('lookAt')),
      lookAtTransform: vi.fn(() => calls.push('lookAtTransform')),
    };
    const complete = vi.fn(() => calls.push('complete'));

    expect(applyImmediateTerrainCamera(
      camera,
      'center',
      'offset',
      'identity',
      () => true,
      complete,
    )).toBe(true);
    expect(camera.lookAt).toHaveBeenCalledOnce();
    expect(camera.lookAtTransform).toHaveBeenCalledWith('identity');
    expect(calls).toEqual(['lookAt', 'lookAtTransform', 'complete']);
  });

  it('does not touch the immediate camera path for a stale operation', () => {
    const camera = {
      lookAt: vi.fn(),
      lookAtTransform: vi.fn(),
    };
    const complete = vi.fn();

    expect(applyImmediateTerrainCamera(
      camera,
      'center',
      'offset',
      'identity',
      () => false,
      complete,
    )).toBe(false);
    expect(camera.lookAt).not.toHaveBeenCalled();
    expect(camera.lookAtTransform).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });
});
