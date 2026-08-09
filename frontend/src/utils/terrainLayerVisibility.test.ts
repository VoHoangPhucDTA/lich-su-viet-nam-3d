import { describe, expect, it } from 'vitest';
import { ordinaryMapLayersVisibleForTerrainMode } from './terrainLayerVisibility';

describe('ordinary layer visibility during terrain', () => {
  it('hides entering/active sessions and restores exit/idle', () => {
    const base = {
      id: 1,
      eventId: 'event',
      targets: [],
      selectedTargetId: null,
      overview: true,
      cameraRequestId: 1,
    };
    expect(ordinaryMapLayersVisibleForTerrainMode(null)).toBe(true);
    expect(ordinaryMapLayersVisibleForTerrainMode({ ...base, mode: 'entering' })).toBe(false);
    expect(ordinaryMapLayersVisibleForTerrainMode({ ...base, mode: 'active', overview: true, selectedTargetId: null })).toBe(false);
    expect(ordinaryMapLayersVisibleForTerrainMode({ ...base, mode: 'exiting' })).toBe(true);
  });
});
