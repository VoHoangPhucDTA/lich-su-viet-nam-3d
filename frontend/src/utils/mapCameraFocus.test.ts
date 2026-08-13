import { describe, expect, it } from 'vitest';
import { Cartesian3 } from 'cesium';
import type { HistoricalEvent } from '../types/event';
import { parseRegionGeoJSON } from './regionGeometry';
import {
  buildMapFocusCameraFrame,
  buildMapFocusSemanticSignature,
  MAP_MULTI_POINT_MINIMUM_RANGE_METERS,
  MAP_ORDINARY_CAMERA_PITCH_DEGREES,
  MAP_POINT_FOCUS_RANGE_METERS,
  mapFocusZoomToRange,
  parseMapFocusGeometry,
  shouldApplyMapFocusRequest,
} from './mapCameraFocus';

function event(overrides: Partial<HistoricalEvent>): HistoricalEvent {
  return {
    id: 'focus-event',
    name: 'Focus event',
    description: '',
    startYear: 1954,
    endYear: 1954,
    effectiveEndYear: 1954,
    eventType: 'military',
    geoType: 'point',
    coordinates: { lat: 21.386, lng: 103.023 },
    parentId: null,
    ...overrides,
  };
}

const regionIndex = parseRegionGeoJSON({
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
        coordinates: [[[107, 10.5], [108.5, 10.5], [108.5, 11.5], [107, 10.5]]],
      },
    },
    {
      type: 'Feature',
      properties: { GID_1: 'VNM.47_1', NAME_1: 'QuảngNam' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[107, 15], [109, 15], [109, 16.5], [107, 15]]],
      },
    },
  ],
});

function expectFrameContainsEveryPosition(
  frame: NonNullable<ReturnType<typeof buildMapFocusCameraFrame>>,
) {
  for (const position of frame.positions) {
    const point = Cartesian3.fromDegrees(position.lng, position.lat);
    expect(Cartesian3.distance(frame.sphere.center, point))
      .toBeLessThanOrEqual(frame.sphere.radius + 0.001);
  }
}

