export type TerrainHeightSource =
  | 'sampled'
  | 'cached'
  | 'ellipsoid-fallback';

export type TerrainHeightResult = {
  height: number;
  source: TerrainHeightSource;
  timedOut: boolean;
};

export type CachedHeightSemantics = 'raw' | 'rendered' | 'disabled';
export type TerrainCameraTargetKind = 'point' | 'region' | 'overview';

export const TERRAIN_POINT_RANGE = 11_000;
export const TERRAIN_POINT_MIN_RANGE = 4_000;
export const TERRAIN_POINT_HEADING_DEG = 30;
export const TERRAIN_POINT_PITCH_DEG = -25;
export const TERRAIN_SELECTED_REGION_MIN_RANGE = 30_000;
export const TERRAIN_SELECTED_REGION_MAX_RANGE = 450_000;
export const TERRAIN_SELECTED_REGION_MIN_ZOOM_RANGE = 15_000;
export const TERRAIN_OVERVIEW_MIN_RANGE = 45_000;
export const TERRAIN_OVERVIEW_MAX_RANGE = 900_000;
export const TERRAIN_OVERVIEW_MIN_ZOOM_RANGE = 30_000;
export const TERRAIN_REGION_HEADING_DEG = 25;
export const TERRAIN_REGION_PITCH_DEG = -32;
export const TERRAIN_FIRST_POINT_TIMEOUT_MS = 5_000;
export const TERRAIN_NEXT_POINT_TIMEOUT_MS = 2_500;
export const TERRAIN_SAFE_FALLBACK_RANGE = 24_000;
export const TERRAIN_FALLBACK_MIN_RANGE = 12_000;
export const TERRAIN_SAFE_FALLBACK_PITCH_DEG = -45;
export const TERRAIN_ZOOM_FACTOR_MIN = 0.18;
export const TERRAIN_ZOOM_FACTOR_MAX = 0.2;

export interface TerrainHeightResolutionOptions {
  sample?: () => Promise<number | null | undefined>;
  timeoutMs?: number;
  cachedHeight?: number | null;
  cachedSemantics?: CachedHeightSemantics;
  exaggeration?: number;
  relativeHeight?: number;
}

export interface TerrainCameraFrame {
  range: number;
  minimumRange: number;
  headingDeg: number;
  pitchDeg: number;
  centerHeight: number;
  source?: TerrainHeightSource;
  rawGroundHeight?: number;
}

export interface TerrainCameraDebugState {
  targetKind: TerrainCameraTargetKind;
  heightSource?: TerrainHeightSource;
  rawGroundHeight?: number;
  renderedCenterHeight?: number;
  range: number;
  pitchDeg: number;
  headingDeg: number;
  exaggeration: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface ResolveCurrentPointFrameOptions
  extends TerrainHeightResolutionOptions {
  exaggeration: number;
  relativeHeight: number;
  isCurrent: () => boolean;
}

export interface ImmediateTerrainCameraLike<
  TCenter,
  TOffset,
  TTransform,
> {
  lookAt: (center: TCenter, offset: TOffset) => void;
  lookAtTransform: (transform: TTransform) => void;
}

export function toRenderedTerrainHeight(
  groundHeight: number,
  exaggeration: number,
  relativeHeight: number,
): number {
  return relativeHeight + (groundHeight - relativeHeight) * exaggeration;
}

export function toRawTerrainHeight(
  renderedHeight: number,
  exaggeration: number,
  relativeHeight: number,
): number {
  if (!Number.isFinite(exaggeration) || exaggeration === 0) return relativeHeight;
  return relativeHeight + (renderedHeight - relativeHeight) / exaggeration;
}

export function normalizeCachedTerrainHeight(
  cachedHeight: number | undefined,
  semantics: CachedHeightSemantics,
  exaggeration: number,
  relativeHeight: number,
): number | undefined {
  if (typeof cachedHeight !== 'number' || !Number.isFinite(cachedHeight) || semantics === 'disabled') return undefined;
  if (semantics === 'raw') return cachedHeight;
  if (!Number.isFinite(exaggeration) || exaggeration === 0) return undefined;
  return relativeHeight + (cachedHeight - relativeHeight) / exaggeration;
}

function finiteHeight(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

async function resolveWithTimeout(
  promise: Promise<number | null | undefined>,
  timeoutMs: number,
): Promise<{ value: number | undefined; timedOut: boolean }> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ value: undefined, timedOut: true });
    }, timeoutMs);

    promise
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ value: finiteHeight(value), timedOut: false });
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ value: undefined, timedOut: false });
      });
  });
}

