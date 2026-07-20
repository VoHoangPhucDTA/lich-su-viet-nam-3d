import { describe, expect, it } from 'vitest';
import { INITIAL_TERRAIN_STATE, terrainReducer } from './terrainState';

const target = {
  id: 'event-1:point:0',
  kind: 'point' as const,
  label: 'Điểm 1',
  position: { lat: 16, lng: 108 },
  sourceIndex: 0,
};

describe('terrainReducer', () => {
  it('transitions idle → entering → active → exiting → idle', () => {
    const entering = terrainReducer(INITIAL_TERRAIN_STATE, {
      type: 'OPEN', sessionId: 1, eventId: 'event-1', targets: [target],
    });
    expect(entering).toMatchObject({ mode: 'entering', providerStatus: 'loading', sessionId: 1, overview: true });

    const providerReady = terrainReducer(entering, { type: 'PROVIDER_READY', sessionId: 1 });
    const geometryReady = terrainReducer(providerReady, { type: 'SESSION_GEOMETRY_READY', sessionId: 1 });
    const active = terrainReducer(geometryReady, { type: 'ENTER_READY', sessionId: 1 });
    expect(active).toMatchObject({ mode: 'active', providerStatus: 'ready' });

    const exiting = terrainReducer(active, { type: 'EXIT', sessionId: 1 });
    expect(exiting.mode).toBe('exiting');
    expect(terrainReducer(exiting, { type: 'EXIT_COMPLETE', sessionId: 1 }))
      .toEqual(INITIAL_TERRAIN_STATE);
  });

  it('transitions entering to error and allows deterministic exit', () => {
    const entering = terrainReducer(INITIAL_TERRAIN_STATE, {
      type: 'OPEN', sessionId: 2, eventId: 'event-2', targets: [target],
    });
    const error = terrainReducer(entering, {
      type: 'ENTER_ERROR',
      sessionId: 2,
      error: { code: 'provider_load_failed', message: 'Không tải được địa hình.' },
    });
    expect(error).toMatchObject({ mode: 'error', providerStatus: 'error', sessionId: 2 });
    const exiting = terrainReducer(error, { type: 'EXIT', sessionId: 2 });
    expect(exiting.mode).toBe('exiting');
    expect(terrainReducer(exiting, { type: 'EXIT_COMPLETE', sessionId: 2 }))
      .toEqual(INITIAL_TERRAIN_STATE);
  });

  it('retries from error with a new session', () => {
    const rejected = terrainReducer(INITIAL_TERRAIN_STATE, {
      type: 'OPEN_REJECTED',
      sessionId: 5,
      eventId: 'event-5',
      error: { code: 'no_valid_targets', message: 'Không có vị trí hợp lệ.' },
    });
    const retry = terrainReducer(rejected, {
      type: 'OPEN', sessionId: 6, eventId: 'event-5', targets: [target],
    });
    expect(retry).toMatchObject({
      mode: 'entering',
      providerStatus: 'loading',
      sessionId: 6,
      error: null,
    });
  });

  it('ignores stale callbacks and old errors after a new session opens', () => {
    const first = terrainReducer(INITIAL_TERRAIN_STATE, {
      type: 'OPEN', sessionId: 3, eventId: 'event-a', targets: [target],
    });
    const second = terrainReducer(first, {
      type: 'OPEN', sessionId: 4, eventId: 'event-b', targets: [target],
    });
    expect(terrainReducer(second, { type: 'ENTER_READY', sessionId: 3 })).toBe(second);
    expect(terrainReducer(second, {
      type: 'ENTER_ERROR',
      sessionId: 3,
      error: { code: 'camera_failed', message: 'stale' },
    })).toBe(second);
    expect(terrainReducer(second, { type: 'EXIT_COMPLETE', sessionId: 3 })).toBe(second);
  });

  it('does not change state for duplicate completion', () => {
    expect(terrainReducer(INITIAL_TERRAIN_STATE, { type: 'EXIT_COMPLETE', sessionId: 1 }))
      .toBe(INITIAL_TERRAIN_STATE);
  });

  it('tracks geometry readiness and target/overview selection only when active', () => {
    const targetTwo = { ...target, id: 'event-1:point:1' };
    const entering = terrainReducer(INITIAL_TERRAIN_STATE, {
      type: 'OPEN', sessionId: 7, eventId: 'event-1', targets: [target, targetTwo],
    });
    const geometryReady = terrainReducer(entering, { type: 'REGION_GEOMETRY_READY' });
    expect(geometryReady.geometryStatus).toBe('ready');
    const providerReady = terrainReducer(geometryReady, { type: 'PROVIDER_READY', sessionId: 7 });
    const sessionGeometryReady = terrainReducer(providerReady, {
      type: 'SESSION_GEOMETRY_READY', sessionId: 7,
    });
    const active = terrainReducer(sessionGeometryReady, { type: 'ENTER_READY', sessionId: 7 });
    const selected = terrainReducer(active, {
      type: 'SELECT_TARGET', sessionId: 7, targetId: targetTwo.id,
    });
    expect(selected).toMatchObject({ selectedTargetId: targetTwo.id, overview: false });
    const overview = terrainReducer(selected, { type: 'SHOW_OVERVIEW', sessionId: 7 });
    expect(overview).toMatchObject({ selectedTargetId: null, overview: true });
    expect(terrainReducer(entering, { type: 'SELECT_TARGET', sessionId: 7, targetId: target.id }))
      .toBe(entering);
  });

  it('activates only after provider, geometry, and overview are ready in either order', () => {
    const entering = terrainReducer(INITIAL_TERRAIN_STATE, {
      type: 'OPEN', sessionId: 8, eventId: 'event-8', targets: [target],
    });
    const providerFirst = terrainReducer(entering, { type: 'PROVIDER_READY', sessionId: 8 });
    expect(terrainReducer(providerFirst, { type: 'ENTER_READY', sessionId: 8 }).mode).toBe('entering');
    const providerThenGeometry = terrainReducer(
      terrainReducer(providerFirst, { type: 'ENTER_READY', sessionId: 8 }),
      { type: 'SESSION_GEOMETRY_READY', sessionId: 8 },
    );
    expect(providerThenGeometry.mode).toBe('active');

    const next = terrainReducer(providerThenGeometry, {
      type: 'OPEN', sessionId: 9, eventId: 'event-9', targets: [target],
    });
    const geometryFirst = terrainReducer(next, { type: 'SESSION_GEOMETRY_READY', sessionId: 9 });
    const withOverview = terrainReducer(geometryFirst, { type: 'ENTER_READY', sessionId: 9 });
    expect(withOverview.mode).toBe('entering');
    expect(terrainReducer(withOverview, { type: 'PROVIDER_READY', sessionId: 9 }).mode).toBe('active');
    expect(terrainReducer(withOverview, { type: 'PROVIDER_READY', sessionId: 8 })).toBe(withOverview);
  });
});
