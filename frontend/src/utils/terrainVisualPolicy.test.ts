import { describe, expect, it } from 'vitest';
import {
  resolveTerrainVisualPolicy,
  restoreTerrainPolygonProperties,
  snapshotTerrainPolygonProperties,
} from './terrainVisualPolicy';

describe('resolveTerrainVisualPolicy', () => {
  it('preserves original properties while terrain is inactive', () => {
    expect(resolveTerrainVisualPolicy({
      terrainActive: false,
      viewKind: 'point',
      layer: 'administrative',
      selectedRelation: 'selected',
    })).toEqual({ preserveOriginal: true });
  });

  it('uses a light administrative fill in overview', () => {
    expect(resolveTerrainVisualPolicy({
      terrainActive: true,
      viewKind: 'overview',
      layer: 'administrative',
      selectedRelation: 'selected',
    })).toMatchObject({ fill: true, outline: true, fillAlpha: 0.1 });
  });

  it('uses a light selected-region fill', () => {
    expect(resolveTerrainVisualPolicy({
      terrainActive: true,
      viewKind: 'region',
      layer: 'terrain-region',
      selectedRelation: 'selected',
    })).toMatchObject({ show: true, fill: true, fillAlpha: 0.06 });
  });

  it('dims an unrelated terrain region', () => {
    expect(resolveTerrainVisualPolicy({
      terrainActive: true,
      viewKind: 'region',
      layer: 'terrain-region',
      selectedRelation: 'unrelated',
    })).toMatchObject({ show: true, fillAlpha: 0.02, outlineAlpha: 0.3 });
  });

  it('sets administrative fill false for a point target', () => {
    expect(resolveTerrainVisualPolicy({
      terrainActive: true,
      viewKind: 'point',
      layer: 'administrative',
      selectedRelation: 'related',
    })).toMatchObject({ fill: false });
  });

  it('keeps the administrative outline enabled for a point target', () => {
    expect(resolveTerrainVisualPolicy({
      terrainActive: true,
      viewKind: 'point',
      layer: 'administrative',
      selectedRelation: 'selected',
    })).toMatchObject({ outline: true, outlineAlpha: 0.38 });
  });

  it('hides terrain-region entities for a point target', () => {
    expect(resolveTerrainVisualPolicy({
      terrainActive: true,
      viewKind: 'point',
      layer: 'terrain-region',
      selectedRelation: 'related',
    })).toEqual({ preserveOriginal: false, show: false });
  });

  it.each(['overview', 'region'] as const)('restores fill true in %s', (viewKind) => {
    expect(resolveTerrainVisualPolicy({
      terrainActive: true,
      viewKind,
      layer: 'administrative',
      selectedRelation: 'related',
    }).fill).toBe(true);
  });
});

describe('terrain polygon property snapshots', () => {
  const properties = () => ({
    fill: { name: 'fill' },
    outline: { name: 'outline' },
    material: { name: 'material' },
    outlineColor: { name: 'outlineColor' },
    outlineWidth: { name: 'outlineWidth' },
    show: { name: 'show' },
  });

  it('snapshots only once for the same terrain session', () => {
    const polygon = properties();
    const first = snapshotTerrainPolygonProperties(7, polygon);
    polygon.fill = { name: 'changed' };
    const second = snapshotTerrainPolygonProperties(7, polygon, first);
    expect(second).toBe(first);
  });

  it('restores every exact original property reference', () => {
    const polygon = properties();
    const original = { ...polygon };
    const snapshot = snapshotTerrainPolygonProperties(9, polygon);
    Object.assign(polygon, {
      fill: {}, outline: {}, material: {}, outlineColor: {}, outlineWidth: {}, show: {},
    });

    expect(restoreTerrainPolygonProperties(9, polygon, snapshot)).toBe(true);
    expect(polygon.fill).toBe(original.fill);
    expect(polygon.outline).toBe(original.outline);
    expect(polygon.material).toBe(original.material);
    expect(polygon.outlineColor).toBe(original.outlineColor);
    expect(polygon.outlineWidth).toBe(original.outlineWidth);
    expect(polygon.show).toBe(original.show);
  });

  it('does nothing for a stale session', () => {
    const polygon = properties();
    const snapshot = snapshotTerrainPolygonProperties(3, polygon);
    const changedFill = { name: 'changed' };
    polygon.fill = changedFill;
    expect(restoreTerrainPolygonProperties(4, polygon, snapshot)).toBe(false);
    expect(polygon.fill).toBe(changedFill);
  });

  it('does nothing for a missing entity polygon', () => {
    const snapshot = snapshotTerrainPolygonProperties(3, properties());
    expect(restoreTerrainPolygonProperties(3, null, snapshot)).toBe(false);
  });
});
