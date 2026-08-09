import { Entity } from 'cesium';
import { describe, expect, it, vi } from 'vitest';
import {
  MAP_CLUSTER_BADGE_BACKGROUND,
  MAP_CLUSTER_PICK_KIND,
  attachMapClusterPickPayload,
  clusterEntitiesFromPick,
  createMapClusterPickPayload,
  createMapClusterBadgeDataUrl,
  formatMapClusterCount,
  handleOrdinaryMapPick,
  isMapClusterPick,
  isMapClusterPickPayload,
  resolveMapClusterVisual,
} from './mapClusterBadge';

function decodedSvg(count: number): string {
  return decodeURIComponent(createMapClusterBadgeDataUrl(count).split(',')[1]);
}

describe('map cluster badge', () => {
  it.each([[2, '2'], [35, '35'], [100, '99+'], [248, '99+']])(
    'formats count %s as %s',
    (count, expected) => expect(formatMapClusterCount(count)).toBe(expected),
  );

  it('creates a valid SVG data URL with a neutral non-category badge color', () => {
    const url = createMapClusterBadgeDataUrl(35);
    expect(url).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(decodedSvg(35)).toContain('>35<');
    expect(MAP_CLUSTER_BADGE_BACKGROUND).toBe('#6f3b2f');
    expect(MAP_CLUSTER_BADGE_BACKGROUND).not.toBe('#9f1d2d');
    expect(MAP_CLUSTER_BADGE_BACKGROUND).not.toBe('#2f5d8a');
    expect(MAP_CLUSTER_BADGE_BACKGROUND).not.toBe('#c29b4b');
    expect(MAP_CLUSTER_BADGE_BACKGROUND).not.toBe('#2f7a57');
  });

  it('turns on the billboard and turns off the naked label', () => {
    expect(resolveMapClusterVisual(2)).toMatchObject({
      billboard: { show: true, width: 42, height: 42 },
      label: { show: false },
    });
  });

  it('creates and validates one explicit payload for the exact clustered entities', () => {
    const entities = [new Entity({ id: 'a' }), new Entity({ id: 'b' }), new Entity({ id: 'c' })];
    const payload = createMapClusterPickPayload(entities);

    expect(payload.kind).toBe(MAP_CLUSTER_PICK_KIND);
    expect(payload.entities).toEqual(entities);
    expect(payload.entities).not.toBe(entities);
    expect(isMapClusterPickPayload(payload)).toBe(true);
    expect(clusterEntitiesFromPick(payload)).toEqual(entities);
    expect(isMapClusterPickPayload({ kind: MAP_CLUSTER_PICK_KIND, entities: [entities[0]] })).toBe(false);
    expect(isMapClusterPickPayload({ kind: 'terrain-target', entities })).toBe(false);
    expect(isMapClusterPickPayload({ kind: MAP_CLUSTER_PICK_KIND, entities: [{ id: 'a' }, { id: 'b' }] })).toBe(false);
  });

  it('attaches the same explicit payload to billboard, label, and point on every cluster rebuild', () => {
    const firstEntities = [new Entity({ id: 'a' }), new Entity({ id: 'b' })];
    const rebuiltEntities = [new Entity({ id: 'c' }), new Entity({ id: 'd' }), new Entity({ id: 'e' })];
    const cluster = { billboard: { id: undefined }, label: { id: undefined }, point: { id: undefined } };

    const firstPayload = attachMapClusterPickPayload(firstEntities, cluster);
    expect(cluster.billboard.id).toBe(firstPayload);
    expect(cluster.label.id).toBe(firstPayload);
    expect(cluster.point.id).toBe(firstPayload);
    expect(clusterEntitiesFromPick(cluster.billboard.id)).toEqual(firstEntities);

    const rebuiltPayload = attachMapClusterPickPayload(rebuiltEntities, cluster);
    expect(rebuiltPayload).not.toBe(firstPayload);
    expect(cluster.billboard.id).toBe(rebuiltPayload);
    expect(cluster.label.id).toBe(rebuiltPayload);
    expect(cluster.point.id).toBe(rebuiltPayload);
    expect(clusterEntitiesFromPick(cluster.point.id)).toEqual(rebuiltEntities);
  });

  it('runs the cluster handler branch for an explicit payload without selecting an event', () => {
    const entities = [new Entity({ id: 'a' }), new Entity({ id: 'b' }), new Entity({ id: 'c' })];
    const focusCluster = vi.fn();
    const selectEvent = vi.fn();

    expect(handleOrdinaryMapPick(
      { id: createMapClusterPickPayload(entities) },
      { resolveEvent: () => undefined, focusCluster, selectEvent },
    )).toBe('cluster');
    expect(focusCluster).toHaveBeenCalledOnce();
    expect(focusCluster).toHaveBeenCalledWith(entities);
    expect(selectEvent).not.toHaveBeenCalled();
  });

  it('keeps a normal marker on the event-selection path and away from cluster focus', () => {
    const marker = new Entity({ id: 'event-marker' });
    const event = { id: 'event' };
    const focusCluster = vi.fn();
    const selectEvent = vi.fn();

    expect(handleOrdinaryMapPick(
      { id: marker },
      { resolveEvent: (entity) => entity === marker ? event : undefined, focusCluster, selectEvent },
    )).toBe('event');
    expect(selectEvent).toHaveBeenCalledWith(event);
    expect(focusCluster).not.toHaveBeenCalled();
  });

  it('keeps the legacy Entity array only as a strict compatibility fallback', () => {
    const entities = [new Entity({ id: 'a' }), new Entity({ id: 'b' })];
    expect(isMapClusterPick(entities)).toBe(true);
    expect(clusterEntitiesFromPick(entities)).toEqual(entities);
    expect(isMapClusterPick([entities[0]])).toBe(false);
    expect(isMapClusterPick([{}, {}])).toBe(false);
    expect(isMapClusterPick({})).toBe(false);
  });

  it('does not classify an ordinary Entity or Terrain target identity as a cluster', () => {
    const terrainTarget = new Entity({ id: 'terrain-target' });
    expect(clusterEntitiesFromPick(terrainTarget)).toBeNull();
    expect(clusterEntitiesFromPick({ kind: 'terrain-target', entities: [terrainTarget, terrainTarget] })).toBeNull();
  });
});
