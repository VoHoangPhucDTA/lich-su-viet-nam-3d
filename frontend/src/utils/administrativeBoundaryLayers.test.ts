import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  ADMINISTRATIVE_BOUNDARY_LAYERS,
  DEFAULT_ADMINISTRATIVE_BOUNDARY_LAYER_ID,
  getAdministrativeBoundaryLayer,
  loadAdministrativeBoundaryLayer,
  normalizeAdministrativeName,
  VIETNAM_2026_34_LAYER_ID,
} from './administrativeBoundaryLayers';

const EXPECTED_GIS_NAMES = [
  'An Giang', 'Bắc Ninh', 'Cà Mau', 'Cần Thơ', 'Cao Bằng', 'Đà Nẵng',
  'Đắk Lắk', 'Điện Biên', 'Đồng Nai', 'Đồng Tháp', 'Gia Lai', 'Hà Nội',
  'Hà Tĩnh', 'Hải Phòng', 'Huế', 'Hưng Yên', 'Khánh Hòa', 'Lai Châu',
  'Lâm Đồng', 'Lạng Sơn', 'Lào Cai', 'Nghệ An', 'Ninh Bình', 'Phú Thọ',
  'Quảng Ngãi', 'Quảng Ninh', 'Quảng Trị', 'Sơn La', 'Tây Ninh',
  'Thái Nguyên', 'Thanh Hóa', 'TP. Hồ Chí Minh', 'Tuyên Quang', 'Vĩnh Long',
];

function readLocalDataset(): {
  type: string;
  features: Array<{ properties: { ten_tinh: string }; geometry: { type: string; coordinates: unknown } }>;
} {
  return JSON.parse(readFileSync(
    resolve(process.cwd(), 'public/geojson/vietnam-provinces-2026-34.geojson'),
    'utf8',
  )) as ReturnType<typeof readLocalDataset>;
}

function coordinatePairs(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];
  if (value.length >= 2 && value.every((item) => typeof item === 'number')) {
    return [value as number[]];
  }
  return value.flatMap(coordinatePairs);
}

describe('Vietnam 2026 administrative boundary reference layer', () => {
  it('keeps the downloaded GIS.vn dataset at exactly 34 non-empty MultiPolygon features', () => {
    const dataset = readLocalDataset();
    const names = dataset.features.map((feature) => feature.properties.ten_tinh);

    expect(dataset.type).toBe('FeatureCollection');
    expect(dataset.features).toHaveLength(34);
    expect([...names].sort()).toEqual([...EXPECTED_GIS_NAMES].sort());
    expect(new Set(names.map(normalizeAdministrativeName)).size).toBe(34);

    for (const feature of dataset.features) {
      expect(feature.geometry.type).toBe('MultiPolygon');
      const coordinates = coordinatePairs(feature.geometry.coordinates);
      expect(coordinates.length).toBeGreaterThan(0);
      expect(coordinates.every(([lng, lat]) => (
        lng >= 100 && lng <= 121 && lat >= 4 && lat <= 25
      ))).toBe(true);
    }
  });

  it('registers the new layer without changing the existing GADM source path', () => {
    expect(getAdministrativeBoundaryLayer(DEFAULT_ADMINISTRATIVE_BOUNDARY_LAYER_ID).url)
      .toBe('/geojson/vietnam-provinces.json');
    expect(getAdministrativeBoundaryLayer(VIETNAM_2026_34_LAYER_ID).url)
      .toBe('/geojson/vietnam-provinces-2026-34.geojson');
    expect(ADMINISTRATIVE_BOUNDARY_LAYERS.map(({ id }) => id)).toEqual([
      DEFAULT_ADMINISTRATIVE_BOUNDARY_LAYER_ID,
      VIETNAM_2026_34_LAYER_ID,
    ]);
  });

  it('turns fetch failure into a nonfatal result for the map host', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const result = await loadAdministrativeBoundaryLayer(
      getAdministrativeBoundaryLayer(VIETNAM_2026_34_LAYER_ID),
      fetchImpl as typeof fetch,
    );

    expect(result.status).toBe('error');
    expect(fetchImpl).toHaveBeenCalledWith('/geojson/vietnam-provinces-2026-34.geojson');
  });
});
