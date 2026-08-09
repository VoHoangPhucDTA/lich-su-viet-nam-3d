import { describe, expect, it } from 'vitest';
import { createTerrainPointDataSource } from './terrainPointDataSource';

describe('terrain point datasource', () => {
  it('creates five unclustered explicitly identified DBP targets', () => {
    const targets = ['Him Lam', 'Độc Lập', 'A1', 'Mường Thanh', 'Hồng Cúm'].map((label, index) => ({
      id: `dbp-${index}`,
      sourceIndex: index,
      kind: 'point' as const,
      label,
      position: { lat: 21.38 + index / 100, lng: 103.01 + index / 100 },
    }));
    const dataSource = createTerrainPointDataSource(17, targets);

    expect(dataSource.clustering.enabled).toBe(false);
    expect(dataSource.entities.values).toHaveLength(5);
    expect(dataSource.entities.values.map((entity) => ({
      id: entity.id,
      sessionId: entity.properties?.terrainSessionId?.getValue(),
      targetId: entity.properties?.terrainTargetId?.getValue(),
      kind: entity.properties?.terrainTargetKind?.getValue(),
    }))).toEqual(targets.map((target) => ({
      id: target.id,
      sessionId: 17,
      targetId: target.id,
      kind: 'point',
    })));
  });
});
