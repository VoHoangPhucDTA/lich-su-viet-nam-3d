import { describe, expect, it } from 'vitest';
import type { HistoricalEvent } from '../types/event';
import {
  buildEventPolygonEntityId,
  normalizeRegionLookup,
  parseRegionGeoJSON,
  resolveEventRegions,
  resolveRegionGeometry,
  unionRegionBounds,
} from './regionGeometry';

const polygon = (coordinates: unknown) => ({
  type: 'Feature',
  properties: { GID_1: 'VNM.01_1', NAME_1: 'Alpha' },
  geometry: { type: 'Polygon', coordinates },
});

function event(overrides: Partial<HistoricalEvent> = {}): HistoricalEvent {
  return {
    id: 'region-event',
    name: 'Region event',
    description: '',
    startYear: 1,
    endYear: 1,
    effectiveEndYear: 1,
    eventType: 'cultural',
    geoType: 'multi_polygon',
    parentId: null,
    ...overrides,
  };
}

describe('regionGeometry', () => {
  it('builds and queries label keys with the same whitespace-insensitive normalizer', () => {
    const index = parseRegionGeoJSON({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { GID_1: 'VNM.46_1', NAME_1: 'QuảngBình' },
          geometry: {
            type: 'Polygon',
            coordinates: [[[106, 17], [107, 17], [107, 18], [106, 17]]],
          },
        },
        {
          type: 'Feature',
          properties: { GID_1: 'VNM.11_1', NAME_1: 'BìnhThuận' },
          geometry: {
            type: 'Polygon',
            coordinates: [[[107, 10], [108, 10], [108, 11], [107, 10]]],
          },
        },
      ],
    });

    expect(normalizeRegionLookup('Quảng Bình')).toBe(normalizeRegionLookup('QuảngBình'));
    expect(normalizeRegionLookup('Bình Thuận')).toBe(normalizeRegionLookup('BìnhThuận'));
    expect(resolveEventRegions(index, event({ primaryRegions: ['Quảng Bình', 'Bình Thuận'] }))
      .resolved.map((item) => item.geometry.gadmRef))
      .toEqual(['VNM.46_1', 'VNM.11_1']);
  });

  it('resolves Polygon and closes an open outer ring', () => {
    const index = parseRegionGeoJSON({
      type: 'FeatureCollection',
      features: [polygon([[[105, 10], [106, 10], [106, 11], [105, 10]]])],
    });
    const resolved = resolveRegionGeometry(index, 'VNM.01_1');
    expect(resolved?.polygons).toHaveLength(1);
    expect(resolved?.polygons[0][0][0]).toEqual(resolved?.polygons[0][0].at(-1));
  });

  it('keeps multiple MultiPolygon parts and holes while bounding outer rings', () => {
    const index = parseRegionGeoJSON({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { GID_1: 'VNM.02_1' },
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            [[[100, 10], [101, 10], [101, 11], [100, 10]]],
            [[[105, 12], [107, 12], [107, 14], [105, 12]], [[105.5, 12.5], [106, 12.5], [105.5, 13], [105.5, 12.5]]],
          ],
        },
      }],
    });
    const resolved = resolveRegionGeometry(index, 'VNM.02_1');
    expect(resolved?.polygons).toHaveLength(2);
    expect(resolved?.polygons[1]).toHaveLength(2);
    expect(resolved?.bounds).toEqual({ west: 100, east: 107, south: 10, north: 14 });
  });

  it('fails safely for malformed features and requires exact GID lookup', () => {
    const index = parseRegionGeoJSON({
      type: 'FeatureCollection',
      features: [
        polygon([[[105, 10], ['bad', 10], [106, 11]]]),
        { type: 'Feature', properties: { NAME_1: 'Alpha' }, geometry: null },
        { type: 'Feature', properties: { GID_1: 'VNM.03_1' }, geometry: { type: 'LineString', coordinates: [] } },
      ],
    });
    expect(resolveRegionGeometry(index, 'Alpha')).toBeNull();
    expect(index.features).toHaveLength(0);
    expect(index.diagnostics.map((item) => item.code)).toEqual([
      'invalid_region_coordinates',
      'feature_missing_gadm_ref',
      'unsupported_geometry',
    ]);
  });

  it('unions bounds without turning holes into targets', () => {
    const index = parseRegionGeoJSON({
      type: 'FeatureCollection',
      features: [polygon([[[105, 10], [106, 10], [106, 11], [105, 10]]])],
    });
    const geometry = resolveRegionGeometry(index, 'VNM.01_1');
    expect(unionRegionBounds(geometry ? [geometry] : [])).toEqual({
      west: 105, east: 106, south: 10, north: 11,
    });
  });

  it('uses shared GADM-first resolution and falls back when that source resolves nothing', () => {
    const index = parseRegionGeoJSON({
      type: 'FeatureCollection',
      features: [polygon([[[105, 10], [106, 10], [106, 11], [105, 10]]])],
    });

    const byGadm = resolveEventRegions(index, event({
      sourceMapData: {
        gadmRefs: ['VNM.01_1'],
        provinceNames: ['Wrong label'],
      },
      primaryRegions: ['Also wrong'],
    }));
    expect(byGadm.source).toBe('gadmRefs');
    expect(byGadm.resolved.map((item) => item.geometry.gadmRef)).toEqual(['VNM.01_1']);

    const byProvinceFallback = resolveEventRegions(index, event({
      sourceMapData: {
        gadmRefs: ['VNM.missing'],
        provinceNames: [' Alpha '],
      },
    }));
    expect(byProvinceFallback.source).toBe('sourceProvinceNames');
    expect(byProvinceFallback.resolved.map((item) => item.geometry.gadmRef)).toEqual(['VNM.01_1']);
  });

  it('builds deterministic unique polygon IDs across region references', () => {
    expect(buildEventPolygonEntityId('van-hoa-sa-huynh', 'VNM.46_1', 0))
      .toBe('van-hoa-sa-huynh:polygon:VNM.46_1:0');
    expect(buildEventPolygonEntityId('van-hoa-sa-huynh', 'VNM.11_1', 0))
      .toBe('van-hoa-sa-huynh:polygon:VNM.11_1:0');
    expect(buildEventPolygonEntityId('van-hoa-sa-huynh', 'VNM.46_1', 0))
      .not.toBe(buildEventPolygonEntityId('van-hoa-sa-huynh', 'VNM.11_1', 0));
  });
});