export async function resolveTerrainHeight(
  options: TerrainHeightResolutionOptions = {},
): Promise<TerrainHeightResult> {
  const timeoutMs = options.timeoutMs ?? TERRAIN_FIRST_POINT_TIMEOUT_MS;
  const exaggeration = options.exaggeration ?? 2;
  const relativeHeight = options.relativeHeight ?? 0;
  let sampledHeight: number | undefined;
  let timedOut = false;

  if (options.sample) {
    try {
      const result = await resolveWithTimeout(options.sample(), timeoutMs);
      sampledHeight = result.value;
      timedOut = result.timedOut;
    } catch {
      sampledHeight = undefined;
    }
  }

  if (sampledHeight !== undefined) {
    return { height: sampledHeight, source: 'sampled', timedOut };
  }

  const cachedHeight = normalizeCachedTerrainHeight(
    options.cachedHeight ?? undefined,
    options.cachedSemantics ?? 'disabled',
    exaggeration,
    relativeHeight,
  );
  if (cachedHeight !== undefined) {
    return { height: cachedHeight, source: 'cached', timedOut };
  }

  return { height: 0, source: 'ellipsoid-fallback', timedOut };
}

export function terrainPointCameraFrame(
  heightResult: TerrainHeightResult,
  exaggeration: number,
  relativeHeight: number,
): TerrainCameraFrame {
  const fallback = heightResult.source === 'ellipsoid-fallback';
  return {
    range: fallback ? TERRAIN_SAFE_FALLBACK_RANGE : TERRAIN_POINT_RANGE,
    minimumRange: fallback ? TERRAIN_FALLBACK_MIN_RANGE : TERRAIN_POINT_MIN_RANGE,
    headingDeg: TERRAIN_POINT_HEADING_DEG,
    pitchDeg: fallback ? TERRAIN_SAFE_FALLBACK_PITCH_DEG : TERRAIN_POINT_PITCH_DEG,
    centerHeight: toRenderedTerrainHeight(
      heightResult.height,
      exaggeration,
      relativeHeight,
    ),
    source: heightResult.source,
    rawGroundHeight: heightResult.height,
  };
}

export async function resolveCurrentTerrainPointFrame(
  options: ResolveCurrentPointFrameOptions,
): Promise<TerrainCameraFrame | null> {
  const result = await resolveTerrainHeight(options);
  if (!options.isCurrent()) return null;
  return terrainPointCameraFrame(
    result,
    options.exaggeration,
    options.relativeHeight,
  );
}

export function clampTerrainRange(
  range: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(Math.max(range, minimum), maximum);
}

export function terrainRegionCameraFrame(
  radius: number,
  overview: boolean,
): TerrainCameraFrame {
  return {
    range: clampTerrainRange(
      radius * 2.8,
      overview ? TERRAIN_OVERVIEW_MIN_RANGE : TERRAIN_SELECTED_REGION_MIN_RANGE,
      overview ? TERRAIN_OVERVIEW_MAX_RANGE : TERRAIN_SELECTED_REGION_MAX_RANGE,
    ),
    minimumRange: overview
      ? TERRAIN_OVERVIEW_MIN_ZOOM_RANGE
      : TERRAIN_SELECTED_REGION_MIN_ZOOM_RANGE,
    headingDeg: TERRAIN_REGION_HEADING_DEG,
    pitchDeg: TERRAIN_REGION_PITCH_DEG,
    centerHeight: 0,
    source: undefined,
  };
}

export function clampTerrainZoomFactor(factor: number): number {
  if (!Number.isFinite(factor) || factor === 0) return 0;
  const sign = factor < 0 ? -1 : 1;
  const magnitude = Math.min(
    Math.max(Math.abs(factor), TERRAIN_ZOOM_FACTOR_MIN),
    TERRAIN_ZOOM_FACTOR_MAX,
  );
  return sign * magnitude;
}

export function terrainZoomAmount(
  currentRange: number,
  factor: number,
  minimumRange: number,
): number {
  const normalizedFactor = clampTerrainZoomFactor(factor);
  if (
    !Number.isFinite(currentRange)
    || !Number.isFinite(minimumRange)
    || currentRange <= 0
    || minimumRange < 0
    || normalizedFactor === 0
  ) {
    return 0;
  }

  const requestedAmount = currentRange * Math.abs(normalizedFactor);
  if (normalizedFactor < 0) return requestedAmount;
  return Math.max(
    0,
    Math.min(requestedAmount, currentRange - minimumRange),
  );
}

export function applyImmediateTerrainCamera<
  TCenter,
  TOffset,
  TTransform,
>(
  camera: ImmediateTerrainCameraLike<TCenter, TOffset, TTransform>,
  center: TCenter,
  offset: TOffset,
  identityTransform: TTransform,
  isCurrent: () => boolean,
  complete?: () => void,
): boolean {
  if (!isCurrent()) return false;
  camera.lookAt(center, offset);
  camera.lookAtTransform(identityTransform);
  complete?.();
  return true;
}