describe('CesiumMap ordinary selection focus', () => {
  it('keeps explicit ordinary navigation map-like and more top-down than terrain', () => {
    expect(MAP_ORDINARY_CAMERA_PITCH_DEGREES).toBe(-75);
  });

  it('uses the representative point at the 50 km map-focus range', () => {
    const frame = buildMapFocusCameraFrame(event({}));

    expect(frame?.positions).toEqual([{ lat: 21.386, lng: 103.023 }]);
    expect(frame?.range).toBe(MAP_POINT_FOCUS_RANGE_METERS);
    expect(frame?.range).toBeGreaterThanOrEqual(30_000);
    expect(frame?.range).toBeLessThanOrEqual(80_000);
  });

  it('fits every valid canonical multi-point marker with a bounded minimum range', () => {
    const markers = [
      { name: 'Him Lam', lat: 21.417, lng: 103.043 },
      { name: 'Độc Lập', lat: 21.458, lng: 103.002 },
      { name: 'A1', lat: 21.379, lng: 103.018 },
      { name: 'Mường Thanh', lat: 21.386, lng: 103.015 },
      { name: 'invalid', lat: 999, lng: 103 },
    ];
    const frame = buildMapFocusCameraFrame(event({
      geoType: 'multi_point',
      sourceMapData: { geoType: 'multi_point', markers },
    }));

    expect(frame?.positions).toEqual(markers.slice(0, 4).map(({ lat, lng }) => ({ lat, lng })));
    expect(frame?.sphere.radius).toBeGreaterThan(0);
    expect(frame?.range).toBeGreaterThanOrEqual(MAP_MULTI_POINT_MINIMUM_RANGE_METERS);
  });

  it('does not fake a point focus for region-only or non-locatable geography', () => {
    expect(buildMapFocusCameraFrame(event({ geoType: 'multi_polygon' }))).toBeNull();
    expect(buildMapFocusCameraFrame(event({ geoType: 'nationwide' }))).toBeNull();
    expect(buildMapFocusCameraFrame(event({ geoType: 'no_location' }))).toBeNull();
  });

  it('parses only approved bounds center and zoom metadata', () => {
    expect(parseMapFocusGeometry({
      mode: 'bounds', center: { lat: 16.05, lng: 108.2 }, zoom: 7,
    })).toEqual({ mode: 'bounds', center: { lat: 16.05, lng: 108.2 }, zoom: 7 });
    expect(parseMapFocusGeometry({ mode: 'auto', center: { lat: 16, lng: 108 }, zoom: 7 })).toBeNull();
    expect(parseMapFocusGeometry({ mode: 'bounds', center: { lat: 91, lng: 108 }, zoom: 7 })).toBeNull();
    expect(parseMapFocusGeometry({ mode: 'bounds', center: { lat: 16, lng: 181 }, zoom: 7 })).toBeNull();
    expect(parseMapFocusGeometry({ mode: 'bounds', center: { lat: 16, lng: 108 }, zoom: 25 })).toBeNull();
  });

  it.each([
    [5, 1_000_000],
    [6, 500_000],
    [7, 250_000],
    [8, 125_000],
  ])('maps authoring zoom %s to range %s', (zoom, range) => {
    expect(mapFocusZoomToRange(zoom)).toBe(range);
  });

  it('keeps valid authoring focus as a fallback for unresolved region geometry', () => {
    const sourceMapData = {
      geoType: 'multi_polygon',
      focusGeometry: { mode: 'bounds', center: { lat: 16.05, lng: 108.2 }, zoom: 7 },
    };
    expect(buildMapFocusCameraFrame(event({ geoType: 'multi_polygon', sourceMapData })))
      .toMatchObject({ kind: 'authoring-focus', positions: [{ lat: 16.05, lng: 108.2 }], range: 250_000 });
    expect(buildMapFocusCameraFrame(event({
      geoType: 'mixed',
      coordinates: undefined,
      sourceMapData,
    })))
      .toMatchObject({ kind: 'authoring-focus', range: 250_000 });
    expect(buildMapFocusCameraFrame(event({ geoType: 'mixed', sourceMapData })))
      .toMatchObject({ kind: 'point-geometry', range: MAP_MULTI_POINT_MINIMUM_RANGE_METERS });
    expect(buildMapFocusCameraFrame(event({ geoType: 'no_location', sourceMapData }))).toBeNull();
    expect(buildMapFocusCameraFrame(event({ geoType: 'nationwide', sourceMapData }))).toBeNull();
  });

  it('fits Sa Huỳnh from both resolved regions instead of the authored midpoint', () => {
    const frame = buildMapFocusCameraFrame(event({
      id: 'van-hoa-sa-huynh',
      geoType: 'multi_polygon',
      coordinates: undefined,
      primaryRegions: ['Quảng Bình', 'Bình Thuận'],
      sourceMapData: {
        geoType: 'multi_polygon',
        gadmRefs: ['VNM.46_1', 'VNM.11_1'],
        provinceNames: ['Quảng Bình', 'Bình Thuận'],
        focusGeometry: {
          mode: 'bounds',
          center: { lat: 14.264291, lng: 107.166252 },
          zoom: 7,
        },
      },
    }), regionIndex);

    expect(frame?.kind).toBe('region-geometry');
    expect(frame?.positions).toEqual(expect.arrayContaining([
      { lat: 18, lng: 107 },
      { lat: 10.5, lng: 108.5 },
    ]));
    expect(frame?.positions).not.toContainEqual({ lat: 14.264291, lng: 107.166252 });
    expectFrameContainsEveryPosition(frame!);
  });

  it('focuses Sa Huỳnh from summary province names before detail mapData exists', () => {
    const summary = event({
      id: 'van-hoa-sa-huynh',
      geoType: 'multi_polygon',
      coordinates: undefined,
      primaryRegions: ['Quảng Bình', 'Bình Thuận'],
      sourceMapData: undefined,
    });
    const frame = buildMapFocusCameraFrame(summary, regionIndex);

    expect(frame?.kind).toBe('region-geometry');
    expect(frame?.positions).toEqual(expect.arrayContaining([
      { lat: 18, lng: 107 },
      { lat: 10.5, lng: 108.5 },
    ]));
    expectFrameContainsEveryPosition(frame!);
  });

  it('deduplicates hydration when labels and GADM refs resolve to the same regions', () => {
    const summary = event({
      id: 'van-hoa-sa-huynh',
      geoType: 'multi_polygon',
      coordinates: undefined,
      primaryRegions: ['Quảng Bình', 'Bình Thuận'],
      sourceMapData: undefined,
    });
    const hydrated = event({
      ...summary,
      sourceMapData: {
        geoType: 'multi_polygon',
        gadmRefs: ['VNM.46_1', 'VNM.11_1'],
        provinceNames: ['Quảng Bình', 'Bình Thuận'],
      },
    });
    const summarySignature = buildMapFocusSemanticSignature(summary, regionIndex);
    const hydratedSignature = buildMapFocusSemanticSignature(hydrated, regionIndex);

    expect(summarySignature).toBe('van-hoa-sa-huynh|regions:VNM.11_1,VNM.46_1');
    expect(hydratedSignature).toBe(summarySignature);
    expect(shouldApplyMapFocusRequest(summarySignature, hydratedSignature, 'hydration'))
      .toBe(false);
  });

  it('allows hydration focus when the canonical resolved regions change', () => {
    const summary = event({
      id: 'region-change',
      geoType: 'multi_polygon',
      coordinates: undefined,
      primaryRegions: ['Quảng Bình'],
      sourceMapData: undefined,
    });
    const hydrated = event({
      ...summary,
      sourceMapData: {
        geoType: 'multi_polygon',
        gadmRefs: ['VNM.46_1', 'VNM.11_1'],
      },
    });
    const summarySignature = buildMapFocusSemanticSignature(summary, regionIndex);
    const hydratedSignature = buildMapFocusSemanticSignature(hydrated, regionIndex);

    expect(hydratedSignature).not.toBe(summarySignature);
    expect(shouldApplyMapFocusRequest(summarySignature, hydratedSignature, 'hydration'))
      .toBe(true);
  });

  it('keeps mixed signatures sensitive to both canonical regions and markers', () => {
    const mixed = event({
      id: 'mixed-focus',
      geoType: 'mixed',
      coordinates: undefined,
      primaryRegions: ['Quảng Nam'],
      sourceMapData: {
        markers: [{ name: 'Marker', lat: 16, lng: 110 }],
      },
    });
    const changedMarker = event({
      ...mixed,
      sourceMapData: {
        markers: [{ name: 'Marker', lat: 16.5, lng: 110 }],
      },
    });

    expect(buildMapFocusSemanticSignature(mixed, regionIndex))
      .toContain('regions:VNM.47_1|points:16,110');
    expect(buildMapFocusSemanticSignature(changedMarker, regionIndex))
      .not.toBe(buildMapFocusSemanticSignature(mixed, regionIndex));
  });

  it('fits one-region multi_polygon without top-level coordinates', () => {
    const frame = buildMapFocusCameraFrame(event({
      id: 'dat-them-thua-tuyen-quang-nam',
      geoType: 'multi_polygon',
      coordinates: undefined,
      primaryRegions: ['Quảng Nam'],
      sourceMapData: { gadmRefs: ['VNM.47_1'], provinceNames: ['Quảng Nam'] },
    }), regionIndex);

    expect(frame?.kind).toBe('region-geometry');
    expect(frame?.positions.length).toBeGreaterThan(1);
    expectFrameContainsEveryPosition(frame!);
  });

  it('fits the union of resolved regions and valid markers for mixed events', () => {
    const marker = { lat: 20, lng: 110 };
    const frame = buildMapFocusCameraFrame(event({
      geoType: 'mixed',
      coordinates: undefined,
      sourceMapData: {
        gadmRefs: ['VNM.47_1'],
        markers: [{ name: 'Distant marker', ...marker }],
      },
    }), regionIndex);

    expect(frame?.kind).toBe('combined-geometry');
    expect(frame?.positions).toContainEqual(marker);
    expect(frame?.positions).toContainEqual({ lat: 15, lng: 107 });
    expectFrameContainsEveryPosition(frame!);
  });
});
