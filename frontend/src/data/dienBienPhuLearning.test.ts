import { describe, expect, it } from 'vitest';
import type { TerrainPointTarget, TerrainTarget } from '../utils/terrainTargets';
import {
  DIEN_BIEN_PHU_CANONICAL_SLUG,
  DIEN_BIEN_PHU_LEARNING_LOCATIONS,
  getDienBienPhuLearningLocationByTargetLabel,
  getDienBienPhuLearningLocationForTarget,
  projectDienBienPhuLearningSessionTargets,
} from './dienBienPhuLearning';

function pointTarget(
  label: string,
  sourceIndex: number,
  id = `runtime-target-${sourceIndex}`,
): TerrainPointTarget {
  return {
    id,
    kind: 'point',
    label,
    position: { lat: 21.4 + sourceIndex / 100, lng: 103 + sourceIndex / 100 },
    sourceIndex,
  };
}

const rawDienBienPhuTargets: TerrainTarget[] = [
  pointTarget('Him Lam', 4),
  pointTarget('Đồi Độc Lập', 1),
  pointTarget('Mường Thanh', 3),
  pointTarget('Bản Kéo', 0),
  pointTarget('Điện Biên Phủ', 2),
];

describe('Điện Biên Phủ learning data', () => {
  it('contains exactly four unique learning records with complete structured sources', () => {
    expect(DIEN_BIEN_PHU_LEARNING_LOCATIONS).toHaveLength(4);
    expect(DIEN_BIEN_PHU_LEARNING_LOCATIONS.map(({ key }) => key)).toEqual([
      'him-lam',
      'doi-doc-lap',
      'ban-keo',
      'muong-thanh',
    ]);

    const keys = new Set(DIEN_BIEN_PHU_LEARNING_LOCATIONS.map(({ key }) => key));
    const labels = new Set(DIEN_BIEN_PHU_LEARNING_LOCATIONS.map(({ targetLabel }) => targetLabel));
    expect(keys.size).toBe(DIEN_BIEN_PHU_LEARNING_LOCATIONS.length);
    expect(labels.size).toBe(DIEN_BIEN_PHU_LEARNING_LOCATIONS.length);

    for (const location of DIEN_BIEN_PHU_LEARNING_LOCATIONS) {
      expect(location.sources.length, `${location.key}.sources`).toBeGreaterThan(0);
      for (const source of location.sources) {
        expect(source.organization.trim(), `${location.key}.source.organization`).not.toBe('');
        expect(source.title.trim(), `${location.key}.source.title`).not.toBe('');
        expect(source.url, `${location.key}.source.url`).toMatch(/^https:\/\//);
        expect(source.accessedAt, `${location.key}.source.accessedAt`).toBe('2026-08-13');
      }
    }

    const learningTargetLabels: readonly string[] = DIEN_BIEN_PHU_LEARNING_LOCATIONS
      .map(({ targetLabel }) => targetLabel);
    expect(learningTargetLabels).not.toContain('Điện Biên Phủ');
  });

  it('maps only exact canonical labels to semantic keys without source-index association', () => {
    expect(getDienBienPhuLearningLocationByTargetLabel('Him Lam')?.key).toBe('him-lam');
    expect(getDienBienPhuLearningLocationByTargetLabel('Đồi Độc Lập')?.key).toBe('doi-doc-lap');
    expect(getDienBienPhuLearningLocationByTargetLabel('Bản Kéo')?.key).toBe('ban-keo');
    expect(getDienBienPhuLearningLocationByTargetLabel('Mường Thanh')?.key).toBe('muong-thanh');
    expect(getDienBienPhuLearningLocationByTargetLabel('Điện Biên Phủ')).toBeNull();
    expect(getDienBienPhuLearningLocationByTargetLabel('Him Lam ')).toBeNull();
    expect(getDienBienPhuLearningLocationByTargetLabel('him lam')).toBeNull();

    expect(getDienBienPhuLearningLocationForTarget(
      DIEN_BIEN_PHU_CANONICAL_SLUG,
      pointTarget('Him Lam', 99, 'arbitrary-runtime-id'),
    )?.key).toBe('him-lam');
    expect(getDienBienPhuLearningLocationForTarget(
      DIEN_BIEN_PHU_CANONICAL_SLUG,
      pointTarget('Him Lam ', 0, 'him-lam'),
    )).toBeNull();
  });

  it('projects arbitrary runtime target IDs into four registry-ordered DBP targets', () => {
    const projection = projectDienBienPhuLearningSessionTargets(
      DIEN_BIEN_PHU_CANONICAL_SLUG,
      rawDienBienPhuTargets,
    );

    expect(projection.applies).toBe(true);
    expect(projection.complete).toBe(true);
    expect(projection.targets).toHaveLength(4);
    expect(projection.targets.map(({ label }) => label)).toEqual([
      'Him Lam',
      'Đồi Độc Lập',
      'Bản Kéo',
      'Mường Thanh',
    ]);
    expect(projection.targets.some(({ label }) => label === 'Điện Biên Phủ')).toBe(false);
  });

  it('does not apply without the exact canonical slug even when runtime IDs contain it', () => {
    const eventLikeTargets = [
      pointTarget('Him Lam', 0, `${DIEN_BIEN_PHU_CANONICAL_SLUG}:point:0`),
      pointTarget('Đồi Độc Lập', 1, `event:${DIEN_BIEN_PHU_CANONICAL_SLUG}`),
    ];
    const missingSlug = projectDienBienPhuLearningSessionTargets(undefined, eventLikeTargets);
    const eventLikeIdAsSlug = projectDienBienPhuLearningSessionTargets(
      `runtime-event:${DIEN_BIEN_PHU_CANONICAL_SLUG}`,
      eventLikeTargets,
    );

    expect(missingSlug).toEqual({ applies: false, complete: false, targets: eventLikeTargets });
    expect(missingSlug.targets).toBe(eventLikeTargets);
    expect(eventLikeIdAsSlug).toEqual({ applies: false, complete: false, targets: eventLikeTargets });
    expect(eventLikeIdAsSlug.targets).toBe(eventLikeTargets);
    expect(getDienBienPhuLearningLocationForTarget(
      undefined,
      pointTarget('Him Lam', 0),
    )).toBeNull();
  });

  it('marks duplicate or missing exact labels incomplete and emits at most one target per key', () => {
    const duplicateProjection = projectDienBienPhuLearningSessionTargets(
      DIEN_BIEN_PHU_CANONICAL_SLUG,
      [...rawDienBienPhuTargets, pointTarget('Him Lam', 42, 'duplicate-him-lam')],
    );
    expect(duplicateProjection.applies).toBe(true);
    expect(duplicateProjection.complete).toBe(false);
    expect(duplicateProjection.targets).toHaveLength(4);
    expect(duplicateProjection.targets.filter(({ label }) => label === 'Him Lam')).toHaveLength(1);

    const missingProjection = projectDienBienPhuLearningSessionTargets(
      DIEN_BIEN_PHU_CANONICAL_SLUG,
      rawDienBienPhuTargets.filter(({ label }) => label !== 'Bản Kéo'),
    );
    expect(missingProjection.applies).toBe(true);
    expect(missingProjection.complete).toBe(false);
    expect(missingProjection.targets.map(({ label }) => label)).toEqual([
      'Him Lam',
      'Đồi Độc Lập',
      'Mường Thanh',
    ]);
  });
});
