import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeTerrainTargets } from './terrainTargets';

const point = (label: string, lat = 16, lng = 108) => ({ label, lat, lng });

interface CanonicalTerrainFixture {
  id: string;
  mapData: unknown;
  display: { showOnMap: boolean };
}

const canonicalEvents = readFileSync(
  '../crawData/stage4b_curate_tree/output/phase2/core_events.jsonl',
  'utf8',
)
  .split(/\r?\n/u)
  .filter(Boolean)
  .map((line) => JSON.parse(line) as CanonicalTerrainFixture);

function canonicalEvent(id: string): CanonicalTerrainFixture | undefined {
  return canonicalEvents.find((event) => event.id === id);
}

describe('normalizeTerrainTargets', () => {
  it('keeps the canonical 1287–1288 hotfix as four point targets without regions', () => {
    const canonical = canonicalEvent('khang-chien-chong-quan-nguyen-1287-1288');

    expect(canonical).toBeDefined();
    expect(canonical?.display.showOnMap).toBe(true);
    const result = normalizeTerrainTargets(canonical?.id ?? '', canonical?.mapData);

    expect(result).toMatchObject({ canonicalGeoType: 'multi_point', eligible: true, reason: null });
    expect(result.targets.map((target) => `${target.kind}:${target.label}`)).toEqual([
      'point:Bạch Đằng',
      'point:Cửa Lục',
      'point:Thăng Long',
      'point:Vân Đồn',
    ]);
    expect(result.targets.some((target) => target.kind === 'region')).toBe(false);
  });

  it.each([
    ['chien-dich-dien-bien-phu-1954', 'multi_point', 5, 0],
    ['khang-chien-chong-quan-nguyen-1287-1288', 'multi_point', 4, 0],
    ['chien-dich-tay-nguyen-1975', 'multi_polygon', 0, 5],
    ['khang-chien-chong-quan-xiem-1784-1785', 'multi_point', 2, 0],
  ] as const)(
    'normalizes canonical terrain matrix for %s',
    (id, geoType, pointCount, regionCount) => {
      const canonical = canonicalEvent(id);
      expect(canonical).toBeDefined();
      const result = normalizeTerrainTargets(canonical?.id ?? '', canonical?.mapData);

      expect(result).toMatchObject({ canonicalGeoType: geoType, eligible: true, reason: null });
      expect(result.targets.filter((target) => target.kind === 'point')).toHaveLength(pointCount);
      expect(result.targets.filter((target) => target.kind === 'region')).toHaveLength(regionCount);
    },
  );

  it('normalizes a single point and falls back to a deterministic label', () => {
    const result = normalizeTerrainTargets('evt-1', {
      mapData: { geoType: 'point', marker: { lat: 16, lng: 108, confidence: 'high' } },
    });

    expect(result).toMatchObject({ canonicalGeoType: 'point', eligible: true, reason: null });
    expect(result.targets).toEqual([
      {
        id: 'evt-1:point:0',
        kind: 'point',
        label: 'Địa điểm 1',
        position: { lat: 16, lng: 108 },
        confidence: 'high',
        sourceIndex: 0,
      },
    ]);
  });

  it('rejects missing, non-numeric and out-of-range point coordinates', () => {
    const result = normalizeTerrainTargets('evt-2', {
      geoType: 'point',
      marker: { lat: '16', lng: 108 },
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('no_valid_targets');
    expect(result.diagnostics.map((item) => item.code)).toContain('invalid_point_marker');

    const outOfRange = normalizeTerrainTargets('evt-2', {
      geoType: 'point',
      marker: { lat: 91, lng: 108 },
    });
    expect(outOfRange.eligible).toBe(false);
  });

  it('keeps multi-point targets with duplicate coordinates and stable IDs', () => {
    const result = normalizeTerrainTargets('evt-multi', {
      geoType: 'multi_point',
      markers: [point('A'), point('B'), { ...point('invalid'), lat: Number.NaN }],
    });

    expect(result.targets.map((target) => target.id)).toEqual([
      'evt-multi:point:0',
      'evt-multi:point:1',
    ]);
    expect(result.targets.map((target) => target.label)).toEqual(['A', 'B']);
    expect(result.diagnostics.filter((item) => item.code === 'invalid_point_marker')).toHaveLength(1);
  });

  it('normalizes regions without resolving GeoJSON and handles missing names', () => {
    const result = normalizeTerrainTargets('evt-region', {
      geoType: 'multi_polygon',
      gadmRefs: ['VNM.1_1', '', 'VNM.1_1'],
      provinceNames: ['An Giang', 'Missing', 'Duplicate'],
    });

    expect(result.eligible).toBe(true);
    expect(result.targets).toEqual([
      {
        id: 'evt-region:region:VNM.1_1',
        kind: 'region',
        label: 'An Giang',
        gadmRef: 'VNM.1_1',
        provinceName: 'An Giang',
        sourceIndex: 0,
      },
      {
        id: 'evt-region:region:VNM.1_1:2',
        kind: 'region',
        label: 'Duplicate',
        gadmRef: 'VNM.1_1',
        provinceName: 'Duplicate',
        sourceIndex: 2,
      },
    ]);
    expect(result.diagnostics.map((item) => item.code)).toEqual([
      'invalid_gadm_ref',
      'duplicate_gadm_ref',
    ]);
  });

  it('handles mixed events, omitting only an identical primary-marker mirror', () => {
    const result = normalizeTerrainTargets('evt-mixed', {
      geoType: 'mixed',
      marker: point('Primary'),
      markers: [point('Primary'), point('Other')],
      gadmRefs: ['VNM.1_1'],
      provinceNames: ['An Giang'],
    });

    expect(result.eligible).toBe(true);
    expect(result.targets.map((target) => `${target.kind}:${target.label}`)).toEqual([
      'point:Primary',
      'point:Other',
      'region:An Giang',
    ]);
    expect(result.diagnostics.map((item) => item.code)).toContain(
      'primary_marker_mirrors_first_array_marker',
    );
  });

  it('keeps distinct IDs when mixed primary and array markers share a coordinate', () => {
    const result = normalizeTerrainTargets('evt-mixed-identity', {
      geoType: 'mixed',
      marker: point('Primary'),
      markers: [point('Different label')],
    });

    expect(result.targets.map((target) => target.id)).toEqual([
      'evt-mixed-identity:point:marker',
      'evt-mixed-identity:point:array:0',
    ]);
  });

  it('keeps mixed events eligible when only one target kind survives validation', () => {
    const pointOnly = normalizeTerrainTargets('evt-mixed-point', {
      geoType: 'mixed',
      marker: point('Point'),
      gadmRefs: [''],
    });
    expect(pointOnly.eligible).toBe(true);
    expect(pointOnly.targets).toHaveLength(1);

    const regionOnly = normalizeTerrainTargets('evt-mixed-region', {
      geoType: 'mixed',
      marker: { lat: 200, lng: 108 },
      gadmRefs: ['VNM.1_1'],
    });
    expect(regionOnly.eligible).toBe(true);
    expect(regionOnly.targets[0]?.kind).toBe('region');
  });

  it.each(['nationwide', 'no_location'] as const)('%s is unsupported', (geoType) => {
    const result = normalizeTerrainTargets('evt-unsupported', {
      geoType,
      marker: point('Should not be used'),
      gadmRefs: ['VNM.1_1'],
    });
    expect(result).toMatchObject({
      canonicalGeoType: geoType,
      targets: [],
      eligible: false,
      reason: 'unsupported_geo_type',
    });
  });

  it('reports missing map data, invalid type, malformed arrays and missing event ID', () => {
    expect(normalizeTerrainTargets('', undefined)).toMatchObject({
      canonicalGeoType: null,
      targets: [],
      eligible: false,
      reason: 'missing_map_data',
    });

    const invalid = normalizeTerrainTargets('', { mapData: { geoType: 'legacy_unknown' } });
    expect(invalid.reason).toBe('invalid_geo_type');
    expect(invalid.diagnostics.map((item) => item.code)).toEqual([
      'missing_event_id',
      'invalid_geo_type',
    ]);

    const malformed = normalizeTerrainTargets('evt-malformed', {
      geoType: 'multi_point',
      markers: 'not-an-array',
    });
    expect(malformed.reason).toBe('no_valid_targets');
    expect(malformed.diagnostics.map((item) => item.code)).toContain('invalid_markers_array');
  });

  it('handles region array length mismatch without guessing pairings', () => {
    const result = normalizeTerrainTargets('evt-mismatch', {
      geoType: 'multi_polygon',
      gadmRefs: ['VNM.1_1', 'VNM.7_1'],
      provinceNames: ['An Giang'],
    });
    expect(result.targets).toHaveLength(2);
    expect(result.targets[1]?.label).toBe('VNM.7_1');
    expect(result.diagnostics.map((item) => item.code)).toContain('region_arrays_length_mismatch');
  });
});
